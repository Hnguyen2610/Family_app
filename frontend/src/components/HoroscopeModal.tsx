'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
import { getDateLocale } from '@/utils/date';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

interface HoroscopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  notification: any;
  language?: string;
}

export default function HoroscopeModal({
  isOpen,
  onClose,
  notification,
  language = 'vi',
}: HoroscopeModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(isOpen, onClose);
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  if (!isOpen || !notification) return null;

  const isVi = language === 'vi';
  const title = notification.title || (isVi ? 'Tử vi tuần mới' : 'Weekly Horoscope');
  const content = notification.metadata?.fullContent || notification.message || '';

  const dateFormatted = new Date(notification.createdAt || Date.now()).toLocaleDateString(
    getDateLocale(language),
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  );

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto no-scrollbar">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300 cursor-pointer"
        onClick={onClose}
      />

      {/* Card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="horoscope-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-xl bg-card rounded-3xl shadow-2xl border border-border/80 overflow-hidden animate-in zoom-in-95 fade-in duration-300 my-auto z-10 outline-none"
      >

        <div className="relative p-6 sm:p-8 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white overflow-hidden">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl pointer-events-none" />

          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95 z-20"
            aria-label="Close"
          >
            <FiX size={18} />
          </button>

          <div className="relative z-10 pr-10">
            <h2 id="horoscope-modal-title" className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {title}
            </h2>
            <p className="text-xs text-white/80 font-medium mt-0.5 capitalize">
              {dateFormatted}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8 max-h-[70vh] overflow-y-auto no-scrollbar bg-slate-50/50 dark:bg-slate-900/40">
          <div
            className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-b:text-slate-800 dark:prose-b:text-slate-100"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>

        <div className="p-4 sm:p-6 bg-card border-t border-border flex items-center justify-center">
          <button
            onClick={onClose}
            className="w-full sm:w-auto py-3 px-8 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm transition-all active:scale-[0.98]"
          >
            {isVi ? 'Đóng' : 'Close'}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
