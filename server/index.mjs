import {createServer} from 'node:http';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {readFileSync,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {GET as handle} from '../app/api/[...path]/route.ts';
import {sqlite,databasePath} from '../lib/database.ts';
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000);
const hash=v=>createHash('sha256').update(v).digest('hex');
const secure=process.env.SECURE_COOKIE==='true';
const sessionsCookie=(token,maxAge)=>`studio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
const attempts=new Map();
function json(res,body,status=200,headers={}){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body))}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const root=path.resolve('dist/client');
const server=createServer(async(req,res)=>{try{
 const base=`http://${req.headers.host||'localhost:'+port}`;const url=new URL(req.url,base);
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
 if(url.pathname.startsWith('/api/')){
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536){json(res,{error:'Solicitação muito grande.'},413);return}chunks.push(chunk)}const body=Buffer.concat(chunks).toString();
  if(req.method!=='GET'&&req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==url.host){json(res,{error:'Origem inválida.'},403);return}}
  const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('studio_session='))?.slice(15);
  const session=token?sqlite.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires>?').get(hash(token),Date.now()):null;
  if(url.pathname==='/api/auth/status'){json(res,{setup:!sqlite.prepare('SELECT id FROM users LIMIT 1').get(),authenticated:!!session});return}
  if(url.pathname==='/api/auth/logout'&&req.method==='POST'){if(token)sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));json(res,{ok:true},200,{'Set-Cookie':sessionsCookie('',0)});return}
  if(['/api/auth/setup','/api/auth/login'].includes(url.pathname)&&req.method==='POST'){
   const ip=req.socket.remoteAddress;const entry=attempts.get(ip)||{count:0,until:Date.now()+900000};if(entry.until<Date.now()){entry.count=0;entry.until=Date.now()+900000}if(entry.count>=10){json(res,{error:'Muitas tentativas. Aguarde 15 minutos.'},429);return}
   let v;try{v=JSON.parse(body)}catch{json(res,{error:'Dados inválidos.'},400);return}
   if(typeof v.password!=='string'||v.password.length<(url.pathname.endsWith('/setup')?8:1)||v.password.length>128){json(res,{error:'A senha deve ter entre 8 e 128 caracteres.'},400);return}
   let user=sqlite.prepare('SELECT * FROM users LIMIT 1').get();
   if(url.pathname.endsWith('/setup')){
    if(user){json(res,{error:'A conta já foi configurada.'},409);return}
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)){json(res,{error:'Configure a primeira conta no próprio servidor.'},403);return}
    if(typeof v.name!=='string'||!v.name.trim()||v.name.length>100){json(res,{error:'Informe seu nome.'},400);return}
    const salt=randomBytes(16).toString('hex');const id=randomUUID();sqlite.prepare('INSERT INTO users(id,name,password_hash,salt) VALUES(?,?,?,?)').run(id,v.name.trim(),scryptSync(v.password,salt,64).toString('hex'),salt);user={id};
   }else{
    const actual=scryptSync(v.password,user?.salt||'invalid-login-salt',64);const expected=user?Buffer.from(user.password_hash,'hex'):Buffer.alloc(64);if(!user||v.name!==user.name||!timingSafeEqual(actual,expected)){entry.count++;attempts.set(ip,entry);json(res,{error:'Usuário ou senha incorretos.'},401);return}
   }
   attempts.delete(ip);sqlite.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const sessionToken=randomBytes(32).toString('hex');sqlite.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(hash(sessionToken),user.id,Date.now()+7*86400000);json(res,{ok:true},200,{'Set-Cookie':sessionsCookie(sessionToken,7*86400)});return;
  }
  const headers=new Headers({'Content-Type':req.headers['content-type']||'application/json'});if(req.headers.origin)headers.set('origin',req.headers.origin);if(session)headers.set('oai-authenticated-user-id',session.user_id);
  const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body});const result=await handle(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){json(res,{error:'Método não permitido.'},405);return}
 let requested=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!requested.startsWith(root+path.sep)&&requested!==root){res.writeHead(403);res.end();return}if(!existsSync(requested)||!statSync(requested).isFile()){if(path.extname(requested)){res.writeHead(404);res.end();return}requested=path.join(root,'index.html')}
 if(!existsSync(requested)){res.writeHead(503);res.end('Compile o frontend com npm run build.');return}
 res.setHeader('Content-Type',mime[path.extname(requested)]||'application/octet-stream');res.setHeader('Cache-Control',path.basename(requested)==='index.html'?'no-cache':'public, max-age=3600');res.end(req.method==='HEAD'?undefined:readFileSync(requested));
 }catch(e){console.error('Studio server:',e.message);if(!res.headersSent)json(res,{error:'Não foi possível processar a solicitação.'},500);else res.end()}});
server.listen(port,host,()=>console.log(`Studio KS disponível em http://${host}:${port}\nBanco: ${databasePath}`));
process.on('SIGINT',()=>server.close(()=>{sqlite.close();process.exit(0)}));

