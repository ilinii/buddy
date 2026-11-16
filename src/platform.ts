import type { Settings } from './meeting/model';

export const isNative = () => '__TAURI_INTERNALS__' in window;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Desktop preferences must never request computer audio on an iPhone. */
export function recordingSettingsForPlatform(settings: Settings, ios: boolean, personal: boolean): Settings {
  return ios || personal ? { ...settings, captureMicrophone: true, captureSystemAudio: false,
    ...(ios ? { nativeDeviceId: 'default' } : {}) } : settings;
}
