import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {Settings} from '../meeting/model';
import {AnimatedCheckbox,PreferenceCombobox} from './AnimatedControls';

export function KnowledgeSetup({settings,onChange}:{settings:Settings;onChange(patch:Partial<Settings>):void}){
 const [saved,setSaved]=useState<Record<string,boolean>>({});
 const [keys,setKeys]=useState({nvidia:'',voyage:''});
 const [working,setWorking]=useState(false);const [status,setStatus]=useState('');const [error,setError]=useState('');
 useEffect(()=>{void invoke<Record<string,boolean>>('knowledge_key_status').then(setSaved).catch(()=>setError('Could not read the native credential store.'));},[]);
 async function action(work:()=>Promise<unknown>,message:string){setWorking(true);setError('');try{await work();setStatus(message);setSaved(await invoke('knowledge_key_status'));}catch(e){setError(String(e));}finally{setWorking(false);}}
 return <section className="knowledge-setup" aria-label="NVIDIA and Voyage setup">
  <div className="field-label"><span>Answer model</span><PreferenceCombobox label="Answer model" value={settings.nvidiaModel} options={[{value:'deepseek-ai/deepseek-v4.1-flash',label:'DeepSeek V4.1 Flash · NVIDIA'},{value:'nvidia/nemotron-3.5-super-vl-120b-a12b',label:'Nemotron 3.5 Super · NVIDIA'}]} onChange={value=>onChange({nvidiaModel:value as Settings['nvidiaModel']})}/></div>
  <p className="field-help">NVIDIA writes answers from evidence. Voyage finds and reranks passages using voyage-4-large and rerank-3. Small meetings use their full context directly.</p>
  {(['nvidia','voyage'] as const).map(provider=><div key={provider}><label className="field-label">{provider==='nvidia'?'NVIDIA':'Voyage'} API key<input type="password" autoComplete="off" spellCheck={false} value={keys[provider]} placeholder={saved[provider]?'Saved securely on this device':'Paste a key'} onChange={e=>setKeys(old=>({...old,[provider]:e.target.value}))}/></label><div className="button-row"><button className="button secondary small" disabled={working||!keys[provider].trim()} onClick={()=>void action(async()=>{await invoke('set_knowledge_key',{provider,key:keys[provider]});setKeys(old=>({...old,[provider]:''}));},`${provider==='nvidia'?'NVIDIA':'Voyage'} key saved in your OS credential store.`)}>Save {provider==='nvidia'?'NVIDIA':'Voyage'} key</button><button className="text-button" disabled={working||!saved[provider]} onClick={()=>void action(()=>invoke('delete_knowledge_key',{provider}),'Key removed from your OS credential store.')}>Remove {provider==='nvidia'?'NVIDIA':'Voyage'} key</button></div><p className="field-help">{saved[provider]?'Key saved · never stored in browser settings':'No key saved'}</p></div>)}
  <label className="setting-toggle" htmlFor="nvidia-consent"><span><strong>Allow selected text to NVIDIA</strong><small>Meeting passages, questions and automatic finish-time reports are processed by NVIDIA. Imported files require the separate file permission in these settings.</small></span><AnimatedCheckbox id="nvidia-consent" label="Allow selected text to NVIDIA" checked={settings.nvidiaConsent} onChange={nvidiaConsent=>onChange({nvidiaConsent})}/></label>
  <label className="setting-toggle" htmlFor="voyage-consent"><span><strong>Allow selected text to Voyage</strong><small>Semantic search sends scoped passages and your question to Voyage. Vectors are cached on this device. Provider retention terms apply.</small></span><AnimatedCheckbox id="voyage-consent" label="Allow selected text to Voyage" checked={settings.voyageConsent} onChange={voyageConsent=>onChange({voyageConsent})}/></label>
  <p className="field-help">Development endpoints have account quotas. Buddy batches indexing, reuses unchanged vectors and waits on rate limits. It never enables billing or switches cloud providers automatically.</p>
  <button className="button secondary small" disabled={working} onClick={()=>void action(()=>invoke('clear_knowledge_index'),'Search vectors cleared. Notes and imported files are unchanged.')}>Clear semantic search cache</button>
  {status&&<p role="status" className="field-help">{status}</p>}{error&&<p role="alert" className="inline-error">{error}</p>}
 </section>;
}
