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
  private completion?: Promise<Blob | undefined>;
  private starting = false;
  private stopRequested = false;
  private failure?: string;
  get error() { return this.failure; }
  onError?: (error: string) => void;
  async start(deviceId = 'default') {
    if (this.state !== 'idle' || this.starting || this.completion) throw new Error('A recording is already active');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microphone capture is unavailable in this runtime');
    this.starting = true;this.failure = undefined;this.stopRequested = false;
    let finish: (blob: Blob | undefined) => void = () => {};
    try {
      this.chunks = []; this.bytes = 0;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: deviceId === 'default' ? undefined : { exact: deviceId },
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.recorder = recorder;
      recorder.ondataavailable = event => {
        if (this.recorder !== recorder || !event.data.size) return;
        if (this.bytes + event.data.size > 100 * 1024 * 1024) { this.fail(recorder, 'Recording stopped at the 100 MB session limit.'); return; }
        this.bytes += event.data.size;this.chunks.push(event.data);
      };
      recorder.onerror = () => this.fail(recorder, 'The microphone recorder failed. The session has stopped.');
      // Register before start: an automatic error can make the recorder inactive
      // before its final dataavailable and stop events have been delivered.
      recorder.onstop = () => {
        if (this.recorder !== recorder) return;
        if (!this.stopRequested) this.fail(recorder, 'The microphone recording ended unexpectedly.');
        const blob = this.chunks.length ? new Blob(this.chunks, {type: recorder.mimeType}) : undefined;
        this.chunks = [];this.cleanup();this.completion = undefined;finish(blob);
      };
      this.stream.getAudioTracks().forEach(track => { track.onended = () => this.fail(recorder, 'Microphone disconnected. Reconnect it and start a new recording.'); });
      this.audioContext = new AudioContext();
      const analyser = this.audioContext.createAnalyser(); analyser.fftSize = 256;
      this.audioContext.createMediaStreamSource(this.stream).connect(analyser);
      const values = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(values);
        this.level = this.state === 'recording' ? Math.sqrt(values.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / values.length) : 0;
        this.animation = requestAnimationFrame(tick);
      };
      this.completion = new Promise(resolve => {finish = resolve;});
      recorder.start(1000); this.state = 'recording'; tick();
    } catch (error) {
      const recorder = this.recorder;this.cleanup();this.chunks = [];this.completion = undefined;finish(undefined);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      throw error;
    } finally {this.starting = false;}
  }
  pause() { if (this.recorder?.state === 'recording') { this.recorder.pause(); this.state = 'paused'; } }
  resume() { if (this.recorder?.state === 'paused') { this.recorder.resume(); this.state = 'recording'; } }
  stop(): Promise<Blob | undefined> {
    const completion = this.completion;
    if (!completion || !this.recorder) return Promise.resolve(undefined);
    if (!this.stopRequested) {
      this.stopRequested = true;
      if (this.recorder.state !== 'inactive') this.recorder.stop();
    }
    return completion;
  }
  private fail(recorder: MediaRecorder, message: string) {
    if (this.recorder !== recorder || this.failure) return;
    this.failure = message;
    try {this.onError?.(message);} finally {void this.stop();}
  }
  private cleanup() {
    this.state = 'idle'; this.level = 0;
    if (this.recorder) {this.recorder.ondataavailable = null;this.recorder.onerror = null;this.recorder.onstop = null;}
    this.recorder = undefined;
    cancelAnimationFrame(this.animation);
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    void this.audioContext?.close(); this.audioContext = undefined; this.stream = undefined;
  }
}
