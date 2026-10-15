import { database, rows, snapshot, loadSeed } from '@/lib/database';
import { schemas, date, type Entity } from '@/lib/validation';

import { z, ZodError } from 'zod';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
class HttpError extends Error{constructor(message:string,public status=400){super(message)}}
async function handle(req:Request){
 try{
  const actor=req.headers.get('oai-authenticated-user-id');
  if(!actor)throw new HttpError('Entre com sua conta para acessar o Studio KS.',401);
  if(req.method!=='GET'){
   const origin=req.headers.get('origin');
   if(origin&&origin!==new URL(req.url).origin)throw new HttpError('Origem da solicitação inválida.',403);
  }
  const url=new URL(req.url);const parts=url.pathname.split('/').filter(Boolean).slice(1);const [entity,id]=parts;
  const db=database();
  if(req.method==='GET'&&entity==='data')return json(await snapshot());
  if(req.method==='GET'&&entity==='backup')return new Response(JSON.stringify(await snapshot(),null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="studio-ks-backup.json"','Cache-Control':'no-store'}});
  if(req.method==='POST'&&entity==='bootstrap'){
   const seed=loadSeed();
   if((await rows("SELECT id FROM settings WHERE id='imported'"))[0])return json({imported:true});
   const statements=[db.prepare("INSERT INTO settings(id,value) VALUES ('imported',?)").bind(seed.metadata.sha256),db.prepare("INSERT INTO settings(id,value) VALUES ('business_name',?)").bind('Studio KS')];
   for(const table of ['clients','services','categories','movements','goals','reserves','invoices','issues'] as const){
    const records=seed[table] as unknown as Record<string,unknown>[];if(!records.length)continue;
    const fields=Object.keys(records[0]);const size=Math.floor(95/fields.length);
    for(let i=0;i<records.length;i+=size){const chunk=records.slice(i,i+size);statements.push(db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES ${chunk.map(()=>`(${fields.map(()=>'?').join(',')})`).join(',')}`).bind(...chunk.flatMap(r=>fields.map(k=>r[k]??null))));}
   }
   statements.push(db.prepare('INSERT INTO audit(id,actor,action,entity,record_id,after,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,'import','workbook',seed.metadata.sha256,JSON.stringify(seed.metadata),new Date().toISOString()));
   try{await db.batch(statements)}catch(e){if(!(await rows("SELECT id FROM settings WHERE id='imported'"))[0])throw e;}
   return json({imported:true});
  }
  if(req.method==='POST'&&entity==='payments'){
   const v=z.object({debt_id:z.string(),date,amount_cents:z.number().int().positive(),payment:z.enum(['Pix','Cartão','Dinheiro','Débito','Crédito'])}).parse(await req.json());
   const debt=(await rows("SELECT * FROM movements WHERE id=? AND status='pending' AND deleted=0",[v.debt_id]))[0];
   if(!debt)throw new HttpError('Venda a prazo não encontrada.',404);
   if(v.date<String(debt.date))throw new HttpError('Recebimento não pode ser anterior à venda.');
   const pid=crypto.randomUUID(),mid=crypto.randomUUID();
   const result=await db.batch([
    db.prepare("INSERT INTO movements(id,date,kind,description,amount_cents,payment,status,client_id,notes) SELECT ?,?,'income','Recebimento de venda a prazo',?,?,'paid',?,? WHERE ? <= (SELECT amount_cents-COALESCE((SELECT SUM(amount_cents) FROM payments WHERE debt_id=?),0) FROM movements WHERE id=? AND deleted=0 AND status='pending' AND kind='income')").bind(mid,v.date,v.amount_cents,v.payment,debt.client_id,`Venda ${v.debt_id}`,v.amount_cents,v.debt_id,v.debt_id),
    db.prepare('INSERT INTO payments(id,debt_id,movement_id,date,amount_cents) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM movements WHERE id=?)').bind(pid,v.debt_id,mid,v.date,v.amount_cents,mid),
    db.prepare("INSERT INTO audit(id,actor,action,entity,record_id,after,created_at) SELECT ?,?,'payment','movements',?,?,? WHERE EXISTS(SELECT 1 FROM movements WHERE id=?)").bind(crypto.randomUUID(),actor,v.debt_id,JSON.stringify(v),new Date().toISOString(),mid)
   ]);
   if(!result[0].meta.changes)throw new HttpError('O valor excede o saldo pendente. Atualize e tente novamente.');
   return json({id:pid},201);
  }
  if(req.method==='POST'&&entity==='corrections'){
   const payload=z.object({issue_id:z.string(),movement:schemas.movements}).parse(await req.json());
   const issue=(await rows('SELECT * FROM issues WHERE id=? AND resolved=0',[payload.issue_id]))[0];
   if(!issue)throw new HttpError('Este registro já foi revisado.',409);
   if(!String(issue.reason).includes('não contabilizado')&&!String(issue.reason).includes('Data inválida'))throw new HttpError('Este aviso não corresponde a um lançamento excluído da importação.');
   const v=payload.movement;
   if(v.category_id){const c=(await rows('SELECT kind FROM categories WHERE id=?',[v.category_id]))[0];if(!c||c.kind!==v.kind)throw new HttpError('Categoria incompatível.');}
   const values={...v,category_id:v.category_id||null,service_id:v.kind==='income'?v.service_id||null:null,client_id:v.kind==='income'?v.client_id||null:null,due_date:v.due_date||null,source:String(issue.source)};
   // A stable correction ID prevents duplicate entry during concurrent review.
   const recordId='correction-'+payload.issue_id;const fields=['id',...Object.keys(values)];
   await db.batch([db.prepare(`INSERT INTO movements(${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).bind(recordId,...Object.values(values)),db.prepare('UPDATE issues SET resolved=1 WHERE id=?').bind(issue.id),db.prepare("INSERT INTO audit(id,actor,action,entity,record_id,after,created_at) VALUES (?,?,'correction','movements',?,?,?)").bind(crypto.randomUUID(),actor,recordId,JSON.stringify(values),new Date().toISOString())]);
   return json({id:recordId},201);
  }
  if(!Object.hasOwn(schemas,entity))throw new HttpError('Recurso não encontrado.',404);
  const table=entity as Entity;
  if(!['POST','PUT','DELETE'].includes(req.method))throw new HttpError('Método não permitido.',405);
  const before=id?(await rows(`SELECT * FROM ${table} WHERE id=?`,[id]))[0]:null;
  if(req.method!=='POST'&&!before)throw new HttpError('Registro não encontrado.',404);
  if(table==='movements'&&id){
   const linked=await rows('SELECT id FROM payments WHERE debt_id=? OR movement_id=? LIMIT 1',[id,id]);
   if(linked.length)throw new HttpError('Este lançamento tem recebimentos vinculados e não pode ser alterado.');
  }
  if(req.method==='DELETE'&&(table==='issues'||table==='goals'))throw new HttpError('Este registro não pode ser excluído.');
  const values=req.method==='DELETE'?null:schemas[table].parse(await req.json()) as Record<string,unknown>;
  if(table==='issues'&&req.method!=='PUT')throw new HttpError('A revisão permite apenas atualização.');
  if(table==='categories'&&before&&values&&before.kind!==values.kind&&(await rows('SELECT id FROM movements WHERE category_id=? LIMIT 1',[id])).length)throw new HttpError('Esta categoria já possui lançamentos. Crie outra categoria para mudar o tipo.');
  if(table==='movements'&&values){
   if(values.category_id){const c=(await rows('SELECT kind FROM categories WHERE id=?',[values.category_id]))[0];if(!c||c.kind!==values.kind)throw new HttpError('A categoria deve corresponder ao tipo do lançamento.');}
   if(values.kind==='expense'){values.service_id=null;values.client_id=null;}
  }
  const recordId=id||crypto.randomUUID();let sql:string;let args:unknown[];
  if(req.method==='DELETE'){sql=table==='movements'?`UPDATE movements SET deleted=1 WHERE id=?`:`DELETE FROM ${table} WHERE id=?`;args=[recordId];}
  else if(req.method==='PUT'){const fields=Object.keys(values!);sql=`UPDATE ${table} SET ${fields.map(k=>`${k}=?`).join(',')} WHERE id=?`;args=[...Object.values(values!),recordId];}
  else{const fields=['id',...Object.keys(values!)];sql=`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`;args=[recordId,...Object.values(values!)];}
  if(table==='movements'&&id){sql+=' AND NOT EXISTS(SELECT 1 FROM payments WHERE debt_id=? OR movement_id=?)';args.push(id,id);}
  const result=await db.batch([db.prepare(sql).bind(...args),db.prepare('INSERT INTO audit(id,actor,action,entity,record_id,before,after,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),actor,req.method,table,recordId,before?JSON.stringify(before):null,values?JSON.stringify(values):null,new Date().toISOString())]);
  if(!result[0].meta.changes)throw new HttpError('Registro alterado por outra operação. Atualize e tente novamente.',409);
  return json({id:recordId},req.method==='POST'?201:200);
 }catch(e){
  if(e instanceof ZodError)return json({error:e.issues.map(i=>i.message).join(' ')},400);
  if(e instanceof HttpError)return json({error:e.message},e.status);
  console.error('Studio KS request failed',e);
  if(/foreign key/i.test(String(e)))return json({error:'Registro vinculado a outros dados. Edite ou desative o cadastro.'},409);
  if(/unique/i.test(String(e)))return json({error:'Já existe um registro para este mês.'},409);
  return json({error:'Não foi possível concluir a operação. Tente novamente.'},500);
 }
}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE};
