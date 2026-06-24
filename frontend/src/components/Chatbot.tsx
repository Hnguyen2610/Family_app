'use client';

import { useState, useRef, useEffect } from 'react';
import { chatAPI } from '@/lib/api-client';
import { FiSend, FiMessageSquare, FiUser, FiCalendar, FiTrash2, FiPlus, FiMessageCircle, FiX, FiActivity, FiTrendingUp } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

export default function Chatbot() {
  const { language } = useTranslation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [model, setModel] = useState<'gemini' | 'groq'>('gemini');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { user, currentFamilyId } = useAuth();

  const familyId = currentFamilyId || '';

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  useEffect(() => {
    const pendingMsg = localStorage.getItem('pending_chat_prompt');
    if (pendingMsg) {
      setInput(pendingMsg);
      localStorage.removeItem('pending_chat_prompt');
    }
  }, []);

  useEffect(() => {
    if (familyId) fetchSessions();
  }, [familyId]);

  const fetchSessions = async () => {
    try {
      const response = await chatAPI.getSessions(familyId);
      setSessions(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      setSessions([]);
    }
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setIsSidebarOpen(false);
  };

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsLoading(true);
    try {
      const response = await chatAPI.getHistory(familyId, sessionId);
      const history = Array.isArray(response.data) ? [...response.data].reverse() : [];
      setMessages(history.map((m: any) => ({
        role: m.role,
        content: m.content
      })));
      setIsSidebarOpen(false);
    } catch (error) {
      console.error('Failed to load session messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm(language === 'vi' ? 'Hệ thống sẽ xóa vĩnh viễn cấu trúc dữ liệu này. Tiếp tục?' : 'Permanent data deletion. Proceed?')) return;
    try {
      await chatAPI.deleteSession(sessionId, familyId);
      if (currentSessionId === sessionId) startNewSession();
      fetchSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
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
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let assistantResponse = '';
      await chatAPI.sendMessageStream(
        familyId,
        userMessage,
        (content: string) => {
          assistantResponse += content;
          setMessages((prev: Message[]) => {
            const last = prev.at(-1);
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', content: assistantResponse }];
            }
            return prev;
          });
        },
        (sessionId) => {
          if (!currentSessionId) {
            setCurrentSessionId(sessionId);
            fetchSessions();
          }
        },
        {
          sessionId: currentSessionId,
          model: model,
          userId: user?.id
        }
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection failure. Retrying synapse sync...' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[600px] md:h-[750px] glass rounded-2xl overflow-hidden relative border border-black/5 dark:border-white/5 transition-all">

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Session History */}
      <div className={`
        absolute inset-y-0 left-0 bg-white dark:bg-slate-950 border-r border-black/5 dark:border-white/5 z-50 transition-all duration-500
        ${isSidebarOpen ? 'translate-x-0 w-80 opacity-100 visible shadow-2xl' : '-translate-x-full md:translate-x-0 w-0 md:w-0 opacity-0 invisible md:border-none'}
        md:relative
      `}>
        <div className="p-6 h-full flex flex-col">
          <button
            onClick={startNewSession}
            className="btn-primary w-full flex items-center justify-center gap-2 mb-8 uppercase tracking-[0.2em]"
          >
            <FiPlus /> {language === 'vi' ? 'Khởi tạo Synapse' : 'New Synapse'}
          </button>

          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">History Archive</h3>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-2 text-slate-500 hover:text-rose-500"
            >
              <FiX size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
            {Array.isArray(sessions) && sessions.map(session => (
              <div
                key={session.id}
                onClick={() => loadSession(session.id)}
                  className={`group flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all ${
                    currentSessionId === session.id
                      ? 'bg-primary/20 border border-primary/40 text-primary'
                      : 'hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 dark:text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FiMessageSquare className={currentSessionId === session.id ? 'text-primary' : 'text-slate-600'} />
                    <span className={`text-[11px] font-bold truncate ${currentSessionId === session.id ? 'text-slate-900 dark:text-slate-100' : ''}`}>
                      {session.title || (language === 'vi' ? 'Null Session' : 'Null Session')}
                    </span>
                  </div>
                <button
                  onClick={(e) => deleteSession(e, session.id)}
                  className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-500"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative bg-white dark:bg-slate-900/40">
        {/* Header */}
        <header className="px-4 md:px-8 py-4 md:py-6 border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/[0.02] backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-5">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 border border-black/5 dark:border-white/5 rounded-lg text-slate-600 dark:text-slate-500 hover:text-primary transition-all bg-slate-100 dark:bg-white/5"
            >
              <FiMessageCircle size={20} />
            </button>
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-2xl">
              <FiActivity />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tighter italic">Neural <span className="text-primary not-italic">Core</span></h2>
              <p className="text-[9px] text-primary font-black uppercase tracking-widest flex items-center gap-1">
                <span className="w-1 h-1 bg-primary rounded-full animate-ping" />
                {language === 'vi' ? 'Đang hoạt động' : 'Processing Active'}
              </p>
            </div>
          </div>

          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg border border-black/5 dark:border-white/5">
            {['gemini', 'groq'].map((m) => (
              <button
                key={m}
                onClick={() => setModel(m as any)}
                className={`px-4 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all ${model === m ? 'bg-primary text-primary-foreground shadow-lg' : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
              <div className="w-24 h-24 bg-primary/5 rounded-3xl flex items-center justify-center border border-primary/10 relative">
                 <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
                 <FiActivity size={48} className="text-primary relative z-10 animate-soft-float" />
              </div>
              <div className="max-w-md space-y-4">
                <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">
                  {language === 'vi' ? 'Hệ thống đã sẵn sàng.' : 'System Initialized.'}
                </h3>
                <p className="text-slate-500 dark:text-slate-500 font-medium text-sm leading-relaxed">
                  {language === 'vi' ? 'Truy cập vào cơ sở dữ liệu gia đình thông qua giao thức ngôn ngữ tự nhiên. I/O đang hoạt động.' : 'Accessing family datalake via Natural Language Protocol. Primary I/O link established.'}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg px-4 pt-4">
                {[
                  { text: language === 'vi' ? 'Kiểm tra lịch trình tuần tới' : 'Audit next week schedule', icon: <FiCalendar /> },
                  { text: language === 'vi' ? 'Đề xuất dinh dưỡng tối nay' : 'Nutrition plan analysis', icon: <FiTrendingUp /> }
                ].map((hint, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(hint.text)}
                    className="p-5 text-left rounded-xl bg-white dark:bg-slate-900/40 border border-black/5 dark:border-white/5 hover:border-primary/20 transition-all text-[11px] font-bold text-slate-600 dark:text-slate-400 group flex items-center gap-3 shadow-sm"
                  >
                    <span className="text-primary group-hover:scale-110 transition-transform">{hint.icon}</span>
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
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-500`}
                >
                  <div className={`flex gap-5 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border ${
                      m.role === 'user' ? 'bg-primary border-primary/20 text-primary-foreground' : 'bg-slate-200 dark:bg-slate-800 border-black/5 dark:border-white/5 text-primary'
                    }`}>
                      {m.role === 'user' ? <FiUser size={16} /> : <FiActivity size={16} />}
                    </div>
                    <div
                      className={`p-6 rounded-2xl text-sm leading-relaxed border ${
                        m.role === 'user'
                          ? 'bg-primary/20 border-primary/20 text-slate-950 dark:text-slate-100'
                          : 'bg-white dark:bg-slate-900/60 border-black/5 dark:border-white/5 text-slate-900 dark:text-slate-300'
                      }`}
                    >
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-black prose-headings:text-primary prose-code:bg-slate-950 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-primary font-medium">
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
                  <div className="flex gap-5">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 border-black/5 dark:border-white/5 text-primary flex items-center justify-center animate-pulse">
                      <FiActivity />
                    </div>
                    <div className="bg-white dark:bg-slate-900/40 p-6 rounded-2xl border border-black/5 dark:border-white/5">
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

        {/* Input */}
        <div className="p-8 border-t border-black/5 dark:border-white/5 bg-white/80 dark:bg-slate-950/40 backdrop-blur-xl relative z-10">
          <form onSubmit={handleSubmit} className="flex gap-4 max-w-4xl mx-auto">
            <div className="flex-1 relative group">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Neural Input..."
                className="input-field pr-16"
                disabled={isLoading}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    input.trim() && !isLoading
                      ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(14,165,233,0.4)] hover:scale-105 active:scale-95'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
                  }`}
                >
                  <FiSend className={isLoading ? 'animate-pulse' : ''} />
                </button>
              </div>
            </div>
          </form>
          <p className="text-center mt-5 text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">
             Interface Beta v2.0 // Neural Core Processing // Verified Access
          </p>
        </div>
      </div>
    </div>
  );
}
