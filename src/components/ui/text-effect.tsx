// Buddy incremental word reveal. Original implementation; AGPL-3.0-only.
import {createElement,type JSX} from 'react';
import {motion} from 'motion/react';
import {useShouldReduceMotion} from '../../ui/motion-system';
export interface TextEffectProps{children:string;per?:'word'|'char'|'line';as?:keyof JSX.IntrinsicElements;className?:string;preset?:'blur'|'shake'|'scale'|'fade'|'slide';delay?:number;trigger?:boolean;segmentWrapperClassName?:string;incremental?:boolean;onAnimationComplete?:()=>void}
export function TextEffect({children,per='word',as='p',className,preset='blur',delay=0,trigger=true,segmentWrapperClassName,incremental=false,onAnimationComplete}:TextEffectProps){
 const quiet=useShouldReduceMotion();if(!trigger)return null;if(quiet)return createElement(as,{className},children);
 const parts=per==='line'?children.split('\n'):per==='char'?Array.from(children):children.split(/(\s+)/);
 const visible={opacity:1,filter:'blur(0px)',y:0,scale:1};
 return createElement(as,{className},<span className="sr-only">{children}</span>,...parts.map((part,index)=><motion.span aria-hidden="true" key={`${index}:${part}`} className={segmentWrapperClassName} style={{display:per==='line'?'block':'inline-block',whiteSpace:'pre-wrap'}} initial={{opacity:0,filter:preset==='blur'?'blur(4px)':'blur(0px)',y:preset==='slide'?5:0,scale:preset==='scale'?.94:1}} animate={visible} transition={{duration:.26,ease:'easeOut',delay:incremental?0:delay+Math.min(index*.025,.4)}} onAnimationComplete={index===parts.length-1?onAnimationComplete:undefined}>{part}</motion.span>));
}
