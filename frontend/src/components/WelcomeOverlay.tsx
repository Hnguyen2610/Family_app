'use client';

import React, { useState, useEffect } from 'react';
import MascotAvatar from './MascotAvatar';
import { FiX, FiMessageSquare, FiArrowRight } from 'react-icons/fi';

interface WelcomeOverlayProps {
  userName?: string;
  onNavigateToChat?: () => void;
}

export default function WelcomeOverlay({ userName = 'bạn', onNavigateToChat }: WelcomeOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Only show once per session
    const hasSeenWelcome = sessionStorage.getItem('has_seen_welcome_mascot');
    if (!hasSeenWelcome) {
      setIsOpen(true);
      sessionStorage.setItem('has_seen_welcome_mascot', 'true');

      // Auto close after 6 seconds
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border border-indigo-500/30 rounded-3xl p-8 text-center shadow-2xl shadow-indigo-500/20 overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Top Decorative Lights */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-indigo-500/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-purple-500/30 rounded-full blur-3xl" />

        {/* Close Button */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all"
          aria-label="Đóng"
        >
          <FiX size={18} />
        </button>

        {/* Mascot Character Waving */}
        <div className="mb-6 pt-2 flex justify-center">
          <MascotAvatar
            size="xl"
            isWaving={true}
            showBubble={true}
            bubbleText={`Xin chào ${userName}! 👋`}
            bubblePosition="top"
          />
        </div>

        {/* Welcome Text */}
        <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
          Chào mừng quay trở lại! ✨
        </h2>
        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          Rất vui được gặp lại <span className="font-semibold text-indigo-400">{userName}</span> tại Family Hub. Mình luôn ở trên thanh Header sẵn sàng hỗ trợ bạn bất cứ lúc nào!
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onNavigateToChat && (
            <button
              onClick={() => {
                setIsOpen(false);
                onNavigateToChat();
              }}
              className="flex-1 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold text-sm shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <FiMessageSquare />
              <span>Trò chuyện với AI</span>
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="flex-1 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 border border-white/10"
          >
            <span>Vào ứng dụng</span>
            <FiArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
}
