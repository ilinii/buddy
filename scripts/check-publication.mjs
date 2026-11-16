// Check tracked source only; never print a matching credential.
import {execFileSync} from 'node:child_process';
import {readFile,lstat} from 'node:fs/promises';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw Error('No tracked files found. Review and stage the intended source before checking.');
const problems=[];
const forbidden=/(^|\/)(node_modules|target|output|shots|test-results|playwright-report|\.toolchain|\.agents|\.codex|\.taste-skill|\.openai|\.sites-runtime|\.wrangler)(\/|$)|\.(?:sqlite\w*|db|pem|key|p12|pfx|mobileprovision|wav|mp3|m4a|webm|exe|dll|ipa)$/i;
for(const file of files){
 if(forbidden.test(file)||(/(^|\/)\.env/.test(file)&&!file.endsWith('.env.example')))problems.push({file,reason:'Private/runtime artifact path'});
 if((await lstat(file)).isSymbolicLink()){problems.push({file,reason:'Unreviewed symlink'});continue;}
 const bytes=await readFile(file);if(bytes.includes(0))continue;
 const text=bytes.toString('utf8');
 for(const [reason,pattern] of [
  ['Private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['NVIDIA credential',/nvapi-[A-Za-z0-9_-]{35,}/],
  ['GitHub credential',/(?:github_pat_[A-Za-z0-9_]{40,}|gh[pousr]_[A-Za-z0-9]{30,})/],
  ['Google credential',/AIza[0-9A-Za-z_-]{35}/],
  ['Private hosting identity',/appg(?:prj|dep|ver)_[A-Za-z0-9]{16,}/],
  ['Personal development path',/[A-Za-z]:[\\/]Users[\\/][^\s<>"']+/],
  ['Restricted component import',/from\s+['"]@animate-ui\/react/],
 ])if(pattern.test(text))problems.push({file,reason});
}
if(problems.length){console.error(JSON.stringify({status:'failed',findings:problems},null,2));process.exitCode=1;}
else console.log(JSON.stringify({status:'passed',trackedFiles:files.length,check:'Artifact/credential-pattern guard; run Gitleaks too.'}));
