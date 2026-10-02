// Assembles the GitHub Pages site into _site/: landing page, slides, offer inspector, videos.
//   node site/build.mjs        (run from the repo root; the inspector needs `npm ci` in demo/decoder)
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const out = '_site';
await rm(out, { recursive: true, force: true });
await mkdir(`${out}/videos`, { recursive: true });

await cp('site/index.html', `${out}/index.html`);
await cp('site/img', `${out}/img`, { recursive: true });
for (const f of await readdir('demo/videos')) if (f.endsWith('.mp4')) await cp(`demo/videos/${f}`, `${out}/videos/${f}`);

const deck = JSON.parse(await readFile('site/deck/deck.json', 'utf8'));
const slides = await Promise.all(deck.order.map(id => readFile(`site/deck/slides/${id}.html`, 'utf8')));
const fonts = Object.values(deck.faces).map(f => `<link rel="stylesheet" href="${f.href}">`).join('\n');
await mkdir(`${out}/slides`, { recursive: true });
await writeFile(`${out}/slides/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>KaleidoPay · Slides</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
*{box-sizing:border-box;margin:0}html,body{height:100%;background:#0b1220;overflow:hidden}
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center}
#stage>section{position:absolute;inset:0;width:1920px;height:1080px;display:none!important}
#stage>section.on{display:flex!important}
#stage aside{display:none}
#bar{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;font:500 14px system-ui,sans-serif;color:#9aa6b8;background:#111a2bcc;padding:6px 10px;border-radius:999px}
#bar button{background:#1d2a40;color:#e8eef6;border:0;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}
#bar a{color:#9aa6b8}
</style></head><body>
<div id="stage">${slides.join('\n')}</div>
<div id="bar"><button id="prev" aria-label="Previous slide">←</button><span id="count"></span><button id="next" aria-label="Next slide">→</button><a href="../">KaleidoPay</a></div>
<script>
const s=[...document.querySelectorAll('#stage>section')],stage=document.getElementById('stage');let i=Math.max(0,Math.min(s.length-1,(parseInt(location.hash.slice(1))||1)-1));
function fit(){const k=Math.min(innerWidth/1920,innerHeight/1080);stage.style.transform='translate(-50%,-50%) scale('+k+')'}
function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach((e,j)=>e.classList.toggle('on',j===i));document.getElementById('count').textContent=(i+1)+' / '+s.length;history.replaceState(null,'','#'+(i+1))}
addEventListener('resize',fit);addEventListener('hashchange',()=>{const n=(parseInt(location.hash.slice(1))||1)-1;if(n!==i)show(n)});addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))show(i+1);if(['ArrowLeft','PageUp'].includes(e.key))show(i-1)});
document.getElementById('prev').onclick=()=>show(i-1);document.getElementById('next').onclick=()=>show(i+1);
stage.onclick=e=>{if(!e.target.closest('a'))show(e.clientX>innerWidth/2?i+1:i-1)};fit();show(i);
</script></body></html>`);

if (existsSync('demo/decoder/node_modules')) {
  execFileSync('npx', ['tsx', 'build.mts'], { cwd: 'demo/decoder', stdio: 'inherit' });
  await cp('demo/decoder/dist', `${out}/inspector`, { recursive: true });
} else console.warn('demo/decoder/node_modules missing: run `npm ci` there to include the inspector');
console.log(`site built in ${out}/`);
