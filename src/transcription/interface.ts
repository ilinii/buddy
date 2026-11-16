import type { Segment } from '../meeting/model';
export interface AudioFrame { samples: Float32Array; sampleRate: number; channel: 'microphone' | 'system'; start: number; }
export interface AsrBackend {
  readonly id: string;
  readonly languages: readonly string[];
  ready(): Promise<{ available: boolean; reason?: string }>;
  transcribe(frame: AudioFrame, language: 'en' | 'fr', signal: AbortSignal): Promise<Segment[]>;
  close(): Promise<void>;
}
/** Browser-only unavailable backend. Desktop capture uses the native SpeechBackend service. */
export class UnconfiguredAsr implements AsrBackend {
  readonly id = 'unconfigured'; readonly languages = ['en', 'fr'];
  async ready() { return { available: false, reason: 'No local speech model is installed. Audio capture does not generate a transcript yet.' }; }
  async transcribe(): Promise<Segment[]> { throw new Error((await this.ready()).reason); }
  async close() {}
}
