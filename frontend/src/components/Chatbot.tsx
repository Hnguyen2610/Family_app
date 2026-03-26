'use client';

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { FiSend, FiMessageSquare, FiUser, FiCalendar, FiTrash2, FiPlus, FiMessageCircle } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Thread {
  id: string;
  title: string;
  lastMessageAt: string;
}

export default function Chatbot() {
  const { t, language } = useTranslation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const familyId = user?.familyId || process.env.NEXT_PUBLIC_FAMILY_ID || '';

  // Auto-scroll to bottom within the container
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  useEffect(() => {
    if (familyId) fetchThreads();
  }, [familyId]);

  const fetchThreads = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/threads/family/${familyId}`);
      setThreads(response.data);
    } catch (error) {
      console.error('Failed to fetch threads:', error);
    }
  };

  const startNewThread = () => {
    setCurrentThreadId(null);
    setMessages([]);
    setIsSidebarOpen(false);
  };

  const loadThread = async (threadId: string) => {
    setCurrentThreadId(threadId);
    setIsLoading(true);
    try {
      const response = await axios.get(`http://localhost:3000/threads/${threadId}/messages`);
      setMessages(response.data.map((m: any) => ({
        role: m.role,
        content: m.content
      })));
      setIsSidebarOpen(false);
    } catch (error) {
      console.error('Failed to load thread messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    if (!confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa hội thoại này?' : 'Delete this conversation?')) return;
    try {
      await axios.delete(`http://localhost:3000/threads/${threadId}`);
      if (currentThreadId === threadId) startNewThread();
      fetchThreads();
    } catch (error) {
      console.error('Failed to delete thread:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:3000/chat', {
        message: userMessage,
        familyId,
        threadId: currentThreadId,
      });

      if (!currentThreadId && response.data.threadId) {
        setCurrentThreadId(response.data.threadId);
        fetchThreads();
      }

      setMessages(prev => [...prev, { role: 'assistant', content: response.data.response }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: t('common.error') }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[600px] md:h-[700px] bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl relative border border-slate-100 dark:border-slate-800 transition-colors duration-500">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Thread History */}
      <div className={`
        absolute inset-y-0 left-0 w-72 bg-slate-50 dark:bg-slate-950 border-r border-slate-100 dark:border-slate-800 z-50 transition-transform duration-300 md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 h-full flex flex-col">
          <button
            onClick={startNewThread}
            className="w-full flex items-center justify-center gap-2 p-4 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all active:scale-[0.98] mb-6"
          >
            <FiPlus /> {language === 'vi' ? 'Chat mới' : 'New Chat'}
          </button>

          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest px-2 mb-4">Lịch sử hội thoại</h3>
            {threads.map(thread => (
              <div
                key={thread.id}
                onClick={() => loadThread(thread.id)}
                className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${
                  currentThreadId === thread.id 
                    ? 'bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40 shadow-sm' 
                    : 'hover:bg-white dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <FiMessageSquare className={currentThreadId === thread.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                  <span className={`text-xs font-bold truncate ${currentThreadId === thread.id ? 'text-slate-800 dark:text-slate-100' : ''}`}>
                    {thread.title || (language === 'vi' ? 'Hội thoại mới' : 'New Chat')}
                  </span>
                </div>
                <button
                  onClick={(e) => deleteThread(e, thread.id)}
                  className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all"
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 md:hidden bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-500"
            >
              <FiMessageCircle size={20} />
            </button>
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center text-xl md:text-2xl shadow-xl shadow-indigo-100 dark:shadow-none">
              🤖
            </div>
            <div>
              <h2 className="text-base md:text-xl font-black text-slate-800 dark:text-slate-100">{t('nav.chatFull')}</h2>
              <p className="text-[10px] md:text-xs text-emerald-500 font-black uppercase tracking-widest flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                AI Assistant Online
              </p>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 no-scrollbar scroll-smooth"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 md:space-y-8 py-10">
              <div className="w-20 h-20 md:w-32 md:h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2.5rem] flex items-center justify-center text-4xl md:text-6xl animate-float">
                ✨
              </div>
              <div className="max-w-xs md:max-w-md">
                <h3 className="text-xl md:text-3xl font-black text-slate-800 dark:text-slate-100 mb-3 md:mb-4">
                  {language === 'vi' ? 'Tôi là trợ lý ảo của gia đình bạn!' : 'I am your family virtual assistant!'}
                </h3>
                <p className="text-slate-400 dark:text-slate-500 font-medium text-sm md:text-base leading-relaxed">
                  {language === 'vi' ? 'Hãy hỏi tôi về lịch học của con, thực đơn tối nay hoặc nhờ tôi tạo lời nhắc cho cả nhà nhé.' : 'Ask me about the kids\' school schedule, tonight\'s menu, or ask me to create a reminder for the whole family.'}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 w-full max-w-lg px-4">
                {[
                  { text: language === 'vi' ? '📅 Lịch trình tuần tới có gì?' : '📅 What is the schedule for next week?', icon: <FiCalendar /> },
                  { text: language === 'vi' ? '🍽️ Tối nay nhà mình ăn gì?' : '🍽️ What is for dinner tonight?', icon: <FiCalendar /> }
                ].map((hint, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(hint.text)}
                    className="p-4 text-left rounded-2xl bg-slate-50 dark:bg-slate-800 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-900 hover:bg-white dark:hover:bg-slate-900 transition-all text-xs md:text-sm font-bold text-slate-600 dark:text-slate-300 group shadow-sm flex items-center gap-3"
                  >
                    <span className="text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">{hint.icon}</span>
                    {hint.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <div 
                  key={`${m.role}-${i}`} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
                >
                  <div className={`flex gap-3 md:gap-4 max-w-[85%] md:max-w-[75%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl shrink-0 flex items-center justify-center shadow-lg ${
                      m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-100 dark:border-slate-700'
                    }`}>
                      {m.role === 'user' ? <FiUser size={16} /> : <FiMessageSquare size={16} />}
                    </div>
                    <div 
                      className={`p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] text-sm md:text-base leading-relaxed ${
                        m.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-tr-none shadow-xl shadow-indigo-100 dark:shadow-none font-medium' 
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800 rounded-tl-none shadow-sm'
                      }`}
                      role="text"
                    >
                      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-black prose-headings:text-indigo-600 dark:prose-headings:text-indigo-400 prose-code:bg-slate-100 dark:prose-code:bg-slate-900 prose-code:px-1 prose-code:rounded-md prose-code:text-indigo-600 dark:prose-code:text-indigo-400 font-bold">
                        <ReactMarkdown>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-4 max-w-[75%]">
                    <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-100 dark:border-slate-800 flex items-center justify-center animate-pulse shadow-sm">
                      <FiMessageSquare />
                    </div>
                    <div className="bg-white/50 dark:bg-slate-800/50 p-6 rounded-[2rem] rounded-tl-none border border-slate-100 dark:border-slate-800">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-4 md:p-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800 relative z-10">
          <form onSubmit={handleSubmit} className="flex gap-3 md:gap-4 max-w-4xl mx-auto">
            <div className="flex-1 relative group">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chat.placeholder')}
                className="w-full p-4 md:p-5 pr-16 rounded-2xl md:rounded-3xl bg-slate-50 dark:bg-slate-800 border-transparent focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 outline-none transition-all text-sm md:text-base font-bold shadow-inner placeholder:text-slate-400 dark:text-slate-200"
                disabled={isLoading}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center transition-all ${
                    input.trim() && !isLoading
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-300 dark:text-slate-600'
                  }`}
                >
                  <FiSend className={isLoading ? 'animate-pulse' : ''} />
                </button>
              </div>
            </div>
          </form>
          <p className="text-center mt-4 text-[9px] md:text-[10px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest">
            {language === 'vi' ? 'AI có thể nhầm lẫn. Hãy kiểm tra lại thông tin quan trọng.' : 'AI can make mistakes. Please double check important information.'}
          </p>
        </div>
      </div>
    </div>
  );
}
