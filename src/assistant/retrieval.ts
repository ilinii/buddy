import type {Citation,DocumentChunk,IndexedDocument,Meeting,Segment,NoteBlock} from '../meeting/model';
import {timestamp} from '../meeting/model';

export interface RetrievalOptions { includeHistory?:boolean; }
export interface EvidenceChunk {
  id:string; rootId:string; revision:string; title:string; location:string; text:string;
  kind:'transcript'|'document'|'note'; citation:Citation; boost:number; lexicalScore:number;
}
export interface Corpus {chunks:EvidenceChunk[]; currentId:string; demo:boolean;}
export const historyRequested=(question:string)=>/earlier meeting|previous|last month|last week|already|before|past meeting|réunions? précédentes?|semaine dernière|mois dernier|auparavant/i.test(question);
export function plainText(html:string):string {
  return html.replace(/<\/(?:p|h[1-6]|li|div)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[s]??s)).trim();
}
export function words(text:string):string[] {return text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+/gu)?.filter(x=>x.length>1)??[];}
const stop=new Set(words('the a an my find report tell me whether did we what was were is are and in by to of for it from how our you can please with on have has had this that do does le la les un une des du de ce cette ces et est sont nous vous quel quelle quels quelles pourquoi comment dans sur pour avec')); 
export function queryWords(question:string):string[] {return [...new Set(words(question).filter(w=>!stop.has(w)))].slice(0,48);}
export async function digest(text:string):Promise<string> {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const meetingIdentity=(meeting:Meeting)=>[meeting.id,meeting.mode,meeting.title,meeting.date];
const segmentRevision=(meeting:Meeting,segment:Segment)=>digest(JSON.stringify([...meetingIdentity(meeting),segment.id,segment.start,segment.end,segment.channel,segment.speaker??'',segment.text]));
const noteRevision=(meeting:Meeting,block:NoteBlock)=>digest(JSON.stringify([...meetingIdentity(meeting),block.id,block.revision,block.title,plainText(block.html)]));
const documentRevision=(chunk:DocumentChunk)=>digest(JSON.stringify([chunk.id,chunk.documentId,chunk.name,chunk.location,chunk.group,chunk.demo,chunk.text]));
export function splitPassages(text:string,limit=1800):{text:string;offset:number}[] {
  const result:{text:string;offset:number}[]=[];let start=0;
  while(start<text.length){let end=Math.min(start+limit,text.length);if(end<text.length){const boundary=Math.max(text.lastIndexOf('\n',end),text.lastIndexOf('. ',end));if(boundary>start+limit/2)end=boundary+1;}const raw=text.slice(start,end);if(raw.trim())result.push({text:raw.trim(),offset:start});if(end===text.length)break;start=Math.max(start+1,end-120);}
  return result;
}
export async function buildCorpus(question:string,meetings:Meeting[],currentId:string,documents:DocumentChunk[],options:RetrievalOptions={}):Promise<Corpus> {
  const current=meetings.find(m=>m.id===currentId);if(!current)throw Error('The selected meeting is no longer available.');
  const demo=current.mode==='demo';const chunks:EvidenceChunk[]=[];const history=options.includeHistory??historyRequested(question);
  const wanted=/decid|agree|decision|décid|accord/i.test(question)?['decision']:/action|deadline|next step|needs to happen|due|friday|thursday|prochaine|échéance/i.test(question)?['action_item']: /unresolved|open question/i.test(question)?['question']:[];
  for(const meeting of meetings.filter(m=>(m.mode==='demo')===demo&&(history||m.id===currentId))){
    for(const segment of meeting.segments.filter(s=>s.final)){
      const boost=meeting.events.some(e=>e.evidenceIds.includes(segment.id)&&wanted.includes(e.type))?5:0;
      const revision=await segmentRevision(meeting,segment);
      for(const part of splitPassages(segment.text)){const id=`t:${encodeURIComponent(meeting.id)}:${encodeURIComponent(segment.id)}:${part.offset}`;chunks.push({id,rootId:`meeting:${meeting.id}`,revision,title:meeting.title,location:`${meeting.date} · ${timestamp(segment.start)}–${timestamp(segment.end)} · ${segment.channel}${segment.speaker?` · speaker label: ${segment.speaker}`:''}`,text:part.text,kind:'transcript',boost,lexicalScore:0,citation:{kind:'transcript',id,label:`${meeting.title} · ${timestamp(segment.start)}`,meetingId:meeting.id,segmentId:segment.id}});}
    }
    for(const block of meeting.blocks){const text=plainText(block.html);if(!text)continue;const revision=await noteRevision(meeting,block);for(const part of splitPassages(text)){const id=`n:${encodeURIComponent(meeting.id)}:${encodeURIComponent(block.id)}:${part.offset}`;chunks.push({id,rootId:`meeting:${meeting.id}`,revision,title:`${meeting.title} · ${block.title}`,location:`${meeting.date} · Meeting note · revision ${block.revision} · ${block.editedBy==='user'?'edited by you':'synthesized'}`,text:part.text,kind:'note',boost:0,lexicalScore:0,citation:{kind:'note',id,label:`${meeting.title} · ${block.title} · note`,meetingId:meeting.id,blockId:block.id,revision:block.revision}});}}
  }
  for(const chunk of documents.filter(c=>c.demo===demo)){const revision=await documentRevision(chunk);for(const part of splitPassages(chunk.text)){const id=`d:${encodeURIComponent(chunk.id)}:${part.offset}`;chunks.push({id,rootId:`document:${chunk.documentId}`,revision,title:chunk.name,location:chunk.location,text:part.text,kind:'document',boost:0,lexicalScore:0,citation:{kind:'document',id,label:`${chunk.name} · ${chunk.location}`,chunk:{...chunk,text:part.text}}});}}
  if(chunks.length>3000||chunks.reduce((n,c)=>n+c.text.length,0)>3_000_000)throw Error('The selected library exceeds this version’s search limit. Narrow the meeting/file scope and retry.');
  const terms=queryWords(question);const tokenized=chunks.map(c=>words(`${c.title} ${c.location} ${c.text}`));const avg=tokenized.reduce((n,t)=>n+t.length,0)/Math.max(1,chunks.length);const frequencies=new Map(terms.map(t=>[t,tokenized.filter(tokens=>tokens.some(w=>w===t||w.startsWith(t))).length]));
  chunks.forEach((chunk,i)=>{let score=0;for(const term of terms){const tf=tokenized[i].filter(w=>w===term||w.startsWith(term)).length;if(!tf)continue;const df=frequencies.get(term)??0;const idf=Math.log(1+(chunks.length-df+.5)/(df+.5));score+=idf*tf*2.2/(tf+1.2*(.25+.75*tokenized[i].length/Math.max(1,avg)));}chunk.lexicalScore=score+chunk.boost;});
  return {chunks,currentId,demo};
}
export function keywordEvidence(corpus:Corpus,question:string,limit=8):EvidenceChunk[] {
  const summary=/summar|recap|catch me up|résum|synthèse/i.test(question);
  return [...corpus.chunks].filter(c=>c.lexicalScore>0||(summary&&c.rootId===`meeting:${corpus.currentId}`)).sort((a,b)=>(b.lexicalScore+(summary?1:0))-(a.lexicalScore+(summary?1:0))).slice(0,limit);
}
export function corpusDocuments(documents:IndexedDocument[]):DocumentChunk[] {return documents.flatMap(d=>d.chunks);}
export async function evidenceUnchanged(evidence:EvidenceChunk[],meetings:Meeting[],documents:IndexedDocument[]):Promise<boolean> {
  for(const source of evidence){if(source.kind==='document'){const chunk=documents.find(d=>d.id===source.citation.chunk?.documentId)?.chunks.find(c=>c.id===source.citation.chunk?.id);if(!chunk||await documentRevision(chunk)!==source.revision)return false;}else{const meeting=meetings.find(m=>m.id===source.citation.meetingId);if(!meeting)return false;if(source.kind==='transcript'){const segment=meeting.segments.find(s=>s.id===source.citation.segmentId&&s.final);if(!segment||await segmentRevision(meeting,segment)!==source.revision)return false;}else{const block=meeting.blocks.find(b=>b.id===source.citation.blockId);if(!block||await noteRevision(meeting,block)!==source.revision)return false;}}}
  return true;
}
