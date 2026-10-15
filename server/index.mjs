import {createServer} from 'node:http';
import handler from './handler.mjs';
import {databasePath,cloud,closeDatabase,ready} from '../lib/database.ts';
await ready();
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000);
const server=createServer(handler);
server.listen(port,host,()=>console.log(`Studio KS disponível em http://${host}:${port}\nBanco: ${cloud?'Neon (online)':databasePath}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await closeDatabase();process.exit(0)}));
