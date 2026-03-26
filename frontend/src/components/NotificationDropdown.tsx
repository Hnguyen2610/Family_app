'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/lib/i18n';
import { 
  FiBell, 
  FiCalendar, 
  FiLayout, 
  FiCheckCircle, 
  FiCheck,
  FiChevronRight,
  FiSettings,
  FiX,
  FiTrash2
} from 'react-icons/fi';
import Link from 'next/link';

interface NotificationItemProps {
    n: any;
    language: string;
    markAsRead: (id: string) => void;
    deleteNotification: (id: string) => void;
    setSelectedNotification: (n: any) => void;
}

const NotificationItem = ({ n, language, markAsRead, deleteNotification, setSelectedNotification }: NotificationItemProps) => {
    const handleMainClick = () => {
        if (!n.isRead) markAsRead(n.id);
        setSelectedNotification(n);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            handleMainClick();
        }
    };

    const handleMarkRead = (e: React.MouseEvent) => {
        e.stopPropagation();
        markAsRead(n.id);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        deleteNotification(n.id);
    };

    const itemClasses = [
        "w-full text-left p-5 transition-all cursor-pointer flex gap-4 items-start",
        "hover:bg-slate-50 dark:hover:bg-slate-800/50",
        n.isRead ? "" : "bg-indigo-50/30 dark:bg-indigo-900/10"
    ].join(" ");

    const titleClasses = [
        "text-sm font-black truncate",
        n.isRead ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"
    ].join(" ");

    const messageClasses = [
        "text-xs font-medium mt-1 line-clamp-2",
        n.isRead ? "text-slate-400 dark:text-slate-500" : "text-slate-600 dark:text-slate-300"
    ].join(" ");

    return (
        <div
            onClick={handleMainClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            className={itemClasses}
        >
            <div className="shrink-0">
                {n.type === 'BIRTHDAY' && <div className="p-2 bg-rose-100 text-rose-600 rounded-xl"><FiCalendar /></div>}
                {n.type === 'ANNIVERSARY' && <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><FiCalendar /></div>}
                {n.type === 'HOLIDAY' && <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><FiCalendar /></div>}
                {n.type === 'MEAL_ADDED' && <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><FiLayout /></div>}
                {!['BIRTHDAY', 'ANNIVERSARY', 'HOLIDAY', 'MEAL_ADDED'].includes(n.type) && <div className="p-2 bg-slate-100 text-slate-600 rounded-xl"><FiBell /></div>}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <h4 className={titleClasses}>{n.title}</h4>
                    <span className="text-[9px] font-bold text-slate-400 shrink-0">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <p className={messageClasses}>{n.message}</p>
                <div className="flex gap-2 mt-3">
                    {!n.isRead && (
                        <button 
                            onClick={handleMarkRead}
                            className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors p-1"
                        >
                            <FiCheck /> {language === 'vi' ? 'Đã đọc' : 'Mark read'}
                        </button>
                    )}
                    <button 
                        onClick={handleDelete}
                        className="text-[9px] font-black text-rose-500/60 hover:text-rose-600 uppercase tracking-widest flex items-center gap-1 transition-colors p-1"
                        title={language === 'vi' ? 'Xóa' : 'Delete'}
                    >
                        <FiTrash2 /> {language === 'vi' ? 'Xóa' : 'Delete'}
                    </button>
                    {n.metadata?.path && (
                        <Link 
                            href={n.metadata.path} 
                            onClick={(e) => { e.stopPropagation(); if(!n.isRead) markAsRead(n.id); }}
                            className="text-[9px] font-black text-slate-400 dark:hover:text-indigo-400 uppercase tracking-widest flex items-center gap-1 p-1"
                        >
                            {language === 'vi' ? 'Xem chi tiết' : 'View Details'} <FiChevronRight />
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function NotificationDropdown() {
  const { t, language } = useTranslation();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'BIRTHDAY': return <div className="p-2 bg-rose-100 text-rose-600 rounded-xl"><FiCalendar /></div>;
      case 'ANNIVERSARY': return <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><FiCalendar /></div>;
      case 'HOLIDAY': return <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><FiCalendar /></div>;
      case 'MEAL_ADDED': return <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><FiLayout /></div>;
      default: return <div className="p-2 bg-slate-100 text-slate-600 rounded-xl"><FiBell /></div>;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 md:w-12 md:h-12 rounded-2xl md:rounded-3xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 flex items-center justify-center hover:bg-indigo-700 transition-all active:scale-95 relative"
        aria-label="Notifications"
      >
        <FiBell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 border-2 border-white rounded-full text-[10px] font-black text-white flex items-center justify-center animate-pulse shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-[320px] md:w-[400px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-[300] animate-in slide-in-from-top-2 duration-300">
          <div className="p-6 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest text-xs">
                {t('settings.notifications')}
              </h3>
              {unreadCount > 0 && (
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                  {unreadCount} {language === 'vi' ? 'thông báo mới' : 'new notifications'}
                </p>
              )}
            </div>
            <div className="flex gap-2">
                <button 
                  onClick={() => { markAllAsRead(); }}
                  className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all active:scale-90"
                  title={language === 'vi' ? 'Đánh dấu tất cả đã đọc' : 'Mark all as read'}
                >
                  <FiCheckCircle size={18} />
                </button>
                <Link href="/settings">
                    <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all active:scale-90">
                        <FiSettings size={18} />
                    </button>
                </Link>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto no-scrollbar">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FiBell className="text-slate-300 dark:text-slate-600 text-2xl" />
                </div>
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500">
                  {language === 'vi' ? 'Chưa có thông báo nào' : 'No notifications yet'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {notifications.map((n) => (
                  <NotificationItem 
                    key={n.id}
                    n={n}
                    language={language}
                    markAsRead={markAsRead}
                    deleteNotification={deleteNotification}
                    setSelectedNotification={setSelectedNotification}
                  />
                ))}
              </div>
            )}
          </div>
          
          <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 text-center">
             <button 
                onClick={() => setIsOpen(false)}
                className="text-[10px] font-black text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase tracking-widest transition-all"
             >
                {language === 'vi' ? 'Đóng' : 'Close'}
             </button>
          </div>
        </div>
      )}

      {selectedNotification && isMounted && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <button 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300 cursor-default border-none"
            onClick={() => setSelectedNotification(null)}
            aria-label="Close modal"
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 p-8 animate-in zoom-in-95 fade-in duration-300">
            <button 
              onClick={() => setSelectedNotification(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-all active:scale-90"
            >
              <FiX size={20} />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-[2rem] bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-3xl mb-6 shadow-inner ring-8 ring-indigo-50/50 dark:ring-indigo-900/10">
                {getIcon(selectedNotification.type)}
              </div>
              
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2 leading-tight">
                {selectedNotification.title}
              </h3>
              
              <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-6">
                {new Date(selectedNotification.createdAt).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}
              </p>

              <div className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-left">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedNotification.message}
                </p>
              </div>

              <div className="w-full flex gap-3 mt-8">
                {selectedNotification.metadata?.path && (
                  <Link href={selectedNotification.metadata.path} className="flex-1">
                    <button 
                      onClick={() => {
                        setSelectedNotification(null);
                        setIsOpen(false);
                      }}
                      className="w-full p-4 rounded-2xl bg-indigo-600 dark:bg-indigo-500 text-white font-black text-sm shadow-xl shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      {language === 'vi' ? 'Đi đến mục liên quan' : 'Go to Action'} <FiChevronRight />
                    </button>
                  </Link>
                )}
                <button 
                  onClick={() => {
                    deleteNotification(selectedNotification.id);
                    setSelectedNotification(null);
                  }}
                  className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-black text-sm hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all active:scale-[0.98] flex items-center justify-center"
                  title={language === 'vi' ? 'Xóa thông báo' : 'Delete notification'}
                >
                  <FiTrash2 size={20} />
                </button>
                <button 
                  onClick={() => setSelectedNotification(null)}
                  className={`p-4 rounded-2xl font-black text-sm transition-all active:scale-[0.98] ${selectedNotification.metadata?.path ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' : 'flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                >
                  {language === 'vi' ? 'Đóng' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
