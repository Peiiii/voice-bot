import React, { useState } from 'react';
import { RobotFace } from './components/RobotFace';
import { Transcription } from './components/Transcription';
import { ConversationState } from './types';
import { useAppManager } from './hooks/useVoiceBot';
import { Sidebar } from './components/Sidebar';
import { MenuIcon, MicrophoneIcon } from './components/icons';


const App: React.FC = () => {
  const {
    conversationState,
    error,
    robotColor,
    conversations,
    activeConversation,
    toggleConversation,
    startNewConversation,
    selectConversation,
    deleteConversation,
  } = useAppManager();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);


  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    setSidebarOpen(false); // Close sidebar on selection
  }

  const handleNewConversation = () => {
    startNewConversation();
    setSidebarOpen(false); // Close sidebar on new chat
  }

  const isListening = conversationState === ConversationState.LISTENING;

  return (
    <div className="flex h-screen bg-slate-950 text-white font-sans">
      <Sidebar 
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        conversations={conversations}
        activeConversationId={activeConversation?.id ?? null}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={deleteConversation}
      />
      <main className="flex-1 flex flex-col items-center justify-center p-4 relative h-full overflow-hidden">
        <button 
          aria-label="Open conversation history"
          className="absolute top-4 left-4 lg:hidden z-20 p-2 rounded-md bg-black/20 hover:bg-white/10 transition-colors backdrop-blur-sm"
          onClick={() => setSidebarOpen(true)}
        >
          <MenuIcon />
        </button>

        <div className="w-full max-w-6xl mx-auto flex flex-col items-center justify-center flex-1 min-h-0">
          <div className="w-full flex-1 flex flex-col md:flex-row items-center gap-8 min-h-0">
            {/* Left Panel: Robot */}
            <div className="w-full md:w-1/2 flex flex-col justify-center items-center gap-6">
              <RobotFace state={conversationState} color={robotColor} />
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="relative flex items-center justify-center">
                  {isListening && (
                    <>
                      <div className="absolute w-24 h-24 bg-sky-500/20 rounded-full animate-[listening-wave_2s_ease-out_infinite]"></div>
                      <div className="absolute w-24 h-24 bg-sky-500/20 rounded-full animate-[listening-wave_2s_ease-out_1s_infinite]"></div>
                    </>
                  )}
                  <button
                    onClick={toggleConversation}
                    disabled={conversationState === ConversationState.SPEAKING}
                    className={`relative w-24 h-24 rounded-full text-lg font-semibold transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-slate-950 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center
                    ${
                      conversationState === ConversationState.IDLE ? 'bg-sky-600 hover:bg-sky-500 focus:ring-sky-400 animate-[pulse-glow_3s_ease-in-out_infinite]' :
                      isListening ? 'bg-red-600 hover:bg-red-500 focus:ring-red-400' :
                      'bg-gray-600 focus:ring-gray-500'
                    }`}
                    aria-label={isListening ? 'Stop conversation' : "Start conversation"}
                  >
                    <MicrophoneIcon className="w-10 h-10"/>
                  </button>
                </div>
              </div>
            </div>
            {/* Right Panel: Transcript */}
            <div className="w-full md:w-1/2 h-full flex flex-col min-h-0">
              <Transcription transcripts={activeConversation?.transcripts ?? []} />
            </div>
          </div>
          
          {error && <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded-md mt-4 text-sm flex-shrink-0">{error}</div>}

        </div>
      </main>
    </div>
  );
};

export default App;