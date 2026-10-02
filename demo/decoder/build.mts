import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const dist=new URL('./dist/',import.meta.url);
await mkdir(dist,{recursive:true});
await build({entryPoints:[new URL('./app.ts',import.meta.url).pathname],bundle:true,outfile:new URL('./app.js',dist).pathname,platform:'browser',format:'iife',target:'es2022',minify:true});
const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
await writeFile(new URL('./index.html',dist),html.replace('src="/app.js"','src="./app.js"'));
console.log('Static landing page built in demo/decoder/dist (no wallet credentials or server required).');
