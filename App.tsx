
import React from 'react';
import { RobotFace } from './components/RobotFace';
import { Transcription } from './components/Transcription';
import { ConversationState } from './types';
import { useVoiceBot } from './hooks/useVoiceBot';

const App: React.FC = () => {
  const { conversationState, transcripts, error, toggleConversation, robotColor } = useVoiceBot();
  
  const getButtonState = () => {
    switch (conversationState) {
        case ConversationState.IDLE:
            return { text: "Let's Chat!", className: 'bg-green-600 hover:bg-green-700' };
        case ConversationState.LISTENING:
            return { text: 'Listening...', className: 'bg-cyan-600' };
        case ConversationState.SPEAKING:
            return { text: 'Speaking...', className: 'bg-teal-600' };
        default:
            return { text: 'Stop Conversation', className: 'bg-red-600 hover:bg-red-700' };
    }
  }
  
  const buttonState = getButtonState();

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
        <h1 className="text-4xl font-bold text-gray-200 mb-2">Meet Sparky, Your AI Pal</h1>
        <p className="text-gray-400 mb-6">A curious bot from the future, powered by Gemini.</p>
        
        <RobotFace state={conversationState} color={robotColor} />
        
        <div className="w-full my-6">
          <Transcription transcripts={transcripts} />
        </div>
        
        {error && <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded-md mb-4 text-sm">{error}</div>}

        <button
          onClick={toggleConversation}
          disabled={conversationState !== ConversationState.IDLE && conversationState !== ConversationState.LISTENING}
          className={`px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-900 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed ${
            conversationState === ConversationState.IDLE ? buttonState.className + ' focus:ring-green-500' : 
            conversationState === ConversationState.LISTENING ? buttonState.className + ' cursor-pointer hover:bg-red-700 focus:ring-red-500' :
            buttonState.className + ' focus:ring-teal-500'
          }`}
        >
          {conversationState === ConversationState.LISTENING ? 'Stop Conversation' : buttonState.text}
        </button>
      </div>
    </div>
  );
};

export default App;
