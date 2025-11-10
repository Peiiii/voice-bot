
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
    <div ref={scrollRef} className="w-full h-64 md:h-80 bg-gray-800/50 rounded-lg p-4 overflow-y-auto border border-gray-700 backdrop-blur-sm">
      <div className="flex flex-col gap-4">
        {transcripts.map((entry, index) => (
          <div
            key={index}
            className={`flex flex-col ${
              entry.speaker === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg rounded-xl px-4 py-2 ${
                entry.speaker === 'user'
                  ? 'bg-sky-600 text-white rounded-br-none'
                  : 'bg-gray-700 text-gray-200 rounded-bl-none'
              }`}
            >
              <p className="text-sm">{entry.text}</p>
            </div>
             <p className="text-xs text-gray-500 mt-1 capitalize">{entry.speaker}</p>
          </div>
        ))}
         {transcripts.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Press "Start Conversation" and begin speaking...</p>
          </div>
        )}
      </div>
    </div>
  );
};
