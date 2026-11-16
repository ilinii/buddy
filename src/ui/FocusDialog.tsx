import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from './MotionButton';
import { useMotionTokens, useShouldReduceMotion } from './motion-system';
import { motion } from 'motion/react';
import { BellOff, ExternalLink, ShieldCheck } from 'lucide-react';
import { isIOS } from '../platform';
import { isNative } from '../storage/service';
import { Modal } from './components';
export function FocusDialog({enabled,onChange,onClose}:{enabled:boolean;onChange(enabled:boolean):void;onClose():void}) {
  const [error,setError]=useState('');
  const reduced=useShouldReduceMotion(),{spring,transition}=useMotionTokens();
  return <Modal title="Focus mode" onClose={onClose} className="focus-dialog"><div className="focus-body">
    <div className="focus-heading"><span className="focus-symbol"><BellOff size={23} strokeWidth={1.4}/></span><p>A quieter space for<br/>the conversation.</p></div>
    <div className="focus-toggle-row"><div><strong>Focus in Buddy</strong><p>Pause ambient effects, hide badges and confirmations, and start with your notes.</p></div><Button hoverScale={1} role="switch" aria-label="Focus in Buddy" aria-checked={enabled} className="focus-switch" onClick={()=>onChange(!enabled)}><motion.span animate={{transform:enabled?'translateX(18px)':'translateX(0px)'}} transition={reduced?transition.instant:spring.thumb}/></Button></div>
    <div className="system-focus"><ShieldCheck size={17}/><div><strong>Silence other apps</strong><p>Turn on your device’s Do Not Disturb to block system notifications. Buddy can’t enable it automatically.</p>{isIOS()?<p className="focus-device-help">Open Control Centre → Focus → Do Not Disturb on your iPhone.</p>:isNative()?<Button hoverScale={1} className="system-focus-link" onClick={()=>{setError('');void invoke('open_notification_settings').catch(reason=>setError(String(reason)));}}>Open device notification settings<ExternalLink size={13}/></Button>:<p className="focus-device-help">Windows: Win + N → Do not disturb.<br/>Mac: Control Centre → Focus → Do Not Disturb.</p>}</div></div>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    <p className="focus-footnote">Recording controls and important errors stay visible. This setting is saved on this device.</p>
  </div></Modal>;
}
