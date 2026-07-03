import type { RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import { FiActivity, FiCalendar, FiFlag, FiTrendingUp, FiUser, FiThumbsDown, FiThumbsUp } from 'react-icons/fi';
import type { AiFeedbackValue } from '@/lib/api-client';
import { FEEDBACK_OPTIONS, type Message } from './chatbot-types';
import { getStatusLabel } from './chatbot-usage';

type ChatMessageListProps = {
  isLoading: boolean;
  language: string;
  messages: Message[];
  scrollContainerRef: RefObject<HTMLDivElement>;
  streamStatus: string;
  onFeedback: (messageIndex: number, value: AiFeedbackValue) => void;
  onSetInput: (input: string) => void;
};

function getFeedbackIcon(icon: 'up' | 'down' | 'flag') {
  if (icon === 'up') return <FiThumbsUp size={12} />;
  if (icon === 'down') return <FiThumbsDown size={12} />;
  return <FiFlag size={12} />;
}

export function ChatMessageList({
  isLoading,
  language,
  messages,
  scrollContainerRef,
  streamStatus,
  onFeedback,
  onSetInput,
}: ChatMessageListProps) {
  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto p-4 md:p-8 xl:px-12 space-y-6 md:space-y-10 no-scrollbar"
    >
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-start md:justify-center text-center space-y-5 md:space-y-8 pt-3 md:pt-0">
          <div className="hidden sm:flex w-16 h-16 md:w-24 md:h-24 bg-primary/5 rounded-2xl md:rounded-3xl items-center justify-center border border-primary/10 relative">
            <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
            <FiActivity className="w-8 h-8 md:w-12 md:h-12 text-primary relative z-10 animate-soft-float" />
          </div>
          <div className="max-w-md space-y-3 md:space-y-4">
            <h3 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">
              {language === 'vi' ? 'Hệ thống đã sẵn sàng.' : 'System Initialized.'}
            </h3>
            <p className="text-slate-500 dark:text-slate-500 font-medium text-xs md:text-sm leading-relaxed">
              {language === 'vi'
                ? 'Truy cập vào cơ sở dữ liệu gia đình thông qua giao thức ngôn ngữ tự nhiên. I/O đang hoạt động.'
                : 'Accessing family datalake via Natural Language Protocol. Primary I/O link established.'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 w-full max-w-lg px-1 md:px-4 pt-1 md:pt-4">
            {[
              { text: language === 'vi' ? 'Kiểm tra' : 'Audit next week schedule', icon: <FiCalendar /> },
              { text: language === 'vi' ? 'Đề xuất hôm nay ăn gì' : 'Nutrition plan analysis', icon: <FiTrendingUp /> },
            ].map((hint, index) => (
              <button
                key={index}
                onClick={() => onSetInput(hint.text)}
                className="p-3 md:p-5 text-left rounded-xl bg-white dark:bg-slate-900/40 border border-black/5 dark:border-white/5 hover:border-primary/20 transition-all text-[11px] font-bold text-slate-600 dark:text-slate-400 group flex items-center gap-3 shadow-sm"
              >
                <span className="text-primary group-hover:scale-110 transition-transform">{hint.icon}</span>
                {hint.text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {messages.map((message, index) => (
            (message.content || message.role === 'user') && (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-500`}
              >
                <div className={`flex gap-3 md:gap-5 max-w-[96%] md:max-w-[92%] xl:max-w-[88%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl shrink-0 flex items-center justify-center border ${
                    message.role === 'user' ? 'bg-primary border-primary/20 text-primary-foreground' : 'bg-slate-200 dark:bg-slate-800 border-black/5 dark:border-white/5 text-primary'
                  }`}>
                    {message.role === 'user' ? <FiUser size={16} /> : <FiActivity size={16} />}
                  </div>
                  <div
                    className={`p-4 md:p-6 rounded-2xl text-sm leading-relaxed border ${
                      message.role === 'user'
                        ? 'bg-primary/20 border-primary/20 text-slate-950 dark:text-slate-100'
                        : 'bg-white dark:bg-slate-900/60 border-black/5 dark:border-white/5 text-slate-900 dark:text-slate-300'
                    }`}
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-black prose-headings:text-primary prose-code:bg-slate-950 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-primary font-medium">
                      {message.cached && (
                        <div className="mb-3 inline-flex rounded bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                          Cached
                        </div>
                      )}
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                    {message.role === 'assistant' && message.requestLogId && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 dark:border-white/5 pt-3">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Feedback
                        </span>
                        {message.feedback ? (
                          <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                            {FEEDBACK_OPTIONS.find((option) => option.value === message.feedback)?.label || message.feedback}
                          </span>
                        ) : (
                          FEEDBACK_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => onFeedback(index, option.value)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:border-primary/30 hover:text-primary transition-all"
                            >
                              {getFeedbackIcon(option.icon)}
                              {option.label}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 md:gap-5">
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-200 dark:bg-slate-800 border-black/5 dark:border-white/5 text-primary flex items-center justify-center animate-pulse">
                  <FiActivity />
                </div>
                <div className="bg-white dark:bg-slate-900/40 p-4 md:p-6 rounded-2xl border border-black/5 dark:border-white/5">
                  <div className="mb-3 text-[9px] font-black uppercase tracking-widest text-primary">
                    {streamStatus || getStatusLabel('', language)}
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((n) => (
                      <div key={n} className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${n * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
