import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MicrophoneCapture} from '../../src/audio/capture';

class Recorder {
  static current:Recorder;
  static isTypeSupported(){return true;}
  state:'inactive'|'recording'|'paused'='inactive';mimeType='audio/webm';stops=0;
  ondataavailable:((event:{data:Blob})=>void)|null=null;
  onerror:(()=>void)|null=null;onstop:(()=>void)|null=null;
  constructor(){Recorder.current=this;}
  start(){this.state='recording';}pause(){this.state='paused';}resume(){this.state='recording';}
  stop(){this.stops++;this.state='inactive';}
  data(value:Blob){this.ondataavailable?.({data:value});}
  finish(){this.state='inactive';this.onstop?.();}
}
let track:{onended:(()=>void)|null;stop:ReturnType<typeof vi.fn>};
let close:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  track={onended:null,stop:vi.fn()};close=vi.fn();
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}))}});
  vi.stubGlobal('window',{MediaRecorder:Recorder});vi.stubGlobal('MediaRecorder',Recorder);
  vi.stubGlobal('AudioContext',class{
    close=close;
    createAnalyser(){return {fftSize:256,getByteTimeDomainData(values:Uint8Array){values.fill(128);}};}
    createMediaStreamSource(){return {connect(){}};}
  });
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
});
afterEach(()=>vi.unstubAllGlobals());

describe('browser recording completion',()=>{
  it('shares one stop promise, drains the last chunk and releases capture resources',async()=>{
    const capture=new MicrophoneCapture();await capture.start();const recorder=Recorder.current;
    recorder.data(new Blob(['first']));capture.pause();capture.resume();
    const stopped=capture.stop();expect(capture.stop()).toBe(stopped);expect(recorder.stops).toBe(1);
    recorder.data(new Blob(['final']));recorder.finish();
    expect(await (await stopped)!.text()).toBe('firstfinal');expect(capture.state).toBe('idle');
    expect(track.stop).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();expect(capture.error).toBeUndefined();
  });
  it('waits for final data and stop after an automatic error has already made the recorder inactive',async()=>{
    const capture=new MicrophoneCapture();const errors=vi.fn();capture.onError=errors;
    await capture.start();const recorder=Recorder.current;recorder.data(new Blob(['before']));
    recorder.state='inactive';recorder.onerror?.();const stopped=capture.stop();
    let settled=false;void stopped.then(()=>{settled=true;});await Promise.resolve();expect(settled).toBe(false);
    recorder.data(new Blob(['after']));recorder.finish();
    expect(await (await stopped)!.text()).toBe('beforeafter');expect(recorder.stops).toBe(0);
    expect(errors).toHaveBeenCalledOnce();expect(capture.error).toContain('failed');
  });
  it('marks a fault during a normal stop as interrupted and deduplicates subsequent errors',async()=>{
    const capture=new MicrophoneCapture();capture.onError=vi.fn();await capture.start();
    const recorder=Recorder.current;recorder.data(new Blob(['saved']));const stopped=capture.stop();
    track.onended?.();recorder.onerror?.();recorder.finish();
    expect((await stopped)!.size).toBe(5);expect(capture.error).toContain('disconnected');
    expect(capture.onError).toHaveBeenCalledOnce();expect(recorder.stops).toBe(1);
  });
  it('keeps previous chunks when the size limit is reached without retaining the oversized chunk',async()=>{
    const capture=new MicrophoneCapture();capture.onError=vi.fn();await capture.start();
    const recorder=Recorder.current;recorder.data(new Blob(['safe']));
    const oversized=new Blob(['overflow']);Object.defineProperty(oversized,'size',{value:100*1024*1024+1});
    recorder.data(oversized);const stopped=capture.stop();recorder.finish();
    expect(await (await stopped)!.text()).toBe('safe');expect(capture.error).toContain('100 MB');
  });
  it('ignores callbacks from a finished recorder after a new recording starts',async()=>{
    const capture=new MicrophoneCapture();capture.onError=vi.fn();await capture.start();
    const old=Recorder.current,lateError=old.onerror!,lateData=old.ondataavailable!,lateStop=old.onstop!,lateEnded=track.onended!;
    const first=capture.stop();old.finish();await first;await capture.start();
    lateError();lateEnded();lateData({data:new Blob(['stale'])});lateStop();
    expect(capture.state).toBe('recording');expect(capture.error).toBeUndefined();expect(capture.onError).not.toHaveBeenCalled();
    Recorder.current.data(new Blob(['new']));const stopped=capture.stop();Recorder.current.finish();
    expect(await (await stopped)!.text()).toBe('new');
  });
  it('handles an unsolicited stop and preserves its final audio',async()=>{
    const capture=new MicrophoneCapture();let stopped:Promise<Blob|undefined>|undefined;
    capture.onError=()=>{stopped=capture.stop();};await capture.start();
    Recorder.current.data(new Blob(['last']));Recorder.current.finish();
    expect(await (await stopped)!.text()).toBe('last');expect(capture.error).toContain('unexpectedly');
  });
  it('releases the microphone when audio setup fails and allows retry',async()=>{
    const capture=new MicrophoneCapture(),workingContext=AudioContext;vi.stubGlobal('AudioContext',class{constructor(){throw Error('Audio unavailable');}});
    await expect(capture.start()).rejects.toThrow('Audio unavailable');
    expect(track.stop).toHaveBeenCalledOnce();expect(capture.state).toBe('idle');expect(await capture.stop()).toBeUndefined();
    vi.stubGlobal('AudioContext',workingContext);await capture.start();expect(capture.state).toBe('recording');
    const stopped=capture.stop();Recorder.current.finish();await stopped;
  });
});
