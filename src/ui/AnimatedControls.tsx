import { useEffect, useId, useRef, useState } from 'react';
import { Checkbox } from '@base-ui/react/checkbox';
import { Combobox } from '@base-ui/react/combobox';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from './MotionButton';
import { Check, ChevronDown, Copy } from 'lucide-react';

export function AnimatedCheckbox({checked,onChange,label,disabled=false,id,className=''}:{checked:boolean;onChange(value:boolean):void;label?:string;disabled?:boolean;id?:string;className?:string}) {
  return <Checkbox.Root className={`animated-checkbox ${className}`} id={id} aria-label={label} checked={checked} disabled={disabled} onCheckedChange={value=>onChange(value)}><Checkbox.Indicator><Check size={12} strokeWidth={2.3}/></Checkbox.Indicator></Checkbox.Root>;
}
export interface PreferenceOption {value:string;label:string;disabled?:boolean}
export function PreferenceCombobox({label,value,options,onChange,onEscape}:{label:string;value:string;options:PreferenceOption[];onChange(value:string):void;onEscape?():void}) {
  const [open,setOpen]=useState(false),id=useId();
  const items=options.some(option=>option.value===value)?options:[...options,{value,label:'Previously selected device (unavailable)',disabled:true}];
  const selected=items.find(option=>option.value===value)??null;
  return <div className="preference-combobox" onKeyDownCapture={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(open)setOpen(false);else onEscape?.();}}}><Combobox.Root items={items} value={selected} onValueChange={option=>{if(option&&!option.disabled)onChange(option.value);}} isItemEqualToValue={(a,b)=>a.value===b.value} itemToStringLabel={option=>option.label} open={open} onOpenChange={setOpen}>
    <Combobox.InputGroup className="preference-input"><Combobox.Input id={id} aria-label={label} placeholder={`Search ${label.toLowerCase()}…`}/><Combobox.Trigger aria-label={`Show ${label.toLowerCase()} options`}><ChevronDown size={14}/></Combobox.Trigger></Combobox.InputGroup>
    <Combobox.Portal><Combobox.Positioner sideOffset={7} className="preference-positioner"><Combobox.Popup className="preference-popup"><Combobox.Empty className="preference-empty">No matching options</Combobox.Empty><Combobox.List>{(option:PreferenceOption)=><Combobox.Item className="preference-option" key={option.value} value={option} disabled={option.disabled}><span>{option.label}</span><Combobox.ItemIndicator><Check size={13}/></Combobox.ItemIndicator></Combobox.Item>}</Combobox.List></Combobox.Popup></Combobox.Positioner></Combobox.Portal>
  </Combobox.Root></div>;
}
export function CopyAction({content,label='Copy',className=''}:{content:string;label?:string;className?:string}) {
  const [status,setStatus]=useState<'idle'|'copied'|'error'>('idle');
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  return <span className={`copy-action ${className}`}><Button type="button" className="copy-control" data-copied={status==='copied'?'':undefined} aria-label={label} title={status==='copied'?'Copied':label} onClick={event=>{event.preventDefault();void (async()=>{try{if(!navigator.clipboard)throw new Error('Unavailable');await navigator.clipboard.writeText(content);setStatus('copied');}catch{setStatus('error');}clearTimeout(timer.current);timer.current=setTimeout(()=>setStatus('idle'),2200);})();}}><AnimatePresence initial={false} mode="wait"><motion.span key={status==='copied'?'done':'copy'} initial={{opacity:0,scale:.85}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.85}} transition={{duration:.12}}>{status==='copied'?<Check size={15}/>:<Copy size={15}/>}</motion.span></AnimatePresence></Button><span role="status" className={status==='error'?'copy-feedback':'sr-only'}>{status==='copied'?'Copied to clipboard':status==='error'?'Copy unavailable. Try selecting the text.':''}</span></span>;
}
export function ConfirmationDialog({open,title,description,confirmLabel,cancelLabel,onClose,onConfirm,disabled=false}:{open:boolean;title:string;description:string;confirmLabel:string;cancelLabel:string;onClose():void;onConfirm():Promise<void>;disabled?:boolean}) {
  const [working,setWorking]=useState(false),[error,setError]=useState('');const cancel=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(open)setError('');},[open]);
  return <AlertDialog.Root open={open} onOpenChange={next=>{if(!next&&!working)onClose();}}><AlertDialog.Portal><AlertDialog.Backdrop className="confirmation-backdrop"/><AlertDialog.Viewport className="confirmation-viewport"><AlertDialog.Popup className="confirmation-popup" initialFocus={cancel}><AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description>{description}</AlertDialog.Description>{error&&<p role="alert" className="inline-error">{error}</p>}<div className="button-row"><AlertDialog.Close ref={cancel} className="button secondary" disabled={working}>{cancelLabel}</AlertDialog.Close><Button className="button danger" disabled={disabled||working} onClick={()=>{setWorking(true);setError('');void onConfirm().catch(reason=>setError(String(reason))).finally(()=>setWorking(false));}}>{working?'Deleting…':confirmLabel}</Button></div></AlertDialog.Popup></AlertDialog.Viewport></AlertDialog.Portal></AlertDialog.Root>;
}
