import type { Settings } from './meeting/model';

export const isNative = () => '__TAURI_INTERNALS__' in window;
/** Marketing playgrounds never read or write the visitor's saved workspace. */
export const isShowcase = typeof window !== 'undefined' && !isNative()
  && new URLSearchParams(window.location.search).get('showcase') === '1';
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Desktop preferences must never request computer audio on an iPhone. */
export function recordingSettingsForPlatform(settings: Settings, ios: boolean, personal: boolean): Settings {
  return ios || personal ? { ...settings, captureMicrophone: true, captureSystemAudio: false,
    ...(ios ? { nativeDeviceId: 'default' } : {}) } : settings;
}
