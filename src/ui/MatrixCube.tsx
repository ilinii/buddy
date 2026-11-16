import { useEffect, useRef, useState } from 'react';
import { createMatrixRenderer } from './matrixRenderer';
export type PresenceState = 'idle' | 'listening' | 'thinking';
export function MatrixCube({ size='small', active=true, state='idle', interactive=false, onActivate }: { size?:'tiny'|'small'|'large'|'hero'; active?:boolean; state?:PresenceState; interactive?:boolean; onActivate?:()=>void }) {
  const host=useRef<HTMLSpanElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const options=useRef({active,state,spread:false}); options.current.active=active; options.current.state=state;
  const [ready,setReady]=useState(false),[pinned,setPinned]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const spread=pinned||hovered||focused; options.current.spread=spread;
  useEffect(() => {
    const element=host.current,surface=canvas.current; if(!element||!surface||size==='tiny'||size==='small') return;
    const renderer=createMatrixRenderer(surface); if(!renderer) return;
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,last=0,time=1.2,visible=true,scatter=0,previous='',disposed=false;
    let pointer:[number,number]=[0,0],target:[number,number]=[0,0];
    const render=(now:number) => {
      if(disposed) return;
      const current=options.current,moving=current.active&&!preference.matches;
      const signature=`${moving}/${current.spread}/${current.state}`;
      if(visible&&!document.hidden&&(moving||signature!==previous)&&(now-last>1000/30||!moving)) {
        const dt=Math.min((now-last)/1000,.05); last=now;
        if(moving) time+=dt;
        const desired=current.spread?1:0;
        scatter=moving?scatter+(desired-scatter)*.065:desired;
        pointer=moving?[pointer[0]+(target[0]-pointer[0])*.06,pointer[1]+(target[1]-pointer[1])*.06]:[0,0];
        renderer.render(time,scatter,current.state==='thinking'?1:current.state==='listening'?.6:0,pointer); previous=signature;
      }
      frame=requestAnimationFrame(render);
    };
    const resize=()=>{renderer.resize(element.getBoundingClientRect().width); renderer.render(time,scatter,0,pointer);};
    const observer=new ResizeObserver(resize); observer.observe(element);
    const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false; if(visible) previous='';}); intersection.observe(element);
    const move=(event:PointerEvent)=>{const rect=element.getBoundingClientRect();target=[(event.clientX-rect.left)/rect.width*2-1,(event.clientY-rect.top)/rect.height*2-1];};
    const leave=()=>{target=[0,0];};
    const lost=(event:Event)=>{event.preventDefault();setReady(false);cancelAnimationFrame(frame);};
    element.addEventListener('pointermove',move);element.addEventListener('pointerleave',leave);surface.addEventListener('webglcontextlost',lost);
    resize();setReady(true);frame=requestAnimationFrame(render);
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();element.removeEventListener('pointermove',move);element.removeEventListener('pointerleave',leave);surface.removeEventListener('webglcontextlost',lost);renderer.dispose();};
  },[size]);
  return <span ref={host} className={`presence presence-${size} presence-matrix ${active?'presence-animated':''}`} data-renderer={ready?'webgl':'css'} data-state={state} data-dispersed={spread} role={interactive?'button':undefined} tabIndex={interactive?0:undefined} aria-hidden={interactive?undefined:true} aria-label={interactive?(onActivate?'Open meeting navigator':'Disperse matrix'):undefined} aria-haspopup={onActivate?'dialog':undefined} aria-pressed={interactive&&!onActivate?pinned:undefined} onPointerEnter={event=>interactive&&event.pointerType!=='touch'&&setHovered(true)} onPointerLeave={()=>setHovered(false)} onFocus={event=>interactive&&event.currentTarget.matches(':focus-visible')&&setFocused(true)} onBlur={()=>setFocused(false)} onClick={event=>{if(interactive){if(onActivate)onActivate();else setPinned(value=>!value);if((event.nativeEvent as PointerEvent).pointerType==='touch'){setHovered(false);setFocused(false);}}}} onKeyDown={event=>{if(interactive&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(onActivate)onActivate();else setPinned(value=>!value);}}}>
    <span className="matrix-ground"/><span className="presence-fallback matrix-fallback"><i/><i/><i/></span><canvas className="presence-canvas matrix-canvas" ref={canvas}/>
  </span>;
}
