
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { BehaviorSubject } from 'rxjs';
import { ConversationState, TranscriptEntry, Conversation } from '../types';
import { AudioPlaybackQueue } from '../utils/audioPlayback';
import { setupMicrophone, cleanupMicrophone, MicrophoneProcessor } from '../utils/microphone';

// Polyfill for webkit browsers
// FIX: Cast window to `any` to support `webkitAudioContext` for older browsers.
const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

const changeRobotColorFunctionDeclaration: FunctionDeclaration = {
    name: 'changeRobotColor',
    description: "Changes the robot's main head color.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        color: {
          type: Type.STRING,
          description: 'The color to change to. Can be a color name (e.g., "red") or a hex code (e.g., "#FF0000").',
        },
      },
      required: ['color'],
    },
};

export class VoiceBotService {
  private ai: GoogleGenAI;
  
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;

  private microphoneProcessor: MicrophoneProcessor | null = null;
  private playbackQueue: AudioPlaybackQueue | null = null;
  
  private currentInputTranscription$ = new BehaviorSubject<string>('');
  private currentOutputTranscription$ = new BehaviorSubject<string>('');
  private hasGeneratedTitle = false;

  // Public observables for state management
  public state$ = new BehaviorSubject<ConversationState>(ConversationState.IDLE);
  public transcript$ = new BehaviorSubject<TranscriptEntry[]>([]);
  public error$ = new BehaviorSubject<string | null>(null);
  public robotColor$ = new BehaviorSubject<string>('#1F2937'); // Default gray-800
  public title$ = new BehaviorSubject<string | null>(null);

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  public loadConversation(conversation: Conversation): void {
    this.transcript$.next(conversation.transcripts);
    this.robotColor$.next(conversation.robotColor);
    this.title$.next(conversation.title);
    this.hasGeneratedTitle = conversation.title !== 'New Conversation';
  }

  public async start(): Promise<void> {
    this.error$.next(null);
    this.state$.next(ConversationState.LISTENING);
    
    try {
      this._initializeAudioResources();
      this.sessionPromise = this._connectToLiveSession();
      await this.sessionPromise;
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
    // Color and transcript are NOT reset here, they are managed by loadConversation
  }

  private _initializeAudioResources(): void {
    if (!this.inputAudioContext || this.inputAudioContext.state === 'closed') {
      this.inputAudioContext = new AudioContext({ sampleRate: 16000 });
    }
    if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
      this.outputAudioContext = new AudioContext({ sampleRate: 24000 });
    }
    
    this.playbackQueue = new AudioPlaybackQueue(this.outputAudioContext);
    this.playbackQueue.setOnPlaybackEnd(() => {
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
        tools: [{ functionDeclarations: [changeRobotColorFunctionDeclaration] }],
        systemInstruction: "You are Sparky, a friendly and curious robot from the future. You are talking to a human to learn more about their world. You are enthusiastic, a bit quirky, and love to ask questions. You can also change your color if the user asks you to! You should always sound cheerful and engaging. Keep your responses conversational and not too long.",
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
      const updatedTranscript = [...currentTranscript.slice(0, -1), { speaker, text }];
      this.transcript$.next(updatedTranscript);
    } else {
      const updatedTranscript = [...currentTranscript, { speaker, text }];
      this.transcript$.next(updatedTranscript);
    }
  }
  
  private async _generateConversationTitle(firstUtterance: string): Promise<void> {
    try {
      const prompt = `Create a short, concise title (4 words max) for a conversation that starts with this: "${firstUtterance}"`;
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const newTitle = response.text.trim().replace(/"/g, '');
      if (newTitle) {
        this.title$.next(newTitle);
      }
    } catch (e) {
      console.error("Failed to generate conversation title:", e);
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
    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'changeRobotColor' && fc.args.color) {
                this.robotColor$.next(fc.args.color as string);
                this.sessionPromise?.then((session) => {
                    session.sendToolResponse({
                        functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: { result: `Color changed to ${fc.args.color}` },
                        },
                    });
                });
            }
        }
    }

    const outputText = message.serverContent?.outputTranscription?.text;
    const inputText = message.serverContent?.inputTranscription?.text;

    if (outputText) {
      this._handleOutputTranscription(outputText);
    } else if (inputText) {
      this._handleInputTranscription(inputText);
    }
    
    if (message.serverContent?.turnComplete) {
      if (!this.hasGeneratedTitle && this.currentInputTranscription$.getValue().trim().length > 0) {
        this.hasGeneratedTitle = true; // Attempt only once per session
        this._generateConversationTitle(this.currentInputTranscription$.getValue());
      }
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
     // The stop() method is called by the AppManager to ensure proper state transition
     this.state$.next(ConversationState.IDLE);
  }
}
