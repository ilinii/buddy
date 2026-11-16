import {readFile,mkdir,writeFile} from 'node:fs/promises';
const worker=new URL('./worker/',import.meta.url);
let code=await readFile(new URL('budget.mjs',worker),'utf8');
code+='\n'+(await readFile(new URL('relay.mjs',worker),'utf8')).replace('export async function relay','async function relay');
code+='\n'+(await readFile(new URL('index.mjs',worker),'utf8')).replace(/^import .*;\r?\n/gm,'');
await mkdir(new URL('./dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('./dist/server/index.js',import.meta.url),code);
console.log('Built bounded voice gateway. Credentials are runtime-only.');
