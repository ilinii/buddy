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
// Pages has no voice gateway. Keep its privacy notice and shipped scripts accurate.
let privacy=await readFile(join(output,'privacy.html'),'utf8');
privacy=privacy.replace(/<h2>The live voice demo<\/h2>[\s\S]*?(?=<h2>)/,'');
privacy=privacy.replace('The separate live voice demo does contact Deepgram after you start it.','This public website does not offer live cloud transcription.');
privacy=privacy.replace('ChatGPT Sites provides the hosting and access controls; its platform processes the requests needed to serve the website.','GitHub Pages hosts this public website and processes the requests needed to serve it.');
privacy=privacy.replace('The live voice demo uses a server-side secret. ','');
privacy=privacy.replace('Native Deepgram transcription now requests the same model-improvement opt-out as the website demo.','Native Deepgram transcription requests the provider’s model-improvement opt-out.');
await writeFile(join(output,'privacy.html'),privacy);
let main=await readFile(join(output,'site/main.js'),'utf8');
main=main.replace(/import \{setupVoiceDemo\} from '[^']+';\s*/,'').replace(/setupVoiceDemo\(\);?/g,'');
await writeFile(join(output,'site/main.js'),main);
for(const file of ['voice.js','voice-worklet.js'])await rm(join(output,'site',file),{force:true});
console.log('Static website ready: output/website-pages. Live speech requires a separately secured backend.');
