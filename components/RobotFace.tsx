
import React from 'react';
import { ConversationState } from '../types';

interface RobotFaceProps {
  state: ConversationState;
}

const Eye: React.FC<{ cx: number; cy: number; state: ConversationState }> = ({ cx, cy, state }) => {
  const eyeContent = () => {
    switch (state) {
      case ConversationState.LISTENING:
        return <circle cx={cx} cy={cy} r="10" className="fill-cyan-300" />;
      case ConversationState.SPEAKING:
        return <circle cx={cx} cy={cy} r="12" className="fill-teal-300 animate-pulse" />;
      case ConversationState.IDLE:
      default:
        return <circle cx={cx} cy={cy} r="8" className="fill-sky-400 blinking-eye" />;
    }
  };
  return <g>{eyeContent()}</g>;
};

const Mouth: React.FC<{ state: ConversationState }> = ({ state }) => {
  const mouthPath = () => {
    switch (state) {
      case ConversationState.LISTENING:
        return "M 80 130 Q 120 140 160 130";
      case ConversationState.SPEAKING:
        return "M 90 135 C 100 155, 140 155, 150 135";
      case ConversationState.IDLE:
      default:
        return "M 90 135 L 150 135";
    }
  };
  return <path d={mouthPath()} strokeWidth="5" strokeLinecap="round" className={`stroke-sky-400 transition-all duration-300 ${state === ConversationState.SPEAKING ? 'animate-pulse' : ''}`} fill="none" />;
};


export const RobotFace: React.FC<RobotFaceProps> = ({ state }) => {
  return (
    <div className="flex justify-center items-center p-4">
      <svg viewBox="0 0 240 200" className="w-64 h-auto md:w-80">
        {/* Head */}
        <rect x="20" y="20" width="200" height="160" rx="30" ry="30" className="fill-gray-800 stroke-gray-700" strokeWidth="4" />
        
        {/* Antenna */}
        <line x1="120" y1="20" x2="120" y2="0" strokeWidth="3" className="stroke-gray-600" />
        <circle cx="120" cy="-5" r="5" className={`
          ${state === ConversationState.LISTENING ? 'fill-cyan-400 animate-pulse' : ''} 
          ${state === ConversationState.SPEAKING ? 'fill-teal-300' : ''}
          ${state === ConversationState.IDLE ? 'fill-gray-600' : ''}
          transition-colors duration-500
        `} />

        {/* Eyes */}
        <Eye cx={80} cy={80} state={state} />
        <Eye cx={160} cy={80} state={state} />

        {/* Mouth */}
        <Mouth state={state} />
      </svg>
    </div>
  );
};