import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from './MotionButton';
import { useMotionTokens, useShouldReduceMotion } from './motion-system';
import { BookOpen, Home, ListChecks, Plus, Settings2 } from 'lucide-react';
import { Logo } from './components';
interface RailProps {
  page:string; open:boolean; actions:boolean; focusMode:boolean;
  onClose():void; onNavigate(page:'home'|'actions'|'knowledge'):void;
  onNew():void; onExplore():void; onSettings():void;
}
export function MotionRail({page,open,actions,focusMode,onClose,onNavigate,onNew,onExplore,onSettings}:RailProps) {
  const [mobile,setMobile]=useState(()=>matchMedia('(max-width:760px)').matches);
  const reduced=useShouldReduceMotion(),{transition,spring}=useMotionTokens();
  useEffect(()=>{const media=matchMedia('(max-width:760px)');const update=()=>setMobile(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const previousOpen=useRef(open);
  useEffect(()=>{if(mobile&&!open&&previousOpen.current)document.querySelector<HTMLElement>('[aria-controls="workspace-navigation"]')?.focus();previousOpen.current=open;},[mobile,open]);
  useEffect(()=>{if(!mobile||!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[mobile,open,onClose]);
  const hidden=mobile&&!open;
  return <><AnimatePresence>{mobile&&open&&<motion.button key="nav-scrim" className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} initial={{opacity:0}} animate={{opacity:1,transition:reduced?transition.instant:transition.overlay}} exit={{opacity:0,transition:reduced?transition.instant:transition.dismiss}}/>}</AnimatePresence>
    <motion.aside className="sidebar glass-rail" id="workspace-navigation" aria-label="Workspace navigation" aria-hidden={hidden||undefined} inert={hidden} initial={false} animate={{transform:hidden?'translateX(-125%)':'translateX(0%)'}} transition={reduced?transition.instant:transition.sheet}>
      <div className="rail-brand"><Button hoverScale={1} className="logo-button" aria-label="Open Buddy navigator" aria-haspopup="dialog" onClick={onExplore}><Logo compact/></Button></div>
      <div className="rail-dock"><Button hoverScale={1} className="rail-new" aria-label="New meeting" onClick={onNew}><Plus size={20}/><span className="rail-tooltip">New meeting</span></Button>
        <nav className="main-nav" aria-label="Main navigation"><>{[{id:'home',name:'My meetings',icon:Home},{id:'actions',name:'Action items',icon:ListChecks},{id:'knowledge',name:'Knowledge',icon:BookOpen}].map(({id,name,icon:Icon})=>{
          const active=page===id||(id==='home'&&page==='meeting');
          return <Button key={id} hoverScale={1} aria-label={name} title={name} aria-current={active?'page':undefined} className={active?'active':''} onClick={()=>onNavigate(id as 'home'|'actions'|'knowledge')}>
            <>{active&&<motion.span className="rail-active-surface" layoutId="buddy-rail-selection" aria-hidden="true" transition={reduced?transition.instant:spring.selection}/>}<span className="rail-item-content"><Icon size={19} strokeWidth={1.5}/><span className="rail-tooltip">{name}</span>{id==='actions'&&actions&&!focusMode&&<span className="rail-action-dot"/>}</span></>
          </Button>;
        })}</></nav>
        <Button hoverScale={1} className="rail-settings" aria-label="Settings & preferences" onClick={onSettings}><Settings2 size={18}/><span className="rail-tooltip">Settings & preferences</span></Button>
      </div>
    </motion.aside>
  </>;
}
