import React from 'react';
import { ConversationState } from '../types';

interface RobotFaceProps {
  state: ConversationState;
  color: string;
  isThinking: boolean;
}

const Spinner: React.FC = () => (
    <g transform="translate(120, 138)">
      <path
        d="M 20 0 A 20 20 0 0 1 6.18 19.02"
        fill="none"
        stroke="#67E8F9"
        strokeWidth="5"
        strokeLinecap="round"
        className="spinner"
      />
    </g>
);


const Eye: React.FC<{ id: string; cx: number; cy: number; state: ConversationState }> = ({ id, cx, cy, state }) => {
  const eyeContent = () => {
    switch (state) {
      case ConversationState.CONNECTING:
         return (
          <>
            <circle cx={cx} cy={cy} r="12" fill="url(#eyeGradient)" />
            <rect x={cx-10} y={cy-2} width="20" height="4" rx="2" className="fill-sky-300" filter="url(#glow)" />
          </>
        );
      case ConversationState.LISTENING:
        return (
          <>
            <circle cx={cx} cy={cy} r="14" fill="url(#eyeGradient)" opacity="0.5" />
            <circle cx={cx} cy={cy} r="8" className="fill-cyan-300" filter="url(#glow)" />
            <circle cx={cx} cy={cy} r="14" stroke="#67E8F9" strokeWidth="1.5" fill="none">
                 <animate attributeName="r" values="10;16;10" dur="2s" repeatCount="indefinite" />
                 <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
            </circle>
          </>
        );
      case ConversationState.SPEAKING:
        return (
           <>
            <rect x={cx - 14} y={cy - 4} width="28" height="8" rx="4" className="fill-teal-300" filter="url(#glow)">
              <animate attributeName="height" values="8;2;8" dur="0.3s" repeatCount="indefinite" />
              <animate attributeName="y" values={`${cy-4};${cy-1};${cy-4}`} dur="0.3s" repeatCount="indefinite" />
            </rect>
          </>
        );
      case ConversationState.IDLE:
      default:
        return (
          <>
            <circle cx={cx} cy={cy} r="12" fill="url(#eyeGradient)" />
            <circle cx={cx} cy={cy} r="6" className="fill-sky-300 blinking-eye" filter="url(#glow)" />
          </>
        );
    }
  };
  return <g>{eyeContent()}</g>;
};

const Mouth: React.FC<{ state: ConversationState }> = ({ state }) => {
  const mouthPath = () => {
    switch (state) {
      case ConversationState.CONNECTING:
        return ""; // Spinner is shown instead
      case ConversationState.LISTENING:
        return "M 90 135 Q 120 145 150 135";
      case ConversationState.SPEAKING:
        return "M 90 135 Q 120 155 150 135";
      case ConversationState.IDLE:
      default:
        return "M 95 138 L 145 138";
    }
  };
  return (
    <path 
      d={mouthPath()} 
      strokeWidth="5" 
      strokeLinecap="round" 
      className="stroke-sky-300 transition-all duration-300" 
      fill="none" 
      filter="url(#glow)"
    >
       {state === ConversationState.SPEAKING && (
          <animate attributeName="d" values="M 90 135 Q 120 155 150 135; M 90 135 Q 120 130 150 135; M 90 135 Q 120 155 150 135" dur="0.4s" repeatCount="indefinite" />
       )}
    </path>
  );
};


export const RobotFace: React.FC<RobotFaceProps> = ({ state, color, isThinking }) => {
  return (
    <div className="flex justify-center items-center p-4">
      <svg viewBox="0 0 240 200" className="w-64 h-auto md:w-80 drop-shadow-2xl">
        <defs>
            <radialGradient id="headGradient" cx="0.5" cy="0.5" r="0.7">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
             <radialGradient id="eyeGradient" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>
        {/* Head */}
        <g className={state === ConversationState.IDLE ? 'animate-head-bob' : ''}>
            <rect 
            x="20" y="20" width="200" height="160" rx="30" ry="30" 
            className="stroke-gray-600 transition-colors duration-500 robot-head" 
            strokeWidth="4" 
            style={{ fill: color }} 
            />
            <rect 
            x="20" y="20" width="200" height="160" rx="30" ry="30" 
            fill="url(#headGradient)"
            />
        </g>
        
        {/* Antenna */}
        <line x1="120" y1="20" x2="120" y2="0" strokeWidth="3" className="stroke-gray-500" />
        <circle cx="120" cy="-5" r="6" className={`
          ${isThinking || state === ConversationState.CONNECTING ? 'fill-sky-400 thinking-antenna-animation' : ''} 
          ${!isThinking && state === ConversationState.LISTENING ? 'fill-cyan-400' : ''} 
          ${!isThinking && state === ConversationState.SPEAKING ? 'fill-teal-300' : ''}
          ${!isThinking && state === ConversationState.IDLE ? 'fill-gray-500' : ''}
          transition-colors duration-500
        `} filter="url(#glow)" />

        {/* Eyes */}
        <Eye id="left-eye" cx={80} cy={80} state={state} />
        <Eye id="right-eye" cx={160} cy={80} state={state} />

        {/* Mouth */}
        {state === ConversationState.CONNECTING ? <Spinner /> : <Mouth state={state} />}
      </svg>
    </div>
  );
};