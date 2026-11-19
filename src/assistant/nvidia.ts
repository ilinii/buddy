import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {z} from 'zod';
import type {Answer,DocumentChunk,Meeting,Settings} from '../meeting/model';
import type {AssistantProvider} from './service';
import {buildCorpus,evidenceUnchanged,type RetrievalOptions} from './retrieval';
import {isNative,storage} from '../storage/service';

const responseSchema=z.object({text:z.string().max(32000),sourceIds:z.array(z.string()).max(20),selected:z.array(z.string()).max(24),route:z.enum(['keyword','focused-context','hybrid']),model:z.string(),embedded:z.number().int().nonnegative(),cacheHits:z.number().int().nonnegative(),queryCacheHit:z.boolean().default(false),warnings:z.array(z.string()).max(10),embeddingModel:z.string().nullable(),rerankModel:z.string().nullable()});
export class NvidiaProvider implements AssistantProvider {
 constructor(private settings:Settings,private progress:(message:string)=>void=()=>{},private includeFiles=false,private phase:(phase:string)=>void=()=>{}){}
 async answer(question:string,meetings:Meeting[],currentId:string,documents:DocumentChunk[],signal:AbortSignal,options:RetrievalOptions={}):Promise<Answer>{
  if(!isNative())throw Error('NVIDIA and Voyage require the desktop app. Browser mode retains local source search.');
  if(!this.settings.nvidiaConsent)throw Error('Allow selected text to NVIDIA in Settings → AI provider before using this provider.');
  if(signal.aborted)throw new DOMException('Request cancelled','AbortError');
  this.progress('Preparing selected sources');const corpus=await buildCorpus(question,meetings,currentId,documents,options);
  const requestId=crypto.randomUUID();const stop=()=>{void invoke('knowledge_cancel',{requestId}).catch(()=>{});};
  const unlisten=await listen<{requestId:string;phase:string;detail:string}>('knowledge-progress',event=>{if(event.payload.requestId===requestId&&!signal.aborted){this.progress(event.payload.detail);this.phase(event.payload.phase);}});
  signal.addEventListener('abort',stop,{once:true});
  try{
   if(signal.aborted)throw new DOMException('Request cancelled','AbortError');
   const raw=await invoke('knowledge_answer',{request:{requestId,question,model:this.settings.nvidiaModel,hybrid:true,forceRetrieval:!!options.includeHistory||documents.length>0,includeFiles:this.includeFiles,nvidiaConsent:this.settings.nvidiaConsent,voyageConsent:this.settings.voyageConsent,sources:corpus.chunks.map(({id,rootId,revision,title,location,text,kind,lexicalScore})=>({id,rootId,revision,title,location,text,kind,lexicalScore}))}});
   if(signal.aborted)throw new DOMException('Request cancelled','AbortError');
   const response=responseSchema.parse(raw);const byId=new Map(corpus.chunks.map(c=>[c.id,c]));
   if(![...response.sourceIds,...response.selected].every(id=>byId.has(id)))throw Error('The provider returned unknown evidence. The answer was discarded.');
   const latest=await storage.load();if(!await evidenceUnchanged(response.selected.map(id=>byId.get(id)!),latest.meetings,latest.documents))throw Error('A source was changed or removed while answering. Ask again using the current sources.');
   if(signal.aborted)throw new DOMException('Request cancelled','AbortError');
   return {text:response.text.replace(/\[S(\d+)\]/g,(_,n:string)=>{const id=response.selected[Number(n)-1];const index=response.sourceIds.indexOf(id);return index>=0?`[${index+1}]`:'[source unavailable]';}),citations:response.sourceIds.map(id=>byId.get(id)!.citation),provider:'nvidia',details:[response.route==='hybrid'?'Hybrid search':response.route==='focused-context'?'Full meeting context':'Keyword search',`${response.selected.length} passage${response.selected.length===1?'':'s'}`,...response.warnings].join(' · ')};
  }finally{unlisten();signal.removeEventListener('abort',stop);}
 }
}
