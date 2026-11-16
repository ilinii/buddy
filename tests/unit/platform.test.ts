import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/meeting/model';
import { recordingSettingsForPlatform } from '../../src/platform';
import { recordingPermissionIssue } from '../../src/engine/client';

describe('iPhone recording policy',()=>{
  it('ignores desktop loopback and device preferences without mutating saved settings',()=>{
    const saved={...defaultSettings,captureMicrophone:false,captureSystemAudio:true,nativeDeviceId:'windows-device'};
    const phone=recordingSettingsForPlatform(saved,true,false);
    expect(phone).toMatchObject({captureMicrophone:true,captureSystemAudio:false,nativeDeviceId:'default'});
    expect(saved).toMatchObject({captureMicrophone:false,captureSystemAudio:true,nativeDeviceId:'windows-device'});
    expect(recordingSettingsForPlatform(saved,false,false)).toBe(saved);
  });
  it('requires iOS microphone permission and rejects system audio',()=>{
    const caps={native:true,microphone:true,systemAudio:false,devices:[],modelReady:true,active:null,platform:'ios',audioPermissions:{microphone:'denied' as const,system:'restricted' as const}};
    expect(recordingPermissionIssue(caps,{captureMicrophone:true,captureSystemAudio:false})).toMatch(/microphone access/);
    expect(recordingPermissionIssue({...caps,audioPermissions:{microphone:'granted',system:'restricted'}},{captureMicrophone:true,captureSystemAudio:false})).toBeUndefined();
    expect(recordingPermissionIssue(caps,{captureMicrophone:true,captureSystemAudio:true})).toMatch(/Computer audio is unavailable/);
  });
});
