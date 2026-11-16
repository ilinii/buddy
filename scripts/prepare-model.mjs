// Release-time helper; end users never run this or install a model separately.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, rename, copyFile, writeFile, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const catalog=JSON.parse(await readFile(path.join(root,'src-tauri/model-catalog.json'),'utf8'));
const revision='5359861c739e955e79d9a303bcbc70fb988958b1';
async function valid(file,model){try{if((await stat(file)).size!==model.bytes)return false;const hash=createHash('sha256');await pipeline(createReadStream(file),hash);return hash.digest('hex')===model.sha256;}catch{return false;}}
export async function prepareBundledModel(){
 const model=catalog.find(model=>model.id==='whisper-base');if(!model)throw new Error('Missing base speech model in catalog');
 const directory=path.join(root,'src-tauri/resources/engine');await mkdir(directory,{recursive:true});
 const output=path.join(directory,'whisper-base.bin');
 if(!await valid(output,model)){
  const partial=path.join(directory,'whisper-base.bin.partial');
  if(process.env.BUDDY_MODEL_SOURCE){const source=path.resolve(process.env.BUDDY_MODEL_SOURCE);if(!await valid(source,model))throw new Error('BUDDY_MODEL_SOURCE failed size/checksum verification');await copyFile(source,partial);}
  else{const response=await fetch(`https://huggingface.co/ggerganov/whisper.cpp/resolve/${revision}/ggml-base.bin`,{signal:AbortSignal.timeout(1200000)});if(!response.ok||!response.body)throw new Error(`Bundled model download failed: HTTP ${response.status}`);let size=0;const hash=createHash('sha256');const chunks=async function*(source){for await(const chunk of source){size+=chunk.length;if(size>model.bytes)throw new Error('Model exceeded pinned size');hash.update(chunk);yield chunk;}if(size!==model.bytes||hash.digest('hex')!==model.sha256)throw new Error('Model checksum mismatch');};await pipeline(Readable.fromWeb(response.body),chunks,createWriteStream(partial));}
  if(!await valid(partial,model)){await rm(partial,{force:true});throw new Error('Bundled model did not pass verification');}
  await rename(partial,output);
 }
 await writeFile(path.join(directory,'model.json'),JSON.stringify({...model,revision,license:'MIT',source:'ggerganov/whisper.cpp',preparedAt:new Date().toISOString()},null,2)+'\n');
 return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(`Bundled speech model verified: ${await prepareBundledModel()}`);}catch(error){console.error(error.message);process.exitCode=1;}}
