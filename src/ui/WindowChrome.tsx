import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentWindow, type Window as TauriWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X } from 'lucide-react';
import { isNative } from '../storage/service';

function desktopWindow(): TauriWindow | undefined {
  if (!isNative() || !navigator.userAgent.includes('Windows')) return;
  // Browser previews and simulated transports do not own an OS window.
  try { return getCurrentWindow(); } catch { return; }
}

/** Windows caption controls; close still goes through the native recording guard. */
export function WindowChrome({ children }: { children: ReactNode }) {
  const [nativeWindow] = useState(desktopWindow);
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!nativeWindow) return;
    let disposed = false;
    const unlisten: (() => void)[] = [];
    const refresh = () => { void nativeWindow.isMaximized().then(value => { if (!disposed) setMaximized(value); }).catch(() => {}); };
    refresh();
    void nativeWindow.onResized(refresh).then(stop => disposed ? stop() : unlisten.push(stop));
    void nativeWindow.onFocusChanged(({ payload }) => { if (!disposed) setFocused(payload); }).then(stop => disposed ? stop() : unlisten.push(stop));
    return () => { disposed = true; unlisten.forEach(stop => stop()); };
  }, [nativeWindow]);
  const act = (action: () => Promise<void>) => { setError(''); void action().catch(() => setError('Window control unavailable. Use Alt+Space for the Windows menu.')); };
  return <div className={nativeWindow ? 'desktop-window' : 'browser-window'} data-maximized={maximized} data-window-focused={focused}>
    {children}
    {nativeWindow && <>
      <div className="window-drag-strip" data-tauri-drag-region aria-hidden="true"/>
      <div className="window-controls" role="group" aria-label="Window controls">
        <button aria-label="Minimize window" title="Minimize" onClick={() => act(() => nativeWindow.minimize())}><Minus size={14}/></button>
        <button aria-label={maximized ? 'Restore window' : 'Maximize window'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => act(() => nativeWindow.toggleMaximize())}>{maximized ? <Copy size={12}/> : <Square size={12}/>}</button>
        <button className="window-close" aria-label="Close window" title="Close" onClick={() => act(() => nativeWindow.close())}><X size={15}/></button>
      </div>
      <span className="window-control-error" role="status">{error}</span>
    </>}
  </div>;
}
