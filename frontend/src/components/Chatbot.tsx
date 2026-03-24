'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { chatAPI } from '@/lib/api-client';
import { useChatStore } from '@/stores/store';
import { FiSend, FiZap, FiCoffee, FiCalendar, FiArrowRight, FiPlus, FiClock, FiTrash2, FiX, FiMessageSquare, FiImage } from 'react-icons/fi';

export default function Chatbot() {
  const { 
    messages, addMessage, updateLastMessage, clearMessages, setMessages,
    sessions, setSessions, currentSessionId, setCurrentSessionId 
  } = useChatStore();
  const [input, setInput] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'llama' | 'gemini'>('llama');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const familyId = process.env.NEXT_PUBLIC_FAMILY_ID || 'default-family';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchSessions = async () => {
    try {
      const response = await chatAPI.getSessions(familyId);
      setSessions(response.data || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const fetchHistory = async (sessionId: string | null) => {
    try {
      const response = await chatAPI.getHistory(familyId, sessionId || undefined, 50);
      if (response.data) {
        const formatted = response.data.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })).reverse();
        setMessages(formatted);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setMessages([]);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchHistory(currentSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, currentSessionId]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    clearMessages();
    setIsHistoryOpen(false);
  };

  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id);
    setIsHistoryOpen(false);
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Xóa lịch sử cuộc trò chuyện này?')) return;
    try {
      await chatAPI.deleteSession(id, familyId);
      fetchSessions();
      if (currentSessionId === id) {
        handleNewChat();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Vui lòng chọn ảnh dưới 5MB!');
        return;
      }
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e?: React.FormEvent, text?: string) => {
    e?.preventDefault();
    const messageText = text || input;
    if ((!messageText.trim() && !image) || isLoading) return;

    const userMessage = { role: 'user' as const, content: messageText || '[Đã gửi một hình ảnh]' };
    addMessage(userMessage);
    if (!text) setInput('');
    const currentImage = imagePreview; // Capture before clearing
    removeImage();
    setIsLoading(true);

    // Initial loading state skeleton
    addMessage({ role: 'assistant', content: '' });
    let currentResponse = '';

    try {
      await chatAPI.sendMessageStream(
        familyId, 
        messageText, 
        undefined, 
        currentSessionId,
        currentImage || undefined,
        selectedModel,
        (chunk: string) => {
          setIsLoading(false); // Stop pulse animation once data flows
          currentResponse += chunk;
          updateLastMessage(currentResponse);
        },
        (newId: string) => {
          if (!currentSessionId) {
            setCurrentSessionId(newId);
            fetchSessions();
          }
        }
      );
    } catch (error) {
      console.error('Chat error:', error);
      updateLastMessage('Xin lỗi, tôi gặp chút lỗi kỹ thuật. Hãy thử lại sau nhé!');
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    { text: 'Sự kiện hôm nay', icon: <FiCalendar /> },
    { text: 'Lời chúc hôm nay', icon: <FiZap /> },
    { text: 'Mẹo gia đình', icon: <FiCoffee /> },
  ];

  const handleClear = async () => {
    if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện?')) return;
    try {
      await chatAPI.clearHistory(familyId);
      clearMessages();
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  return (
    <div className="flex flex-col h-[500px] md:h-[650px] overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6 border-b border-slate-100 bg-white/50 backdrop-blur-md shrink-0 relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 cursor-pointer" onClick={handleNewChat}>
            <FiPlus className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base md:text-xl font-black text-slate-800">Family <span className="text-indigo-600">Assistant</span></h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {currentSessionId ? 'Tiếp tục hội thoại' : 'Cuộc trò chuyện mới'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={`p-2.5 rounded-xl transition-all ${isHistoryOpen ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
            title="Lịch sử trò chuyện"
          >
            <FiClock className="w-5 h-5" />
          </button>
          <button 
            onClick={handleClear}
            className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            title="Xóa tin nhắn trong mục này"
          >
            <FiTrash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* History Sidebar/Overlay */}
      {isHistoryOpen && (
        <div className="absolute inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)} />
          <div className="relative w-72 md:w-80 h-full bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-black text-slate-800 flex items-center gap-2">
                <FiClock className="text-indigo-600" /> Lịch sử
              </h4>
              <button onClick={() => setIsHistoryOpen(false)} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
                <FiX />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
              <button 
                onClick={handleNewChat}
                className="w-full flex items-center gap-3 p-3 text-indigo-600 bg-indigo-50/50 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-all border border-indigo-100/50 mb-4"
              >
                <FiPlus /> Cuộc trò chuyện mới
              </button>

              {sessions.length === 0 ? (
                <div className="text-center py-10">
                  <FiMessageSquare className="w-10 h-10 text-slate-100 mx-auto mb-3" />
                  <p className="text-xs text-slate-400 font-medium">Chưa có cuộc trò chuyện nào</p>
                </div>
              ) : (
                sessions.map((s) => (
                  <div 
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    className={`group relative flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all border ${
                      currentSessionId === s.id 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' 
                      : 'bg-white border-transparent hover:border-slate-100 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <FiMessageSquare className={currentSessionId === s.id ? 'text-indigo-200' : 'text-slate-300'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate leading-none mb-1">
                        {s.title || 'Không có tiêu đề'}
                      </p>
                      <p className={`text-[10px] font-medium opacity-60`}>
                        {new Date(s.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className={`p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 ${
                        currentSessionId === s.id ? 'hover:bg-indigo-500 text-white' : 'hover:bg-red-50 text-slate-300 hover:text-red-500'
                      }`}
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-6 bg-slate-50/30 scroll-smooth no-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto animate-in fade-in zoom-in duration-700">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center text-3xl md:text-4xl mb-6 shadow-indigo-100/50">
              👋
            </div>
            <h4 className="text-lg md:text-xl font-black text-slate-800 mb-2">Xin chào gia đình!</h4>
            <p className="text-slate-400 text-xs md:text-sm font-medium leading-relaxed mb-8">
              Tôi là trợ lý ảo của nhà mình. Tôi có thể giúp quản lý lịch, gợi ý hoạt động và kết nối mọi người.
            </p>
            
            <div className="grid grid-cols-1 gap-3 w-full">
              {quickActions.map((action) => (
                <button
                  key={action.text}
                  onClick={() => handleSend(undefined, action.text)}
                  className="flex items-center gap-3 p-3 md:p-4 bg-white rounded-2xl border border-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-600 transition-all font-bold text-xs md:text-sm group text-left"
                >
                  <span className="w-8 h-8 rounded-xl bg-slate-50 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    {action.icon}
                  </span>
                  {action.text}
                  <FiArrowRight className="ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-${m.role === 'user' ? 'right' : 'left'}-4 duration-500`}
            >
              <div
                className={`max-w-[85%] md:max-w-[75%] p-3.5 md:p-5 rounded-[1.5rem] md:rounded-[2rem] text-sm md:text-base font-medium shadow-sm leading-relaxed overflow-hidden ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-200'
                    : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none prose prose-sm md:prose-base prose-slate max-w-none'
                }`}
              >
                {m.role === 'user' ? (
                  m.content.split('[Hệ thống ghi chú:')[0].trim() || '[Hình ảnh đính kèm]'
                ) : (
                  <ReactMarkdown>{m.content || '...'}</ReactMarkdown>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="bg-white p-4 rounded-[2rem] rounded-tl-none border border-slate-100 shadow-sm">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 md:p-8 bg-white border-t border-slate-100 relative shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setSelectedModel('llama')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              selectedModel === 'llama' 
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' 
              : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-indigo-100 hover:text-indigo-600'
            }`}
          >
            Llama 3.3 (Groq)
          </button>
          <button
            onClick={() => setSelectedModel('gemini')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
              selectedModel === 'gemini' 
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' 
              : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-indigo-100 hover:text-indigo-600'
            }`}
          >
            Gemini 1.5 Flash
          </button>
        </div>
        {imagePreview && (
          <div className="mb-3 relative inline-block animate-in fade-in slide-in-from-bottom-2">
            <img src={imagePreview} alt="Preview" className="h-20 md:h-24 rounded-xl object-cover border-2 border-slate-100" />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-600 transition-all"
            >
              <FiX size={14} />
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImageChange}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="w-10 md:w-12 h-10 md:h-12 flex-shrink-0 bg-slate-50 text-indigo-400 rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-all cursor-pointer disabled:opacity-50 border-2 border-transparent"
            title="Đính kèm ảnh"
          >
            <FiImage size={20} />
          </button>
          <div className="relative flex-1 group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={imagePreview ? "Thêm mô tả cho ảnh..." : "Hỏi tôi bất cứ điều gì..."}
              className="w-full pl-6 pr-14 py-3.5 md:py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white rounded-[1.5rem] md:rounded-2xl outline-none transition-all font-medium text-slate-700 text-sm md:text-base placeholder:text-slate-300"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={(!input.trim() && !image) || isLoading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 md:w-11 h-9 md:h-11 bg-indigo-600 text-white rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-30 disabled:shadow-none"
            >
              <FiSend />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


