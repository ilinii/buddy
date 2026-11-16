import {Moon,Sun,Check} from 'lucide-react';
import {motion} from 'motion/react';
import {useMotionTokens,useShouldReduceMotion} from './motion-system';
/** Adapted from the supplied ThemeSelector: miniature workspace previews, no Tailwind dependency. */
export function ThemeSelector({value,onChange}:{value:'light'|'dark';onChange(value:'light'|'dark'):void}){
 const reduced=useShouldReduceMotion(),{transition}=useMotionTokens();
 return <div className="theme-selector" role="group" aria-label="Appearance">{(['light','dark'] as const).map(theme=><button key={theme} type="button" className="theme-option" aria-pressed={theme===value} onClick={()=>onChange(theme)}>
  <span className={`theme-preview preview-${theme}`}><span className="theme-preview-rail"/><span className="theme-preview-content"><i/><i/><span><i/><i/></span></span>{theme===value&&<motion.span className="theme-selected" initial={reduced?false:{scale:.7,opacity:0}} animate={{scale:1,opacity:1}} transition={transition.swap}><Check size={11}/></motion.span>}</span>
  <span>{theme==='light'?<Sun size={14}/>:<Moon size={14}/>} {theme==='light'?'Light':'Dark'}</span>
 </button>)}</div>;
}
