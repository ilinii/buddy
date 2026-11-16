import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { useMotionTokens, useShouldReduceMotion } from './motion-system';
import { X, Sparkles } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { isIOS, isNative } from '../platform';

export { MatrixCube, MatrixCube as Orb } from './MatrixCube';
export function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><img className="brand-mark" src="/brand/keepsake-mark.png" width="32" height="32" alt="" aria-hidden="true"/>{!compact && 'buddy'}{!compact && <span className="brand-period">.</span>}</span>;
}
export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}
export function Modal({ title, children, onClose, wide = false, className = '', placement = 'center', initialFocus, chrome = true, transparentBackdrop = false }: { title: string; children: ReactNode; onClose(): void; wide?: boolean; className?: string; placement?:'center'|'bottom'; initialFocus?:string; chrome?:boolean; transparentBackdrop?:boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const present=useIsPresent(),presentRef=useRef(present); presentRef.current=present;
  const previousFocus=useRef<HTMLElement|null>(null),restoredOnExit=useRef(false);
  const reduced=useShouldReduceMotion(),{transition}=useMotionTokens();
  useEffect(()=>{
    if(!present){restoredOnExit.current=true;previousFocus.current?.focus({preventScroll:true});}
    else if(restoredOnExit.current){restoredOnExit.current=false;ref.current?.querySelector<HTMLElement>(initialFocus??'button,input,select,textarea,[tabindex="0"]')?.focus({preventScroll:true});}
  },[present]);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; previousFocus.current=previous;
    const first = ref.current?.querySelector<HTMLElement>(initialFocus??'button,input,select,textarea,[tabindex="0"]');
    first?.focus({preventScroll:true});
    const handle = (e: KeyboardEvent) => {
      if(!presentRef.current)return;
      if (e.key === 'Escape' && !e.defaultPrevented) closeRef.current();
      if (e.key === 'Tab') {
        const all = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        if (!all.length) return;
        const first = all[0], last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); if(!restoredOnExit.current)previous?.focus({preventScroll:true}); };
  }, []);
  const content=<>{chrome?<header><h2 id="modal-title">{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={18}/></IconButton></header>:<h2 id="modal-title" className="sr-only">{title}</h2>}{children}</>;
  if(placement==='bottom')return <motion.div className={`modal-backdrop bottom-sheet-backdrop ${transparentBackdrop?'modal-backdrop-clear':''}`} initial={{backgroundColor:'rgba(25,25,28,0)',backdropFilter:transparentBackdrop?'none':'blur(0px)'}} animate={{backgroundColor:transparentBackdrop?'rgba(25,25,28,0)':'rgba(25,25,28,0.10)',backdropFilter:transparentBackdrop?'none':'blur(6px)',transition:reduced?transition.instant:transition.overlay}} exit={{backgroundColor:'rgba(25,25,28,0)',backdropFilter:transparentBackdrop?'none':'blur(0px)',transition:reduced?transition.instant:transition.overlay}} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <motion.div className={`modal bottom-sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} inert={!present} initial={{opacity:0,transform:reduced?'translateY(0%)':'translateY(100%)'}} animate={{opacity:1,transform:'translateY(0%)',transition:reduced?transition.instant:transition.sheet}} exit={{opacity:0,transform:reduced?'translateY(0%)':'translateY(100%)',transition:reduced?transition.instant:transition.dismiss}}>{content}</motion.div>
  </motion.div>;
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`modal ${wide?'modal-wide':''} ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>{content}</div></div>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><Sparkles size={25} strokeWidth={1.2} /><h3>{title}</h3><p>{children}</p></div>;
}
export function downloadFile(content: string | Blob, name: string, type = 'text/plain') {
  if (isNative() && isIOS()) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    if(blob.size>5*1024*1024){window.alert('This document is too large to share from Buddy on iPhone (5 MB maximum).');return;}
    void blob.arrayBuffer().then(buffer=>invoke('share_iphone_document',{bytes:Array.from(new Uint8Array(buffer)),name})).catch(error=>window.alert(String(error)));
    return;
  }
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
