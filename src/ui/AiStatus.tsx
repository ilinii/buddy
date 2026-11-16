import {useEffect,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useMotionTokens,useShouldReduceMotion} from './motion-system';
import {Check,Search,Sparkles,PenLine,AlertCircle,Library} from 'lucide-react';
export type AiStatusState='thinking'|'researching'|'analyzing'|'writing'|'done'|'error';
export function phaseState(phase:string):AiStatusState{return phase==='generating'?'writing':phase==='retrieving'?'researching':phase==='indexing'||phase==='reranking'?'analyzing':phase==='complete'?'analyzing':'thinking';}
export function phaseLabel(phase:string,detail:string){
 if(phase==='waiting'){const seconds=/(\d+)\s*s\b/.exec(detail)?.[1];return `Waiting to continue${seconds?` · ${seconds} s`:''}`;}
 return ({indexing:'Preparing your saved sources',retrieving:'Searching your workspace',reranking:'Finding the strongest matches',generating:'Writing your answer',complete:'Checking the final sources'} as Record<string,string>)[phase]??'Finding the relevant moments';
}
/** State comes from the real request lifecycle; never a timed sequence of fake stages. */
export function AiStatus({state,label,busy=false}:{state:AiStatusState;label:string;busy?:boolean}){
 const reduced=useShouldReduceMotion(),{transition}=useMotionTokens();const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{if(!busy)return;const start=Date.now();setElapsed(0);const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[busy]);
 const Icon=state==='researching'?Search:state==='writing'?PenLine:state==='done'?Check:state==='error'?AlertCircle:state==='analyzing'?Library:Sparkles;
 return <div className="ai-status" data-state={state} data-static={reduced} role="status" aria-live="polite"><AnimatePresence initial={false} mode="popLayout"><motion.span key={state} className="ai-status-icon" initial={reduced?false:{opacity:0,scale:.8,filter:'blur(3px)'}} animate={{opacity:1,scale:1,filter:'blur(0px)'}} exit={{opacity:0}} transition={transition.swap}><Icon size={16}/></motion.span></AnimatePresence><span className={busy?'ai-status-shimmer':''}>{label}</span>{busy&&elapsed>0&&<time aria-hidden="true">{elapsed}s</time>}</div>;
}
