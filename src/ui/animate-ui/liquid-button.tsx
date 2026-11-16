// Buddy's original reflective control. AGPL-3.0-only.
import {useState,type CSSProperties,type ReactNode} from 'react';
import {motion,type HTMLMotionProps} from 'motion/react';
import {useShouldReduceMotion,motionTokens} from '../motion-system';
export type LiquidButtonProps=Omit<HTMLMotionProps<'button'>,'children'>&{children?:ReactNode;hoverScale?:number;tapScale?:number};
export function LiquidButton({children,className='',style,hoverScale=1,tapScale=.975,onFocus,onBlur,onMouseEnter,onMouseLeave,...props}:LiquidButtonProps){
 const [active,setActive]=useState(false),reduced=useShouldReduceMotion();
 return <motion.button type="button" data-slot="liquid-button" className={`animate-liquid-button buddy-liquid ${className}`} style={{position:'relative',isolation:'isolate',overflow:'hidden',backgroundColor:'var(--liquid-button-background-color,#292b2e)',...style} as CSSProperties} whileHover={reduced?undefined:{scale:hoverScale}} whileTap={reduced?undefined:{scale:tapScale}} transition={motionTokens.spring.press} onFocus={event=>{setActive(true);onFocus?.(event);}} onBlur={event=>{setActive(false);onBlur?.(event);}} onMouseEnter={event=>{setActive(true);onMouseEnter?.(event);}} onMouseLeave={event=>{setActive(false);onMouseLeave?.(event);}} {...props}>
  <motion.span aria-hidden="true" className="buddy-liquid-reflection" initial={false} animate={{x:active?'35%':'-120%',opacity:active?.7:0}} transition={reduced?{duration:0}:{duration:.45,ease:'easeOut'}}/>
  <span className="buddy-liquid-label">{children}</span>
 </motion.button>;
}
