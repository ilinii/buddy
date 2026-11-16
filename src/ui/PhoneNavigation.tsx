import { useEffect } from 'react';
import { motion } from 'motion/react';
import { useMotionTokens, useShouldReduceMotion } from './motion-system';
import { BookOpen, Home, ListChecks, Settings2 } from 'lucide-react';

/** Fit the visible keyboard area without disabling zoom or text selection. */
export function usePhoneViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty('--phone-height', `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.dataset.keyboard = String(!!viewport && window.innerHeight - viewport.height > 120);
    };
    update();
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);
}

export function PhoneNavigation({page,onNavigate,onSettings}:{page:string;onNavigate(page:'home'|'actions'|'knowledge'):void;onSettings():void}) {
  const {spring,transition} = useMotionTokens();
  const reduced = useShouldReduceMotion();
  return <nav className="phone-navigation" aria-label="iPhone navigation">
    {([{id:'home',label:'Meetings',Icon:Home},{id:'actions',label:'Actions',Icon:ListChecks},{id:'knowledge',label:'Knowledge',Icon:BookOpen}] as const).map(({id,label,Icon})=>{
      const active=page===id||(id==='home'&&page==='meeting');
      return <button key={id} aria-current={active?'page':undefined} onClick={()=>onNavigate(id)}>
        {active&&<motion.span className="phone-nav-selection" layoutId="phone-nav-selection" transition={reduced?transition.instant:spring.selection}/>}
        <Icon size={20} strokeWidth={active?1.9:1.5}/><span>{label}</span>
      </button>;
    })}
    <button onClick={onSettings}><Settings2 size={20} strokeWidth={1.5}/><span>Settings</span></button>
  </nav>;
}
