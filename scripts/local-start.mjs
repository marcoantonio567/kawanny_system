import {spawn, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
try {
 if(!existsSync('node_modules/vite'))throw new Error('Instale as dependências com npm ci antes de iniciar.');
 for(const args of [['node_modules/vite/bin/vite.js','build'],['scripts/build-local.mjs']]) {
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('Não foi possível preparar a aplicação. Confira a mensagem acima.');
 }
 const child=spawn(process.execPath,['dist/server/index.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,HOST:'127.0.0.1',PORT:'5173'}});
 child.on('error',error=>{console.error(error.message);process.exitCode=1});
 child.on('exit',code=>{process.exitCode=code??1});
 console.log('Mantenha esta janela aberta enquanto usar o Studio KS.');
}catch(error){console.error(error.message);process.exitCode=1}
