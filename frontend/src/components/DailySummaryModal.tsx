'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiCalendar, FiCloudRain, FiCoffee, FiMessageSquare, FiExternalLink, FiCheckCircle, FiSmile } from 'react-icons/fi';
import MascotAvatar from '@/components/MascotAvatar';
import { PENDING_CHAT_PROMPT_KEY } from '@/lib/storage-keys';
import { getDateLocale } from '@/utils/date';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

interface DailySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  notification: any;
  onOpenAiChat?: (prompt?: string) => void;
  language?: string;
}

export default function DailySummaryModal({
  isOpen,
  onClose,
  notification,
  onOpenAiChat,
  language = 'vi',
}: DailySummaryModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(isOpen, onClose);
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  if (!isOpen || !notification) return null;

  const isVi = language === 'vi';
  const title = notification.title || (isVi ? 'Tóm tắt gia đình hôm nay' : 'Daily Family Summary');
  const message = notification.message || '';
  const metadata = notification.metadata || {};

  // Extract dynamic events & tasks from notification metadata if available
  const events: any[] = Array.isArray(metadata.events) ? metadata.events : [];
  const tasks: any[] = Array.isArray(metadata.tasks) ? metadata.tasks : [];
  const mealSuggestion: string | null = metadata.meals || metadata.mealSuggestion || null;

  // Extract formatted date string
  const dateFormatted = new Date(notification.createdAt || Date.now()).toLocaleDateString(
    getDateLocale(language),
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  );

  const handleAskAi = () => {
    const promptText = `Hôm nay có lịch gì không và gợi ý cho tôi kế hoạch sinh hoạt và thực đơn gia đình chi tiết cho ngày hôm nay ✨`;
    sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, promptText);
    onClose();
    if (onOpenAiChat) {
      onOpenAiChat(promptText);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto no-scrollbar">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300 cursor-pointer"
        onClick={onClose}
      />

      {/* Executive Card Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-summary-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-xl bg-card rounded-3xl shadow-2xl border border-border/80 overflow-hidden animate-in zoom-in-95 fade-in duration-300 my-auto z-10 outline-none"
      >
        
        {/* Top Gradient Banner */}
        <div className="relative p-6 sm:p-8 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white overflow-hidden">
          {/* Background Decorative Pattern */}
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95 z-20"
            aria-label="Close"
          >
            <FiX size={18} />
          </button>

          <div className="flex items-center gap-4 relative z-10">
            <div className="shrink-0 bg-white/15 p-1.5 rounded-2xl backdrop-blur-md border border-white/20 shadow-lg">
              <MascotAvatar size="md" isWaving={true} showBubble={false} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold text-white mb-2 border border-white/25">
                <span>✨ {isVi ? 'Bản tin gia đình hàng ngày' : 'Daily Family Brief'}</span>
              </div>
              <h2 id="daily-summary-modal-title" className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
                {title}
              </h2>
              <p className="text-xs text-white/80 font-medium mt-0.5 capitalize">
                {dateFormatted}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 sm:p-8 space-y-5 max-h-[70vh] overflow-y-auto no-scrollbar bg-slate-50/50 dark:bg-slate-900/40">

          {/* Real Notification Message & Weather */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800/80 dark:to-indigo-950/40 border border-blue-100 dark:border-indigo-900/40 space-y-2">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
              <FiCloudRain className="text-lg" />
              <span>{isVi ? 'Thông tin & Dự báo' : 'Daily Summary & Weather'}</span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {message}
            </p>
          </div>

          {/* Dynamic Today's Schedule & Tasks */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-sm">
              <FiCalendar className="text-primary" />
              <span>{isVi ? 'Lịch trình & Nhắc nhở trong ngày' : 'Today Schedule & Tasks'}</span>
            </div>

            {events.length > 0 || tasks.length > 0 ? (
              <div className="space-y-2 text-xs">
                {events.map((evt: any, index: number) => (
                  <div key={`evt-${index}`} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <FiCheckCircle className="text-indigo-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{evt.time || 'Cả ngày'} - {evt.title}</span>
                      {evt.description && <span className="text-slate-500 dark:text-slate-400 text-[11px]">{evt.description}</span>}
                    </div>
                  </div>
                ))}
                {tasks.map((task: any, index: number) => (
                  <div key={`tsk-${index}`} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <FiCheckCircle className="text-emerald-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{task.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center space-y-1">
                <div className="inline-flex p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 mb-1">
                  <FiSmile size={18} />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isVi ? 'Không có lịch trình hay nhắc nhở nào trong ngày hôm nay 🎉' : 'No scheduled events or tasks today 🎉'}
                </p>
                <p className="text-[11px] text-slate-400 font-medium">
                  {isVi ? 'Gia đình bạn có một ngày tự do thoải mái!' : 'Enjoy your free day!'}
                </p>
              </div>
            )}
          </div>

          {/* Family Meal Suggestions (Only rendered if present) */}
          {mealSuggestion && (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800/80 dark:to-amber-950/30 border border-amber-100 dark:border-amber-900/40 space-y-2">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                <FiCoffee />
                <span>{isVi ? 'Gợi ý thực đơn gia đình' : 'Nutrition Suggestion'}</span>
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {mealSuggestion}
              </p>
            </div>
          )}

        </div>

        {/* Modal Action Footer */}
        <div className="p-4 sm:p-6 bg-card border-t border-border flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleAskAi}
            className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <FiMessageSquare />
            <span>{isVi ? 'Hỏi AI chi tiết về ngày này ✨' : 'Ask AI Details ✨'}</span>
          </button>

          {notification.metadata?.path && (
            <a
              href={notification.metadata.path}
              onClick={onClose}
              className="w-full sm:w-auto py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>{isVi ? 'Xem Lịch' : 'View Calendar'}</span>
              <FiExternalLink />
            </a>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
