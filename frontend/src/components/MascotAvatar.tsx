'use client';

import React from 'react';

interface MascotAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isWaving?: boolean;
  showBubble?: boolean;
  hoverOnlyBubble?: boolean;
  bubbleText?: string;
  onClick?: () => void;
  className?: string;
  bubblePosition?: 'top' | 'right' | 'bottom' | 'left';
}

export default function MascotAvatar({
  size = 'md',
  isWaving = true,
  showBubble = false,
  hoverOnlyBubble = false,
  bubbleText = 'Xin chào! 👋',
  onClick,
  className = '',
  bubblePosition = 'top',
}: MascotAvatarProps) {
  // Dimensions per size
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-28 h-28',
    xl: 'w-40 h-40',
  };

  const bubblePosClasses = {
    top: 'bottom-full mb-3 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-3 left-1/2 -translate-x-1/2',
    right: 'left-full ml-3 top-1/2 -translate-y-1/2',
    left: 'right-full mr-3 top-1/2 -translate-y-1/2',
  };

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center cursor-pointer group select-none ${className}`}
      role="button"
      tabIndex={0}
      aria-label="AI Robot Assistant Avatar"
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          onClick();
        }
      }}
    >
      {/* Speech Bubble */}
      {showBubble && (
        <div
          className={`absolute ${bubblePosClasses[bubblePosition]} z-30 pointer-events-none whitespace-nowrap transition-all duration-300 ease-out ${
            hoverOnlyBubble
              ? 'opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
              : 'opacity-100 scale-100 animate-in fade-in zoom-in-90'
          }`}
        >
          <div className="relative px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-semibold text-xs md:text-sm rounded-xl shadow-xl shadow-indigo-500/30 border border-white/30 flex items-center gap-1.5 backdrop-blur-md">
            <span className="animate-bounce text-xs">✨</span>
            <span>{bubbleText}</span>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-purple-600" />
          </div>
        </div>
      )}

      {/* Outer Glowing Ring */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/30 via-purple-500/30 to-pink-500/30 blur-lg opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />

      {/* SVG Robot Mascot Character */}
      <div
        className={`relative ${sizeClasses[size]} transform transition-transform duration-300 group-hover:scale-105 active:scale-95 animate-float`}
      >
        <svg
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-xl overflow-visible"
        >
          <defs>
            {/* Body Gradients */}
            <linearGradient id="robotBodyGrad" x1="20" y1="20" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>

            <linearGradient id="robotFaceGrad" x1="30" y1="35" x2="90" y2="85" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            <linearGradient id="robotEarGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>

            <linearGradient id="robotEyeGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>

          {/* Antennas / Ears */}
          <circle cx="28" cy="40" r="10" fill="url(#robotEarGrad)" />
          <circle cx="92" cy="40" r="10" fill="url(#robotEarGrad)" />
          <path d="M 60 16 L 60 8" stroke="#818cf8" strokeWidth="4" strokeLinecap="round" />
          <circle cx="60" cy="6" r="4" fill="#38bdf8" className="animate-pulse" />

          {/* Robot Head Body */}
          <rect x="22" y="24" width="76" height="68" rx="28" fill="url(#robotBodyGrad)" />

          {/* Screen Visor/Face Area */}
          <rect x="30" y="34" width="60" height="44" rx="18" fill="url(#robotFaceGrad)" />

          {/* Left Eye */}
          <g className="animate-blink">
            <ellipse cx="46" cy="54" rx="6" ry="8" fill="url(#robotEyeGlow)" />
            <circle cx="48" cy="51" r="2.5" fill="#ffffff" />
          </g>

          {/* Right Eye */}
          <g className="animate-blink">
            <ellipse cx="74" cy="54" rx="6" ry="8" fill="url(#robotEyeGlow)" />
            <circle cx="76" cy="51" r="2.5" fill="#ffffff" />
          </g>

          {/* Cute Cheeks */}
          <circle cx="40" cy="65" r="4" fill="#f472b6" opacity="0.6" />
          <circle cx="80" cy="65" r="4" fill="#f472b6" opacity="0.6" />

          {/* Happy Smile Mouth */}
          <path
            d="M 52 64 Q 60 71 68 64"
            stroke="#38bdf8"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* Left Arm (Resting) */}
          <path d="M 22 62 Q 10 68 14 78" stroke="#6366f1" strokeWidth="7" strokeLinecap="round" fill="none" />
          <circle cx="14" cy="78" r="5" fill="#818cf8" />

          {/* Right Arm (Waving on Login/Welcome, Resting on Header) */}
          <g className={isWaving ? 'animate-wave-hand' : ''} style={{ transformOrigin: '98px 62px' }}>
            <path
              d={isWaving ? "M 98 62 Q 112 50 108 34" : "M 98 62 Q 110 68 106 78"}
              stroke="#6366f1"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx={isWaving ? 108 : 106} cy={isWaving ? 34 : 78} r={isWaving ? 6 : 5} fill="#c084fc" />
            {/* Waving motion lines */}
            {isWaving && (
              <path
                d="M 116 26 Q 120 32 116 38"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                className="animate-pulse"
              />
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}
