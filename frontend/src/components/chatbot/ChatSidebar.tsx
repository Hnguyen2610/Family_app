import type { MouseEvent } from 'react';
import { FiMessageSquare, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import type { ChatSession } from './chatbot-types';

type ChatSidebarProps = {
  currentSessionId: string | null;
  isOpen: boolean;
  language: string;
  sessions: ChatSession[];
  onClose: () => void;
  onDeleteSession: (event: MouseEvent, sessionId: string) => void;
  onLoadSession: (sessionId: string) => void;
  onStartNewSession: () => void;
};

export function ChatSidebar({
  currentSessionId,
  isOpen,
  language,
  sessions,
  onClose,
  onDeleteSession,
  onLoadSession,
  onStartNewSession,
}: ChatSidebarProps) {
  return (
    <div
      className={`
        absolute inset-y-0 left-0 bg-white dark:bg-slate-950 border-r border-black/5 dark:border-white/5 z-50 transition-all duration-500
        ${isOpen ? 'translate-x-0 w-80 opacity-100 visible shadow-2xl' : '-translate-x-full md:translate-x-0 w-0 md:w-0 opacity-0 invisible md:border-none'}
        md:relative
      `}
    >
      <div className="p-6 h-full flex flex-col">
        <button
          onClick={onStartNewSession}
          className="btn-primary w-full flex items-center justify-center gap-2 mb-8 uppercase tracking-[0.2em]"
        >
          <FiPlus /> {language === 'vi' ? 'Tạo đoạn chat mới' : 'New chat'}
        </button>

        <div className="flex items-center justify-between mb-8 px-2">
          <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
            {language === 'vi' ? 'Lịch sử chat' : 'Chat History'}
          </h3>
          <button onClick={onClose} className="md:hidden p-2 text-slate-500 hover:text-rose-500">
            <FiX size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
          {Array.isArray(sessions) && sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onLoadSession(session.id)}
              className={`group flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all ${
                currentSessionId === session.id
                  ? 'bg-primary/20 border border-primary/40 text-primary'
                  : 'hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 dark:text-slate-500'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <FiMessageSquare className={currentSessionId === session.id ? 'text-primary' : 'text-slate-600'} />
                <span className={`text-[11px] font-bold truncate ${currentSessionId === session.id ? 'text-slate-900 dark:text-slate-100' : ''}`}>
                  {session.title || 'Null Session'}
                </span>
              </div>
              <button
                onClick={(event) => onDeleteSession(event, session.id)}
                className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-500"
              >
                <FiTrash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
