import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,sep,relative} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),site=join(root,'website/buddy-site/dist');
const output=resolve(root,'output/website-pages');
if(!output.startsWith(resolve(root,'output')+sep))throw Error('Invalid website output directory');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await cp(site,output,{recursive:true,filter:path=>!['app','assets','server'].includes(relative(site,path).split(sep)[0])});
for(const directory of ['assets','brand','fixtures','third-party'])await cp(join(root,'dist',directory),join(output,directory),{recursive:true});
await mkdir(join(output,'app'),{recursive:true});await cp(join(root,'dist/index.html'),join(output,'app/index.html'));
// Generate the app snapshot for an optional Worker build too. These directories stay ignored.
await cp(join(root,'dist/assets'),join(site,'assets'),{recursive:true});await mkdir(join(site,'app'),{recursive:true});await cp(join(root,'dist/index.html'),join(site,'app/index.html'));
let html=await readFile(join(output,'index.html'),'utf8');
html=html.replace(/<section class="voice-demo wrap"[\s\S]*?<\/section>/,'');
html=html.replace('href="#voice-demo">Try your voice','href="/app/?demo=home">Try Buddy');
await writeFile(join(output,'index.html'),html);await writeFile(join(output,'.nojekyll'),'');
console.log('Static website ready: output/website-pages. Live speech requires a separately secured backend.');
