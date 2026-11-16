import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {join,relative,extname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=join(root,'dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.bin':'application/octet-stream','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8','.csv':'text/csv','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8'};
const assets={};
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='server')continue;const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else{const route='/'+relative(dist,path).replaceAll('\\','/');assets[route]={body:gzipSync(await readFile(path)).toString('base64'),type:types[extname(path)]??'application/octet-stream'};}}}
await walk(dist);
const voice=(await readFile(join(root,'worker/voice.mjs'),'utf8')).replace('export async function voiceRoute','async function voiceRoute');
const server=`${voice}\nconst assets=${JSON.stringify(assets)};\nexport default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/voice/'))return voiceRoute(request,env);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});let path=url.pathname;if(path.endsWith('/'))path+='index.html';const asset=assets[path];if(!asset)return new Response('Not found',{status:404});const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{encodeBody:'manual',headers:{'Content-Type':asset.type,'Content-Encoding':'gzip','X-Content-Type-Options':'nosniff','Cache-Control':path.endsWith('.html')?'no-cache':'public, max-age=3600'}});}};\n`;
await mkdir(join(dist,'server'),{recursive:true});await writeFile(join(dist,'server/index.js'),server);
console.log(JSON.stringify({assets:Object.keys(assets).length,workerBytes:Buffer.byteLength(server),workerGzipBytes:gzipSync(server).length}));
