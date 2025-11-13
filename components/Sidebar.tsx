import React, { useRef } from 'react';
import { Conversation } from '../types';
import { NewChatIcon, TrashIcon, CloseIcon } from './icons';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
    isOpen, 
    setIsOpen, 
    conversations, 
    activeConversationId, 
    onNewConversation,
    onSelectConversation,
    onDeleteConversation
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(window.confirm('Are you sure you want to delete this conversation?')) {
        onDeleteConversation(id);
    }
  }

  return (
    <>
      {/* Backdrop for mobile */}
      <div 
        className={`fixed inset-0 bg-black/60 z-30 transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      ></div>

      <aside
        ref={sidebarRef}
        className={`fixed top-0 left-0 h-full w-64 bg-slate-950/80 backdrop-blur-xl text-gray-200 flex flex-col z-40 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-72 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4 flex-shrink-0">
           <button 
                onClick={onNewConversation}
                aria-label="New Conversation"
                className="flex items-center justify-center p-2 rounded-md hover:bg-white/10 transition-colors"
            >
                <NewChatIcon />
            </button>
          <button 
            className="p-1 rounded-md hover:bg-white/10 lg:hidden" 
            onClick={() => setIsOpen(false)}
            aria-label="Close sidebar"
            >
            <CloseIcon />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectConversation(conv.id);
                  }}
                  className={`group flex items-center justify-between w-full px-4 py-2 text-sm rounded-md transition-colors ${
                    conv.id === activeConversationId
                      ? 'bg-sky-600/50 text-white font-semibold'
                      : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
                  }`}
                >
                  <span className="truncate flex-1">{conv.title}</span>
                  <button 
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="ml-2 p-1 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 focus:opacity-100 transition-all"
                    aria-label={`Delete conversation: ${conv.title}`}
                   >
                    <TrashIcon />
                  </button>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
};