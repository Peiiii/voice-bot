import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { BehaviorSubject } from 'rxjs';
import { ConversationState, TranscriptEntry } from '../types';
import { AudioPlaybackQueue } from '../utils/audioPlayback';
import { setupMicrophone, cleanupMicrophone, MicrophoneProcessor } from '../utils/microphone';

// Polyfill for webkit browsers
// FIX: Cast window to `any` to support `webkitAudioContext` for older browsers.
const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

export class VoiceBotService {
  private ai: GoogleGenAI;
  
  // FIX: Replaced 'LiveSession' with 'any' as it is not an exported type from @google/genai.
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;

  private microphoneProcessor: MicrophoneProcessor | null = null;
  private playbackQueue: AudioPlaybackQueue | null = null;
  
  private currentInputTranscription$ = new BehaviorSubject<string>('');
  private currentOutputTranscription$ = new BehaviorSubject<string>('');

  // Public observables for state management
  public state$ = new BehaviorSubject<ConversationState>(ConversationState.IDLE);
  public transcript$ = new BehaviorSubject<TranscriptEntry[]>([]);
  public error$ = new BehaviorSubject<string | null>(null);

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async start(): Promise<void> {
    this.error$.next(null);
    this.transcript$.next([]);
    this.state$.next(ConversationState.LISTENING); // Early optimistic state update
    
    try {
      this._initializeAudioResources();
      this.sessionPromise = this._connectToLiveSession();
      await this.sessionPromise; // Wait for the session to be established before returning
    } catch (err: any) {
      this.error$.next(`Failed to start conversation: ${err.message}`);
      await this.stop();
    }
  }

  public async stop(): Promise<void> {
    this.state$.next(ConversationState.IDLE);
    
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

    await this._cleanupAudioResources();
    
    this.currentInputTranscription$.next('');
    this.currentOutputTranscription$.next('');
  }

  private _initializeAudioResources(): void {
    this.inputAudioContext = new AudioContext({ sampleRate: 16000 });
    this.outputAudioContext = new AudioContext({ sampleRate: 24000 });
    
    this.playbackQueue = new AudioPlaybackQueue(this.outputAudioContext);
    this.playbackQueue.setOnPlaybackEnd(() => {
      // When the bot finishes speaking, it goes back to listening.
      if (this.state$.getValue() === ConversationState.SPEAKING) {
        this.state$.next(ConversationState.LISTENING);
      }
    });
  }

  private async _cleanupAudioResources(): Promise<void> {
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      await this.inputAudioContext.close();
      this.inputAudioContext = null;
    }

    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        this.playbackQueue?.stop();
        await this.outputAudioContext.close();
        this.outputAudioContext = null;
    }
  }

  private _connectToLiveSession(): Promise<any> {
    return this.ai.live.connect({
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
        onopen: this._onSessionOpen,
        onmessage: this._onSessionMessage,
        onerror: this._onSessionError,
        onclose: this._onSessionClose,
      },
    });
  }
  
  private _onSessionOpen = async (): Promise<void> => {
    this.state$.next(ConversationState.LISTENING);
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
        this.error$.next(`Microphone access denied: ${err.message}`);
        await this.stop();
    }
  }

  private _updateTranscript = (speaker: 'user' | 'bot', text: string): void => {
    const currentTranscript = this.transcript$.getValue();
    const last = currentTranscript[currentTranscript.length - 1];

    if (last?.speaker === speaker) {
      // Update the last entry for streaming transcript
      const updatedTranscript = [...currentTranscript.slice(0, -1), { speaker, text }];
      this.transcript$.next(updatedTranscript);
    } else {
      // Add a new entry for a new speaker
      const updatedTranscript = [...currentTranscript, { speaker, text }];
      this.transcript$.next(updatedTranscript);
    }
  }

  private _handleInputTranscription = (text: string): void => {
    this.state$.next(ConversationState.LISTENING);
    const newText = this.currentInputTranscription$.getValue() + text;
    this.currentInputTranscription$.next(newText);
    this._updateTranscript('user', newText);
  }

  private _handleOutputTranscription = (text: string): void => {
    this.state$.next(ConversationState.SPEAKING);
    const newText = this.currentOutputTranscription$.getValue() + text;
    this.currentOutputTranscription$.next(newText);
    this._updateTranscript('bot', newText);
  }

  private _onSessionMessage = async (message: LiveServerMessage): Promise<void> => {
    const outputText = message.serverContent?.outputTranscription?.text;
    const inputText = message.serverContent?.inputTranscription?.text;

    if (outputText) {
      this._handleOutputTranscription(outputText);
    } else if (inputText) {
      this._handleInputTranscription(inputText);
    }
    
    if (message.serverContent?.turnComplete) {
      this.currentInputTranscription$.next('');
      this.currentOutputTranscription$.next('');
      this.state$.next(ConversationState.LISTENING);
    }

    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio && this.playbackQueue) {
      await this.playbackQueue.add(base64Audio);
    }
  }
  
  private _onSessionError = (e: ErrorEvent): void => {
    console.error(e);
    this.error$.next(`An error occurred: ${e.message}`);
    this.stop();
  }

  private _onSessionClose = (): void => {
     console.log('Session closed');
     this.stop();
  }
}