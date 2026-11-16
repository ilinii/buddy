import { lazy, Suspense, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMotionTokens, useShouldReduceMotion } from './motion-system';
import { Effect } from './SurfaceEntrance';
import { ArrowLeft, ArrowRight, Check, FileText, LockKeyhole, Mic, Pause, Play, ShieldCheck } from 'lucide-react';
import {AudioWave} from './AudioWave';
import { Logo } from './components';
import { LiquidButton } from './animate-ui/liquid-button';
const GlyphBackground=lazy(()=>import('./animate-ui/glyph-background').then(module=>({default:module.GlyphBackground})));

/** First-run orientation only. No capture, model download or consent is implied. */
export function Welcome({quiet,onQuiet,onComplete}:{quiet:boolean;onQuiet(value:boolean):void;onComplete():void}){
  const [step,setStep]=useState(0),heading=useRef<HTMLHeadingElement>(null);
  const reduced=useShouldReduceMotion(),{transition,blur}=useMotionTokens();
  return <main className="welcome-entry" data-enter data-type="software" aria-label="Welcome to Buddy">
    <Suspense fallback={null}><GlyphBackground className="welcome-glyph" glowColor="#454545" shapeColor="#666666" fontSize={12} interactive={false}/></Suspense>
    <header className="welcome-header" data-tauri-drag-region><Logo/><span>MEETING SPACE, MADE PERSONAL</span><button className="welcome-motion" onClick={()=>onQuiet(!quiet)} aria-label={quiet?'Resume ambient animation':'Pause ambient animation'}>{quiet?<Play size={14}/>:<Pause size={14}/>}<span>{quiet?'Motion off':'Motion on'}</span></button></header>
    <div className="welcome-composition">
      <section className="welcome-intro" aria-label="Getting started">
        <div className="welcome-step"><span className={step===0?'active':''}>01</span><span className="welcome-step-line"/><span className={step===1?'active':''}>02</span><span>{step===0?'A better place for meetings':'A workspace that’s yours'}</span></div>
        <AnimatePresence mode="wait" initial={false}><motion.div key={step} className="welcome-copy" onAnimationComplete={()=>heading.current?.focus({preventScroll:true})} initial={{opacity:0,filter:blur.panel,y:reduced?0:12}} animate={{opacity:1,filter:'blur(0px)',y:0,transition:transition.panelIn}} exit={{opacity:0,filter:blur.panel,y:reduced?0:-8,transition:transition.panelOut}}>
          <h1 ref={heading} tabIndex={-1}>{step===0?<>Stay with the<br/>conversation.</>:<>Your meetings.<br/>Your call.</>}</h1>
          {step===0?<p>Record meetings. Keep your notes.<br/>Return to the moments that matter.</p>:<p>A private place to begin, with the freedom<br className="welcome-desktop-break"/> to choose how you transcribe.</p>}
          {step===1&&<div className="welcome-promises"><div><LockKeyhole size={17}/><span><strong>Saved on this device</strong><small>Your notes stay in your workspace.</small></span></div><div><Mic size={17}/><span><strong>Recording starts with you</strong><small>Choose your sources and permissions when you record.</small></span></div><div><ShieldCheck size={17}/><span><strong>Cloud transcription is optional</strong><small>Connect a provider only when you choose.</small></span></div></div>}
          <div className="welcome-actions"><LiquidButton className="welcome-primary" onClick={()=>step===0?setStep(1):onComplete()}>{step===0?'Set up Buddy':'Open my workspace'}<ArrowRight size={16}/></LiquidButton>{step===1&&<button className="welcome-back" onClick={()=>setStep(0)}><ArrowLeft size={14}/>Back</button>}</div>
          {step===0&&<span className="welcome-footnote"><LockKeyhole size={12}/>No account needed. Start with a sample meeting.</span>}
        </motion.div></AnimatePresence>
      </section>
      <Effect className="welcome-product" fade blur={{initialBlur:4}} slide={{direction:'up',offset:16}} aria-label="Sample meeting preview">
        <div className="welcome-glass-edge"/>
        <div className="welcome-preview-top"><span><span className="welcome-sample-dot"/>SAMPLE MEETING</span><span>11:24</span></div>
        <div className="welcome-preview-title"><span><FileText size={16}/>Meeting notes</span><h2>Q2 growth &amp; priorities</h2><p>A conversation, kept in context.</p></div>
        <div className="welcome-wave"><AudioWave preview quiet={quiet||reduced}/></div>
        <div className="welcome-preview-body"><div className="welcome-source"><span>06:06</span><p>“Can we address activation first?”</p></div><div className="welcome-note"><span className="welcome-note-line"/><div><span className="welcome-note-label">THE NEXT STEP</span><p>Prioritize a two-week<br/>onboarding experiment.</p><span className="welcome-evidence"><Check size={11}/>Linked to the conversation</span></div></div></div>
        <div className="welcome-preview-bottom"><span>Notes</span><span>Transcript</span><span>Next steps</span><LockKeyhole size={12}/></div>
      </Effect>
    </div>
    <footer className="welcome-footer"><span>Less to remember. More to take away.</span><span>buddy. <span>/</span> Early access</span></footer>
  </main>;
}
