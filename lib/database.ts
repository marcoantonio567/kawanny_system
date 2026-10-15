import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { migrations } from './migrations';
import publicSeed from '../data/seed.json';

pg.types.setTypeParser(20,Number);
export const cloud = !!process.env.DATABASE_URL;
export const databasePath=path.resolve(process.env.STUDIO_DB_PATH||'data/studio.sqlite');
const sqlite = cloud ? null : (() => {
  mkdirSync(path.dirname(databasePath),{recursive:true});
  const db=new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  return db;
})();
if(process.env.VERCEL && !cloud) throw new Error('DATABASE_URL nÃ£o configurada.');
const pool = cloud ? new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:20000,allowExitOnIdle:true}) : null;
export function loadSeed(): typeof publicSeed {
  const local=path.resolve('data/seed.local.json');
  return !cloud && existsSync(local) ? JSON.parse(readFileSync(local,'utf8')) : publicSeed;
}
function postgresSQL(sql:string,previousChanges=0) {
  let i=0;
  return sql.replace(/`/g,'"').replace(/changes\(\)/gi,String(previousChanges)).replace(/\?/g,()=>'$'+(++i));
}
let initialization:Promise<void>|undefined;
export function ready() {
  return initialization ??= initialize().catch(error=>{initialization=undefined;throw error});
}
async function initialize() {
  if(pool) {
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(7182441)');
      await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY)');
      for(const m of migrations) {
        if((await c.query('SELECT name FROM schema_migrations WHERE name=$1',[m.name])).rows.length)continue;
        const statements=postgresSQL(m.sql).replace(/\binteger\b/gi,'bigint').replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
        const rank=(s:string)=>/^CREATE TABLE "?services"?\b/i.test(s)?0:/^CREATE TABLE "?movements"?\b/i.test(s)?2:/^CREATE TABLE "?payments"?\b/i.test(s)?3:/^CREATE TABLE/i.test(s)?1:4;
        statements.sort((a,b)=>rank(a)-rank(b));
        await c.query(statements.join(';'));
        await c.query('INSERT INTO schema_migrations(name) VALUES($1)',[m.name]);
      }
      await c.query('COMMIT');
    } catch(error) {await c.query('ROLLBACK');throw error} finally {c.release()}
  } else {
    sqlite!.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY)');
    for(const m of migrations) {
      if(sqlite!.prepare('SELECT name FROM schema_migrations WHERE name=?').get(m.name))continue;
      sqlite!.exec('BEGIN IMMEDIATE');
      try {sqlite!.exec(m.sql);sqlite!.prepare('INSERT INTO schema_migrations(name) VALUES(?)').run(m.name);sqlite!.exec('COMMIT')}
      catch(error){sqlite!.exec('ROLLBACK');throw error}
    }
  }
}
type Result={results:Record<string,unknown>[];meta:{changes:number}};
class Query {
  constructor(public sql:string,public args:unknown[]=[]){ }
  bind(...args:unknown[]){return new Query(this.sql,args)}
  async all():Promise<Result>{return (await batch([this]))[0]}
}
async function batch(queries:Query[]):Promise<Result[]> {
  await ready();
  if(pool) {
    const c=await pool.connect();
    try {
      await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7182442)');let changes=0;const results:Result[]=[];
      for(const q of queries){const r=await c.query(postgresSQL(q.sql,changes),q.args.map(v=>v??null));changes=r.command==='SELECT'?0:r.rowCount??0;results.push({results:r.rows,meta:{changes}})}
      await c.query('COMMIT');return results;
    }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
  }
  sqlite!.exec('BEGIN IMMEDIATE');
  try {
    const results=queries.map(q=>{const s=sqlite!.prepare(q.sql);const args=q.args.map(v=>v??null) as SQLInputValue[];if(s.columns().length)return {results:s.all(...args),meta:{changes:0}};const r=s.run(...args);return {results:[],meta:{changes:Number(r.changes)}}});
    sqlite!.exec('COMMIT');return results;
  }catch(error){sqlite!.exec('ROLLBACK');throw error}
}
export function database(){return {prepare:(sql:string)=>new Query(sql),batch}}
export async function rows(sql:string,args:unknown[]=[]){return (await new Query(sql,args).all()).results}
export async function closeDatabase(){if(pool)await pool.end();else sqlite?.close()}
export async function snapshot(){
 const names=['clients','services','categories','movements','goals','reserves','invoices','issues','payments','settings'] as const;
 const result=await batch(names.map(t=>new Query(t==='movements'?`SELECT m.*, c.name client_name, s.name service_name, cat.name category_name, COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.debt_id=m.id),0) paid_cents FROM movements m LEFT JOIN clients c ON c.id=m.client_id LEFT JOIN services s ON s.id=m.service_id LEFT JOIN categories cat ON cat.id=m.category_id WHERE m.deleted=0 ORDER BY m.date DESC,m.id`:`SELECT * FROM ${t}`)));
 return Object.fromEntries(names.map((n,i)=>[n,result[i].results]));
}
