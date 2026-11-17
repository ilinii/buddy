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
// Defense in depth while Pages provisions TLS: never enter the public browser
// workspace on an HTTP origin. Local/native origins remain untouched.
const appEntry=join(output,'app/index.html');
const upgrade="<script>if(location.protocol==='http:'&&/^(www\\.)?meetbuddy\\.me$/.test(location.hostname))location.replace('https://meetbuddy.me'+location.pathname+location.search+location.hash);</script>";
await writeFile(appEntry,(await readFile(appEntry,'utf8')).replace('<head>','<head>'+upgrade));
// Generate the app snapshot for an optional Worker build too. These directories stay ignored.
await cp(join(root,'dist/assets'),join(site,'assets'),{recursive:true});await mkdir(join(site,'app'),{recursive:true});await cp(join(root,'dist/index.html'),join(site,'app/index.html'));
let html=await readFile(join(output,'index.html'),'utf8');
const gateway=process.env.BUDDY_VOICE_GATEWAY?.trim();
if(gateway){
 const url=new URL(gateway);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('BUDDY_VOICE_GATEWAY must be an HTTPS origin');
 html=html.replace('id="voice-demo"','id="voice-demo" data-gateway="'+url.origin+'"');
}else{
 html=html.replace(/<!-- live demo:start -->[\s\S]*?<!-- live demo:end -->/,'');
}
await writeFile(join(output,'index.html'),html);await writeFile(join(output,'.nojekyll'),'');
// Pages serves static files; optional live speech uses a separate bounded gateway.
let privacy=await readFile(join(output,'privacy.html'),'utf8');
if(!gateway){
privacy=privacy.replace(/<h2>The live voice demo<\/h2>[\s\S]*?(?=<h2>)/,'');
privacy=privacy.replace('The separate live voice demo does contact Deepgram after you start it.','This public website does not offer live cloud transcription.');
privacy=privacy.replace('The live voice demo uses a server-side secret. ','');
privacy=privacy.replace('Native Deepgram transcription now requests the same model-improvement opt-out as the website demo.','Native Deepgram transcription requests the provider’s model-improvement opt-out.');
}else{
 privacy=privacy.replace('This is an owner-private pilot; public usage budgets and abuse controls still need production hardening.','The public demo has a durable budget of 20 sample starts per UTC day, three per network per day, and 100 total. Failed speech connections can also count. To enforce these caps, the gateway stores a random session ID, a daily keyed hash of the connection address, a date and a used flag; it does not store the address itself. These limited quota records remain until the demo budget is retired. Shared networks may share a limit. Audio and transcript content is not stored or logged by the application.');
}
privacy=privacy.replace('ChatGPT Sites provides the hosting and access controls; its platform processes the requests needed to serve the website.','GitHub Pages hosts the public website. The optional live voice gateway runs on ChatGPT Sites / Cloudflare. These platforms process connection metadata needed to serve the website and demo.');
await writeFile(join(output,'privacy.html'),privacy);
if(!gateway){
let main=await readFile(join(output,'site/main.js'),'utf8');
main=main.replace(/import \{setupVoiceDemo\} from '[^']+';\s*/,'').replace(/setupVoiceDemo\(\);?/g,'');
await writeFile(join(output,'site/main.js'),main);
for(const file of ['voice.js','voice-worklet.js'])await rm(join(output,'site',file),{force:true});
}
console.log('Static website ready: output/website-pages. Live demo '+(gateway?'uses the configured bounded gateway.':'is omitted until a gateway is configured.'));
