import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConversationState } from '../types';
import { decode, decodeAudioData, createPcmBlob } from '../utils/audioUtils';

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
  private microphoneStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  
  private sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  
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
      this.nextStartTime = 0;

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
    
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach((track) => track.stop());
      this.microphoneStream = null;
    }

    if (this.scriptProcessor) {
        this.scriptProcessor.disconnect(); 
        this.scriptProcessor = null;
    }

    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      await this.inputAudioContext.close();
      this.inputAudioContext = null;
    }

    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        this.sources.forEach(source => source.stop());
        this.sources.clear();
        await this.outputAudioContext.close();
        this.outputAudioContext = null;
    }
    
    this.currentInputTranscription = '';
    this.currentOutputTranscription = '';
    this.nextStartTime = 0;
  }
  
  private _setState(state: ConversationState): void {
    this.callbacks.onStateChange(state);
  }

  private async _onSessionOpen(): Promise<void> {
    this._setState(ConversationState.LISTENING);
    
    try {
        this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = this.inputAudioContext!.createMediaStreamSource(this.microphoneStream);
        this.scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);

        this.scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob = createPcmBlob(inputData);
            if (this.sessionPromise) {
                this.sessionPromise.then((session) => {
                    session.sendRealtimeInput({ media: pcmBlob });
                });
            }
        };
        source.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.inputAudioContext!.destination);
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
    if (base64Audio && this.outputAudioContext) {
      const audioBuffer = await decodeAudioData(decode(base64Audio), this.outputAudioContext, 24000, 1);
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      
      source.addEventListener('ended', () => {
        this.sources.delete(source);
        if (this.sources.size === 0) {
            this._setState(ConversationState.LISTENING);
        }
      });
      
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.sources.add(source);
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
