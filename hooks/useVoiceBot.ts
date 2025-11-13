import { useState, useRef, useCallback, useEffect } from 'react';
import { Subscription } from 'rxjs';
import { ConversationState, TranscriptEntry, Conversation } from '../types';
import { VoiceBotService } from '../services/VoiceBotService';

const LOCAL_STORAGE_KEY = 'companion-star-conversations';

export const useAppManager = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [conversationState, setConversationState] = useState<ConversationState>(ConversationState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [robotColor, setRobotColor] = useState<string>('#1F2937');
  
  const serviceRef = useRef<VoiceBotService | null>(null);
  const subscriptionsRef = useRef<Subscription | null>(null);

  const getService = useCallback(() => {
    if (!serviceRef.current) {
        if (!process.env.API_KEY) {
            setError("API_KEY environment variable not set.");
            return null;
        }
        serviceRef.current = new VoiceBotService(process.env.API_KEY);
    }
    return serviceRef.current;
  }, []);

  const selectConversation = useCallback((id: string) => {
    const service = getService();
    if (!service) return;
    
    if (service.state$.getValue() !== ConversationState.IDLE) {
        service.stop();
    }
    
    const conversationToLoad = conversations.find(c => c.id === id);
    if (conversationToLoad) {
      setActiveConversationId(id);
      service.loadConversation(conversationToLoad);
    }
  }, [conversations, getService]);
  
  const startNewConversation = useCallback(() => {
    const service = getService();
    if (!service) return;

    if (service.state$.getValue() !== ConversationState.IDLE) {
        service.stop();
    }

    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: 'New Conversation',
      transcripts: [],
      robotColor: '#1F2937'
    };
    
    setConversations(prev => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    service.loadConversation(newConversation);
  }, [getService]);

  const deleteConversation = useCallback((id: string) => {
    const remaining = conversations.filter(c => c.id !== id);
    setConversations(remaining);

    if (id === activeConversationId) {
        const service = getService();
        service?.stop();
        if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
            service?.loadConversation(remaining[0]);
        } else {
            startNewConversation();
        }
    }
  }, [conversations, activeConversationId, getService, startNewConversation]);

  // Load from local storage on mount
  useEffect(() => {
    try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const savedConversations: Conversation[] = JSON.parse(saved);
          if (savedConversations.length > 0) {
            setConversations(savedConversations);
            setActiveConversationId(savedConversations[0].id);
            getService()?.loadConversation(savedConversations[0]);
          } else {
            startNewConversation();
          }
        } else {
          startNewConversation();
        }
    } catch(e) {
        console.error("Failed to load conversations from local storage", e);
        startNewConversation();
    }
  }, [getService, startNewConversation]);

  // Save to local storage on change
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(conversations));
    } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, [conversations]);

  useEffect(() => {
    const service = getService();
    if (service) {
      const subscriptions = new Subscription();
      subscriptions.add(service.state$.subscribe(setConversationState));
      subscriptions.add(service.error$.subscribe(setError));
      subscriptions.add(service.robotColor$.subscribe(setRobotColor));
      
      subscriptions.add(service.transcript$.subscribe(newTranscripts => {
        if(activeConversationId) {
            setConversations(prev => prev.map(c => 
                c.id === activeConversationId ? { ...c, transcripts: newTranscripts } : c
            ));
        }
      }));
      
      subscriptions.add(service.robotColor$.subscribe(newColor => {
        if(activeConversationId) {
            setConversations(prev => prev.map(c => 
                c.id === activeConversationId ? { ...c, robotColor: newColor } : c
            ));
        }
      }));

      subscriptions.add(service.title$.subscribe(newTitle => {
        if(activeConversationId && newTitle) {
          setConversations(prev => prev.map(c => 
            c.id === activeConversationId && c.title !== newTitle ? { ...c, title: newTitle } : c
          ));
        }
      }));

      subscriptionsRef.current = subscriptions;
    }
    return () => {
      subscriptionsRef.current?.unsubscribe();
      serviceRef.current?.stop();
    };
  }, [getService, activeConversationId]);
  
  const toggleConversation = useCallback(() => {
    const service = getService();
    if (!service) return;

    if (service.state$.getValue() === ConversationState.IDLE) {
      service.start();
    } else {
      service.stop();
    }
  }, [getService]);
  
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  
  return { 
    conversationState, 
    transcripts: activeConversation?.transcripts ?? [],
    error,
    toggleConversation,
    robotColor,
    conversations,
    activeConversation,
    startNewConversation,
    selectConversation,
    deleteConversation,
  };
};