import { useState, useRef, useCallback } from 'react';
// FIX: Removed 'LiveSession' from import as it is not an exported member.
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConversationState, TranscriptEntry } from '../types';
import { decode, decodeAudioData, createPcmBlob } from '../utils/audioUtils';

// Polyfill for webkit browsers
// FIX: Cast window to `any` to support `webkitAudioContext` for older browsers.
const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

export const useVoiceBot = () => {
  const [conversationState, setConversationState] = useState<ConversationState>(ConversationState.IDLE);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // FIX: Replaced 'LiveSession' with 'any' as it is not an exported type from @google/genai.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  const stopConversation = useCallback(async () => {
    setConversationState(ConversationState.IDLE);
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      session.close();
      sessionPromiseRef.current = null;
    }
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      await inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
        await outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }
    
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';
    nextStartTimeRef.current = 0;
  }, []);

  const startConversation = useCallback(async () => {
    setError(null);
    setTranscripts([]);
    
    try {
      if (!process.env.API_KEY) {
          throw new Error("API_KEY environment variable not set.");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      nextStartTimeRef.current = 0;

      sessionPromiseRef.current = ai.live.connect({
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
          onopen: async () => {
            setConversationState(ConversationState.LISTENING);
            microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = inputAudioContextRef.current!.createMediaStreamSource(microphoneStreamRef.current);
            scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);

            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              }
            };
            source.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setConversationState(ConversationState.SPEAKING);
              currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
              setTranscripts(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.speaker === 'bot') {
                      return [...prev.slice(0, -1), { speaker: 'bot', text: currentOutputTranscriptionRef.current }];
                  }
                  return [...prev, { speaker: 'bot', text: currentOutputTranscriptionRef.current }];
              });
            } else if (message.serverContent?.inputTranscription) {
              setConversationState(ConversationState.LISTENING);
              currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
               setTranscripts(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.speaker === 'user') {
                      return [...prev.slice(0, -1), { speaker: 'user', text: currentInputTranscriptionRef.current }];
                  }
                  return [...prev, { speaker: 'user', text: currentInputTranscriptionRef.current }];
              });
            }

            if (message.serverContent?.turnComplete) {
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
              setConversationState(ConversationState.LISTENING);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContextRef.current.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                    setConversationState(ConversationState.LISTENING);
                }
              });
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }
          },
          // FIX: Changed parameter type from 'Error' to 'ErrorEvent' to match the expected callback signature.
          onerror: (e: ErrorEvent) => {
            console.error(e);
            setError(`An error occurred: ${e.message}`);
            stopConversation();
          },
          onclose: () => {
             console.log('Session closed');
          },
        },
      });

    } catch (err: any) {
        console.error(err);
        setError(`Failed to start conversation: ${err.message}`);
        stopConversation();
    }
  }, [stopConversation]);

  const toggleConversation = () => {
    if (conversationState === ConversationState.IDLE) {
      startConversation();
    } else {
      stopConversation();
    }
  };

  return { conversationState, transcripts, error, toggleConversation };
};
