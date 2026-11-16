import {motion,type HTMLMotionProps} from 'motion/react';
import {useShouldReduceMotion,motionTokens} from './motion-system';
export function Effect({fade=false,blur,slide,children,...props}:HTMLMotionProps<'div'>&{fade?:boolean;blur?:boolean|{initialBlur:number};slide?:{direction:'up'|'down'|'left'|'right';offset:number}}){
 const reduced=useShouldReduceMotion(),offset=reduced?0:slide?.offset??0;
 return <motion.div initial={{opacity:fade?0:1,filter:reduced?'blur(0px)':`blur(${typeof blur==='object'?blur.initialBlur:blur?4:0}px)`,x:slide?.direction==='left'?offset:slide?.direction==='right'?-offset:0,y:slide?.direction==='up'?offset:slide?.direction==='down'?-offset:0}} animate={{opacity:1,filter:'blur(0px)',x:0,y:0}} transition={reduced?motionTokens.transition.instant:motionTokens.transition.panelIn} {...props}>{children}</motion.div>;
}
