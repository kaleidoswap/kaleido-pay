import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:[new URL('./app.ts',import.meta.url).pathname],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022'});
const html=await readFile(new URL('./index.html',import.meta.url));
const port=Number(process.env.PORT??4178);
createServer((req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.writeHead(405).end();return}
 if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)}
 else if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].contents)}
 else res.writeHead(404).end();
}).listen(port,'127.0.0.1',()=>console.log(`BOLT12 Inspector: http://127.0.0.1:${port}`));
