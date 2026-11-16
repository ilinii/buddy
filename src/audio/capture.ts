export type CaptureState = 'idle' | 'recording' | 'paused';
export interface CaptureBackend {
  start(deviceId: string): Promise<void>;
  pause(): void; resume(): void; stop(): Promise<Blob | undefined>;
}
/** Real microphone capture. This does not capture system audio or perform speech recognition. */
export class MicrophoneCapture implements CaptureBackend {
  state: CaptureState = 'idle';
  level = 0;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private audioContext?: AudioContext;
  private animation = 0;
  private chunks: Blob[] = [];
  private bytes = 0;
  private stopping?: Promise<Blob | undefined>;
  onError?: (error: string) => void;
  async start(deviceId = 'default') {
    if (this.state !== 'idle') throw new Error('A recording is already active');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microphone capture is unavailable in this runtime');
    try {
      this.chunks = []; this.bytes = 0;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: deviceId === 'default' ? undefined : { exact: deviceId },
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.recorder.ondataavailable = event => {
        if (!event.data.size) return;
        this.bytes += event.data.size;
        if (this.bytes > 100 * 1024 * 1024) { this.onError?.('Recording stopped at the 100 MB session limit.'); void this.stop(); return; }
        this.chunks.push(event.data);
      };
      this.recorder.onerror = () => { this.onError?.('The microphone recorder failed. The session has stopped.'); void this.stop(); };
      this.stream.getAudioTracks().forEach(track => { track.onended = () => { if (this.state !== 'idle') { this.onError?.('Microphone disconnected. Reconnect it and start a new recording.'); void this.stop(); } }; });
      this.audioContext = new AudioContext();
      const analyser = this.audioContext.createAnalyser(); analyser.fftSize = 256;
      this.audioContext.createMediaStreamSource(this.stream).connect(analyser);
      const values = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(values);
        this.level = this.state === 'recording' ? Math.sqrt(values.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / values.length) : 0;
        this.animation = requestAnimationFrame(tick);
      };
      this.recorder.start(1000); this.state = 'recording'; tick();
    } catch (error) { this.cleanup(); throw error; }
  }
  pause() { if (this.recorder?.state === 'recording') { this.recorder.pause(); this.state = 'paused'; } }
  resume() { if (this.recorder?.state === 'paused') { this.recorder.resume(); this.state = 'recording'; } }
  stop(): Promise<Blob | undefined> {
    if (this.stopping) return this.stopping;
    if (!this.recorder || this.recorder.state === 'inactive') { this.cleanup(); return Promise.resolve(undefined); }
    const recorder = this.recorder;
    this.stopping = new Promise(resolve => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        this.chunks = []; this.cleanup(); this.stopping = undefined; resolve(blob);
      };
      recorder.stop();
    });
    return this.stopping;
  }
  private cleanup() {
    this.state = 'idle'; this.level = 0;
    cancelAnimationFrame(this.animation);
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    void this.audioContext?.close(); this.audioContext = undefined; this.stream = undefined;
  }
}
