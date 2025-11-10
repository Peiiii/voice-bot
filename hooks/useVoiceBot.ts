import { useState, useRef, useCallback, useEffect } from 'react';
import { ConversationState, TranscriptEntry } from '../types';
import { VoiceBotService } from '../services/VoiceBotService';

export const useVoiceBot = () => {
  const [conversationState, setConversationState] = useState<ConversationState>(ConversationState.IDLE);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const serviceRef = useRef<VoiceBotService | null>(null);

  const handleTranscriptUpdate = useCallback((speaker: 'user' | 'bot', text: string) => {
    setTranscripts(prev => {
        const last = prev[prev.length - 1];
        if (last?.speaker === speaker) {
            // Update the last entry to show the streaming transcript
            return [...prev.slice(0, -1), { speaker, text }];
        } else {
            // Add a new entry for a new speaker
            return [...prev, { speaker, text }];
        }
    });
  }, []);

  // Lazily initialize the service on first use
  const getService = useCallback(() => {
    if (!serviceRef.current) {
        if (!process.env.API_KEY) {
            setError("API_KEY environment variable not set.");
            return null;
        }
        serviceRef.current = new VoiceBotService(process.env.API_KEY, {
            onStateChange: setConversationState,
            onTranscriptUpdate: handleTranscriptUpdate,
            onError: setError,
        });
    }
    return serviceRef.current;
  }, [handleTranscriptUpdate]);

  const toggleConversation = useCallback(() => {
    const service = getService();
    if (!service) return;

    if (conversationState === ConversationState.IDLE) {
      setTranscripts([]); // Clear previous conversation
      service.start();
    } else {
      service.stop();
    }
  }, [conversationState, getService]);

  // Cleanup service on component unmount
  useEffect(() => {
    const service = serviceRef.current;
    return () => {
      service?.stop();
    };
  }, []);

  return { conversationState, transcripts, error, toggleConversation };
};
