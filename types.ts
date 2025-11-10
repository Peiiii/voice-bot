
export enum ConversationState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  SPEAKING = 'SPEAKING',
}

export interface TranscriptEntry {
  speaker: 'user' | 'bot';
  text: string;
}
