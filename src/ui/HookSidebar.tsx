import {useEffect,useRef,useState} from 'react';
import {motion} from 'motion/react';
import {useMotionTokens,useShouldReduceMotion} from './motion-system';
/** Adapted from the supplied HookSidebar, using local anchors instead of Next routes. */
export function HookSidebar({items,value,onSelect}:{items:{id:string;label:string}[];value:string;onSelect(id:string):void}){
 const root=useRef<HTMLElement>(null),[y,setY]=useState(18);const reduced=useShouldReduceMotion(),{spring}=useMotionTokens();
 useEffect(()=>{const active=root.current?.querySelector<HTMLElement>('[aria-current="true"]');if(active&&root.current)setY(active.offsetTop+active.offsetHeight/2);},[value,items.map(i=>i.id).join('|')]);
 return <nav className="meeting-hook" ref={root} aria-label="Meeting date index"><motion.span className="meeting-hook-line" aria-hidden="true" animate={{height:Math.max(0,y-6)}} transition={reduced?{duration:0}:spring.selection}/><motion.svg className="meeting-hook-corner" aria-hidden="true" viewBox="0 0 12 7" width="12" height="7" animate={{top:y-6}} transition={reduced?{duration:0}:spring.selection}><path d="M.5 0a6 6 0 0 0 6 6H12" fill="none" stroke="currentColor"/></motion.svg>{items.map(item=><button type="button" key={item.id} aria-current={item.id===value?'true':undefined} onClick={()=>onSelect(item.id)}>{item.label}</button>)}</nav>;
}
