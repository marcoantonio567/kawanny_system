import {DatabaseSync} from 'node:sqlite';
import {database,ready,rows,cloud,closeDatabase} from '../lib/database.ts';
if(!cloud)throw new Error('Configure DATABASE_URL para migrar para a nuvem.');
await ready();
if(Number((await rows('SELECT COUNT(*) AS count FROM users'))[0].count)||Number((await rows('SELECT COUNT(*) AS count FROM clients'))[0].count))throw new Error('O banco de destino já contém dados. Nenhum dado foi sobrescrito.');
const local=new DatabaseSync(process.env.STUDIO_DB_PATH||'data/studio.sqlite',{readOnly:true});
const tables=['clients','services','categories','movements','goals','reserves','invoices','issues','payments','settings','users','audit'];
const db=database();const queries=[];const counts={};
local.exec('BEGIN');
try {
 for(const table of tables){
  const records=local.prepare(`SELECT * FROM ${table}`).all();counts[table]=records.length;
  if(!records.length)continue;
  const keys=Object.keys(records[0]);
  for(let i=0;i<records.length;i+=100){const chunk=records.slice(i,i+100);queries.push(db.prepare(`INSERT INTO ${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES ${chunk.map(()=>`(${keys.map(()=>'?').join(',')})`).join(',')}`).bind(...chunk.flatMap(r=>keys.map(k=>r[k]))))}
 }
 await db.batch(queries);
 local.exec('COMMIT');
 for(const table of tables){const actual=Number((await rows(`SELECT COUNT(*) AS count FROM ${table}`))[0].count);if(actual!==counts[table])throw new Error('Falha de verificação em '+table)}
 console.log('Migração concluída e contagens verificadas:',JSON.stringify(counts));
}finally{local.close();await closeDatabase()}
