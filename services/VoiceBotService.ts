import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConversationState } from '../types';
import { AudioPlaybackQueue } from '../utils/audioPlayback';
import { setupMicrophone, cleanupMicrophone, MicrophoneProcessor } from '../utils/microphone';

// Polyfill for webkit browsers
// FIX: Cast window to `any` to support `webkitAudioContext` for older browsers.
const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

interface VoiceBotServiceCallbacks {
  onStateChange: (state: ConversationState) => void;
  onTranscriptUpdate: (speaker: 'user' | 'bot', text: string) => void;
  onError: (error: string | null) => void;
}

export class VoiceBotService {
  private ai: GoogleGenAI;
  private callbacks: VoiceBotServiceCallbacks;
  
  // FIX: Replaced 'LiveSession' with 'any' as it is not an exported type from @google/genai.
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;

  private microphoneProcessor: MicrophoneProcessor | null = null;
  private playbackQueue: AudioPlaybackQueue | null = null;
  
  private currentInputTranscription = '';
  private currentOutputTranscription = '';

  constructor(apiKey: string, callbacks: VoiceBotServiceCallbacks) {
    this.ai = new GoogleGenAI({ apiKey });
    this.callbacks = callbacks;
  }

  public async start(): Promise<void> {
    this.callbacks.onError(null);
    
    try {
      this.inputAudioContext = new AudioContext({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContext({ sampleRate: 24000 });
      
      this.playbackQueue = new AudioPlaybackQueue(this.outputAudioContext);
      this.playbackQueue.setOnPlaybackEnd(() => {
        // When the bot finishes speaking, it goes back to listening.
        this._setState(ConversationState.LISTENING);
      });

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: 'You are a friendly and expressive robot. Keep your responses concise and conversational.',
        },
        callbacks: {
          onopen: this._onSessionOpen.bind(this),
          onmessage: this._onSessionMessage.bind(this),
          onerror: this._onSessionError.bind(this),
          onclose: this._onSessionClose.bind(this),
        },
      });

    } catch (err: any) {
      this.callbacks.onError(`Failed to start conversation: ${err.message}`);
      await this.stop();
    }
  }

  public async stop(): Promise<void> {
    this._setState(ConversationState.IDLE);
    
    if (this.sessionPromise) {
        try {
            const session = await this.sessionPromise;
            session.close();
        } catch(e) {
            console.error('Error closing session', e);
        } finally {
            this.sessionPromise = null;
        }
    }
    
    if (this.microphoneProcessor) {
      cleanupMicrophone(this.microphoneProcessor);
      this.microphoneProcessor = null;
    }

    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      await this.inputAudioContext.close();
      this.inputAudioContext = null;
    }

    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        this.playbackQueue?.stop();
        await this.outputAudioContext.close();
        this.outputAudioContext = null;
    }
    
    this.currentInputTranscription = '';
    this.currentOutputTranscription = '';
  }
  
  private _setState(state: ConversationState): void {
    this.callbacks.onStateChange(state);
  }

  private async _onSessionOpen(): Promise<void> {
    this._setState(ConversationState.LISTENING);
    
    try {
        this.microphoneProcessor = await setupMicrophone(
          this.inputAudioContext!,
          (pcmBlob) => {
              if (this.sessionPromise) {
                  this.sessionPromise.then((session) => {
                      session.sendRealtimeInput({ media: pcmBlob });
                  });
              }
          }
        );
    } catch (err: any) {
        this.callbacks.onError(`Microphone access denied: ${err.message}`);
        await this.stop();
    }
  }

  private async _onSessionMessage(message: LiveServerMessage): Promise<void> {
    let speaker: 'user' | 'bot' | undefined;
    let text: string | undefined;

    if (message.serverContent?.outputTranscription) {
      this._setState(ConversationState.SPEAKING);
      this.currentOutputTranscription += message.serverContent.outputTranscription.text;
      speaker = 'bot';
      text = this.currentOutputTranscription;
    } else if (message.serverContent?.inputTranscription) {
      this._setState(ConversationState.LISTENING);
      this.currentInputTranscription += message.serverContent.inputTranscription.text;
      speaker = 'user';
      text = this.currentInputTranscription;
    }

    if (speaker && text) {
        this.callbacks.onTranscriptUpdate(speaker, text);
    }

    if (message.serverContent?.turnComplete) {
      this.currentInputTranscription = '';
      this.currentOutputTranscription = '';
      this._setState(ConversationState.LISTENING);
    }

    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio && this.playbackQueue) {
      await this.playbackQueue.add(base64Audio);
    }
  }
  
  // FIX: Changed parameter type from 'Error' to 'ErrorEvent' to match the expected callback signature.
  private _onSessionError(e: ErrorEvent): void {
    console.error(e);
    this.callbacks.onError(`An error occurred: ${e.message}`);
    this.stop();
  }

  private _onSessionClose(): void {
     console.log('Session closed');
     this.stop();
  }
}
