// Buddy motion policy and tokens. Original implementation; AGPL-3.0-only.
import {createContext,useContext,useSyncExternalStore,type ReactNode} from 'react';
import {MotionConfig,type Transition} from 'motion/react';
const Preference=createContext<'always'|'user'|'never'>('user');
export function MotionProvider({children,reducedMotion='user'}:{children:ReactNode;reducedMotion?:'always'|'user'|'never'}){
 return <Preference.Provider value={reducedMotion}><MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig></Preference.Provider>;
}
const subscribeMotion=(changed:()=>void)=>{const query=matchMedia('(prefers-reduced-motion: reduce)');query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);};
const systemMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
export function useShouldReduceMotion(){const preference=useContext(Preference),system=useSyncExternalStore(subscribeMotion,systemMotion,()=>false);return preference==='always'||(preference==='user'&&system);}
export function ReducedMotionConfig({children}:{children:ReactNode}){const reduced=useShouldReduceMotion();return <MotionConfig reducedMotion={reduced?'always':'never'}>{children}</MotionConfig>;}
const gentle:Transition={duration:.24,ease:[.22,.68,.25,1]};
const spring={selection:{type:'spring',stiffness:420,damping:38},press:{type:'spring',stiffness:520,damping:32},thumb:{type:'spring',stiffness:420,damping:32},pop:{type:'spring',stiffness:340,damping:26}} satisfies Record<string,Transition>;
export const motionTokens={spring,transition:{instant:{duration:0} as Transition,swap:{...gentle,duration:.18},reveal:{...gentle,duration:.28},overlay:{...gentle,duration:.2},dismiss:{...gentle,duration:.16},sheet:{...gentle,duration:.3},panelIn:{...gentle,duration:.3},panelOut:{...gentle,duration:.16}},scale:{press:.97,choice:.992,hover:1.015},blur:{panel:'blur(6px)'}};
export const useMotionTokens=()=>motionTokens;
