import { useState, useRef, useCallback, useEffect } from 'react';
import { Subscription } from 'rxjs';
import { ConversationState, TranscriptEntry } from '../types';
import { VoiceBotService } from '../services/VoiceBotService';

export const useVoiceBot = () => {
  const [conversationState, setConversationState] = useState<ConversationState>(ConversationState.IDLE);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const serviceRef = useRef<VoiceBotService | null>(null);
  const subscriptionsRef = useRef<Subscription | null>(null);

  const getService = useCallback(() => {
    if (!serviceRef.current) {
        if (!process.env.API_KEY) {
            setError("API_KEY environment variable not set.");
            return null;
        }
        const service = new VoiceBotService(process.env.API_KEY);
        serviceRef.current = service;
        
        // Set up subscriptions once the service is created
        const subscriptions = new Subscription();
        subscriptions.add(service.state$.subscribe(setConversationState));
        subscriptions.add(service.transcript$.subscribe(setTranscripts));
        subscriptions.add(service.error$.subscribe(setError));
        subscriptionsRef.current = subscriptions;
    }
    return serviceRef.current;
  }, []);

  const toggleConversation = useCallback(() => {
    const service = getService();
    if (!service) return;

    if (service.state$.getValue() === ConversationState.IDLE) {
      service.start();
    } else {
      service.stop();
    }
  }, [getService]);

  // Cleanup service and subscriptions on component unmount
  useEffect(() => {
    return () => {
      subscriptionsRef.current?.unsubscribe();
      serviceRef.current?.stop();
    };
  }, []);

  return { conversationState, transcripts, error, toggleConversation };
};
