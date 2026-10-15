import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
export const databasePath=path.resolve(process.env.STUDIO_DB_PATH||'data/studio.sqlite');
mkdirSync(path.dirname(databasePath),{recursive:true});
export const sqlite=new DatabaseSync(databasePath);
sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY);');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
 if(sqlite.prepare('SELECT name FROM schema_migrations WHERE name=?').get(file))continue;
 sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(readFileSync(path.join('drizzle',file),'utf8'));sqlite.prepare('INSERT INTO schema_migrations(name) VALUES(?)').run(file);sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}
}
type Result={results:Record<string,unknown>[];meta:{changes:number}};
class Query{
 constructor(private sql:string,private args:unknown[]=[]){ }
 bind(...args:unknown[]){return new Query(this.sql,args)}
 execute():Result{const s=sqlite.prepare(this.sql);const args=this.args.map(v=>v??null) as SQLInputValue[];if(s.columns().length)return {results:s.all(...args),meta:{changes:0}};const result=s.run(...args);return {results:[],meta:{changes:Number(result.changes)}}}
 async all(){return this.execute()}
}
export function database(){return {prepare:(sql:string)=>new Query(sql),batch:async(queries:Query[])=>{sqlite.exec('BEGIN IMMEDIATE');try{const results=queries.map(q=>q.execute());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
export async function rows(sql:string,args:unknown[]=[]){return (await database().prepare(sql).bind(...args).all()).results}
export async function snapshot(){
 const names=['clients','services','categories','movements','goals','reserves','invoices','issues','payments','settings'] as const;
 const result=await database().batch(names.map(t=>database().prepare(t==='movements'?`SELECT m.*, c.name client_name, s.name service_name, cat.name category_name, COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.debt_id=m.id),0) paid_cents FROM movements m LEFT JOIN clients c ON c.id=m.client_id LEFT JOIN services s ON s.id=m.service_id LEFT JOIN categories cat ON cat.id=m.category_id WHERE m.deleted=0 ORDER BY m.date DESC,m.id`:`SELECT * FROM ${t}`)));
 return Object.fromEntries(names.map((n,i)=>[n,result[i].results]));
}
