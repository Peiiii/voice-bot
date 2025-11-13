import React, { useRef, useEffect } from 'react';
import { TranscriptEntry } from '../types';

interface TranscriptionProps {
  transcripts: TranscriptEntry[];
}

export const Transcription: React.FC<TranscriptionProps> = ({ transcripts }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  return (
    <div ref={scrollRef} className="chat-scroll-mask w-full h-full px-4 py-6 overflow-y-auto">
      <div className="flex flex-col gap-4">
        {transcripts.map((entry, index) => (
          <div
            key={index}
            className={`flex flex-col animate-fade-in ${
              entry.speaker === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg rounded-xl px-4 py-3 shadow-lg backdrop-blur-sm ${
                entry.speaker === 'user'
                  ? 'bg-gradient-to-br from-sky-500/80 to-cyan-600/80 text-white rounded-br-none'
                  : 'bg-slate-800/60 text-gray-200 rounded-bl-none'
              }`}
            >
              <p className="text-sm leading-relaxed">{entry.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};