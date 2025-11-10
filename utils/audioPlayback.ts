import { decode, decodeAudioData } from './audioUtils';

export class AudioPlaybackQueue {
  private audioContext: AudioContext;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private onPlaybackEndCallback: (() => void) | null = null;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  public setOnPlaybackEnd(callback: () => void) {
    this.onPlaybackEndCallback = callback;
  }

  public async add(base64Audio: string) {
    if (!this.audioContext || this.audioContext.state === 'closed') return;

    const audioBuffer = await decodeAudioData(decode(base64Audio), this.audioContext, 24000, 1);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0 && this.onPlaybackEndCallback) {
        this.onPlaybackEndCallback();
      }
    };

    this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    this.sources.add(source);
  }

  public stop() {
    this.sources.forEach(source => {
        source.onended = null; // Prevent onPlaybackEndCallback from firing
        try {
            source.stop();
        } catch(e) {
            // Can throw if source already stopped
            console.warn("Error stopping audio source", e);
        }
    });
    this.sources.clear();
    this.nextStartTime = 0;
  }
}
