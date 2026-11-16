import { prepareBundledModel } from './prepare-model.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSetup } from './build-setup.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
try {
 await prepareBundledModel();
 const args=process.argv.slice(2);
 if(!args.includes('--bundles')&&!args.includes('--no-bundle'))args.push('--bundles',process.platform==='win32'?'nsis':'dmg,app');
 const child=spawn(process.execPath,[path.join(root,'node_modules/@tauri-apps/cli/tauri.js'),'build','--config','src-tauri/tauri.offline.conf.json',...args],{stdio:'inherit',windowsHide:true,env:process.env});
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});
 child.on('exit',async code=>{process.exitCode=code??1;if(code===0&&process.platform==='win32'&&!args.includes('--no-bundle')&&(!args.includes('--bundles')||args[args.indexOf('--bundles')+1].split(',').includes('nsis'))){try{const index=args.indexOf('--target');await buildSetup(index<0?undefined:args[index+1]);}catch(error){console.error(error.message);process.exitCode=1;}}});
}catch(error){console.error(error.message);process.exitCode=1;}
