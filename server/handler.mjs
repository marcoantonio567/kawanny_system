import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {readFileSync,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {GET as handle} from '../app/api/[...path]/route.ts';
import {database,rows,ready,cloud} from '../lib/database.ts';
const hash=value=>createHash('sha256').update(value).digest('hex');
const cookie=(token,maxAge,secure)=>`studio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
function json(res,body,status=200,headers={}){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body))}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const root=path.resolve('dist/client');
export default async function handler(req,res){try{
 const protocol=process.env.VERCEL?'https':(process.env.SECURE_COOKIE==='true'?'https':'http');
 const url=new URL(req.url,`${protocol}://${req.headers.host||'localhost'}`);
 const secure=protocol==='https';
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 if(url.pathname.startsWith('/api/')){
  await ready();const db=database();
  let body='';
  if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else {const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536){json(res,{error:'Solicitação muito grande.'},413);return}chunks.push(chunk)}body=Buffer.concat(chunks).toString()}
  if(Buffer.byteLength(body)>65536){json(res,{error:'Solicitação muito grande.'},413);return}
  if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!==url.origin){json(res,{error:'Origem inválida.'},403);return}
  const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('studio_session='))?.slice(15);
  const session=token?(await rows('SELECT user_id FROM sessions WHERE token_hash=? AND expires>?',[hash(token),Date.now()]))[0]:null;
  if(url.pathname==='/api/auth/status'){json(res,{setup:!cloud&&!(await rows('SELECT id FROM users LIMIT 1')).length,authenticated:!!session});return}
  if(url.pathname==='/api/auth/logout'&&req.method==='POST'){if(token)await db.batch([db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash(token))]);json(res,{ok:true},200,{'Set-Cookie':cookie('',0,secure)});return}
  if(['/api/auth/setup','/api/auth/login'].includes(url.pathname)&&req.method==='POST'){
   const setup=url.pathname.endsWith('/setup');
   const ip=process.env.VERCEL?String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim():req.socket.remoteAddress;
   if(setup&&(cloud||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))){json(res,{error:'A criação de conta está disponível somente no computador local.'},403);return}
   const key=hash('login:'+ip);const attempt=(await rows('SELECT count,expires FROM auth_attempts WHERE key=?',[key]))[0];
   if(attempt&&Number(attempt.expires)>Date.now()&&Number(attempt.count)>=10){json(res,{error:'Muitas tentativas. Aguarde 15 minutos.'},429);return}
   let v;try{v=JSON.parse(body)}catch{json(res,{error:'Dados inválidos.'},400);return}
   if(typeof v.password!=='string'||v.password.length<(setup?8:1)||v.password.length>128||typeof v.name!=='string'||!v.name.trim()||v.name.length>100){json(res,{error:'Informe o usuário e uma senha válida.'},400);return}
   let user=(await rows('SELECT * FROM users LIMIT 1'))[0];
   if(setup){
    if(user){json(res,{error:'A conta já foi configurada.'},409);return}
    const salt=randomBytes(16).toString('hex');const id=randomUUID();
    await db.batch([db.prepare('INSERT INTO users(id,name,password_hash,salt) VALUES(?,?,?,?)').bind(id,v.name.trim(),scryptSync(v.password,salt,64).toString('hex'),salt)]);user={id};
   }else{
    const actual=scryptSync(v.password,user?.salt||'invalid-login-salt',64);const expected=user?Buffer.from(user.password_hash,'hex'):Buffer.alloc(64);
    if(!user||v.name!==user.name||!timingSafeEqual(actual,expected)){
     await db.batch([db.prepare('INSERT INTO auth_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_attempts.expires<? THEN 1 ELSE auth_attempts.count+1 END, expires=CASE WHEN auth_attempts.expires<? THEN excluded.expires ELSE auth_attempts.expires END').bind(key,Date.now()+900000,Date.now(),Date.now())]);
     json(res,{error:'Usuário ou senha incorretos.'},401);return;
    }
   }
   const sessionToken=randomBytes(32).toString('hex');
   await db.batch([db.prepare('DELETE FROM auth_attempts WHERE key=? OR expires<?').bind(key,Date.now()),db.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(hash(sessionToken),user.id,Date.now()+7*86400000)]);
   json(res,{ok:true},200,{'Set-Cookie':cookie(sessionToken,7*86400,secure)});return;
  }
  const headers=new Headers({'Content-Type':req.headers['content-type']||'application/json'});if(req.headers.origin)headers.set('origin',req.headers.origin);if(session)headers.set('oai-authenticated-user-id',String(session.user_id));
  const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body});const result=await handle(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){json(res,{error:'Método não permitido.'},405);return}
 let requested=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!requested.startsWith(root+path.sep)&&requested!==root){res.writeHead(403);res.end();return}if(!existsSync(requested)||!statSync(requested).isFile()){if(path.extname(requested)){res.writeHead(404);res.end();return}requested=path.join(root,'index.html')}
 if(!existsSync(requested)){res.writeHead(503);res.end('Compile o frontend com npm run build.');return}
 res.setHeader('Content-Type',mime[path.extname(requested)]||'application/octet-stream');res.setHeader('Cache-Control',path.basename(requested)==='index.html'?'no-cache':'public, max-age=3600');res.end(req.method==='HEAD'?undefined:readFileSync(requested));
 }catch(error){console.error('Studio request failed:',error.code||error.name);if(!res.headersSent)json(res,{error:'Não foi possível processar a solicitação.'},500);else res.end()}}
