// Native button semantics with restrained, reduced-motion-aware feedback.
import {motion,type HTMLMotionProps} from 'motion/react';
import {useShouldReduceMotion,motionTokens} from './motion-system';
export function Button({hoverScale=1.01,tapScale=.97,disabled,...props}:HTMLMotionProps<'button'>&{hoverScale?:number;tapScale?:number}){
 const reduced=useShouldReduceMotion();
 return <motion.button type="button" data-slot="button" disabled={disabled} whileHover={reduced||disabled?undefined:{scale:hoverScale}} whileTap={reduced||disabled?undefined:{scale:tapScale}} transition={motionTokens.spring.press} {...props}/>;
}
