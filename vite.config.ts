import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':path.resolve('.')}},build:{outDir:'dist/client'},server:{host:'127.0.0.1',port:5173,proxy:{'/api':'http://127.0.0.1:3001'}}});
