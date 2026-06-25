'use client';

import { useState, useRef, useEffect } from 'react';
import { chatAPI, usersAPI, type ChatUsage } from '@/lib/api-client';
import { FiSend, FiMessageSquare, FiUser, FiCalendar, FiTrash2, FiPlus, FiMessageCircle, FiX, FiActivity, FiTrendingUp, FiCpu, FiImage, FiBookOpen, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { parseMemoryProfile } from '@/utils/ai-memory-profile';

import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  cached?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

const MAX_IMAGE_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_CHARS = 2_400_000;
const MAX_IMAGE_DIMENSION = 1600;

export default function Chatbot() {
  const { language } = useTranslation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [model, setModel] = useState<'gemini' | 'groq'>('groq');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [usageByModel, setUsageByModel] = useState<Partial<Record<'gemini' | 'groq', ChatUsage>>>({
    groq: {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      contextWindow: 131072,
      totalTokens: 0,
      maxOutputTokens: 1024,
      quota: { source: 'unavailable' }
    } as any,
    gemini: {
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      contextWindow: 1048576,
      totalTokens: 0,
      maxOutputTokens: 2048,
      quota: { source: 'unavailable' }
    } as any
  });
  const [streamStatus, setStreamStatus] = useState('');
  const [memoryConsent, setMemoryConsent] = useState<{ type: string; value: string } | null>(null);
  const [ragConsent, setRagConsent] = useState<{ title: string; content: string; category: string } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const { user, currentFamilyId } = useAuth();

  const familyId = currentFamilyId || '';
  const activeUsage = usageByModel[model];

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error || new Error('Unable to read image file'));
      reader.readAsDataURL(file);
    });

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to load image'));
      image.src = src;
    });

  const compressImageFile = async (file: File): Promise<string> => {
    const originalDataUrl = await fileToDataUrl(file);
    const image = await loadImage(originalDataUrl);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return originalDataUrl;

    context.drawImage(image, 0, 0, width, height);
    const qualities = [0.82, 0.72, 0.62, 0.52];
    for (const quality of qualities) {
      const compressed = canvas.toDataURL('image/jpeg', quality);
      if (compressed.length <= MAX_IMAGE_DATA_URL_CHARS) return compressed;
    }

    return canvas.toDataURL('image/jpeg', 0.45);
  };

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
    
    // Load persisted usage
    const savedUsage = localStorage.getItem(`ai_usage_${familyId}`);
    if (savedUsage) {
      try {
        setUsageByModel(JSON.parse(savedUsage));
      } catch (e) {
        console.warn('Failed to parse saved AI usage');
      }
    }
  }, [familyId]);

  useEffect(() => {
    if (familyId && Object.keys(usageByModel).length > 0) {
      localStorage.setItem(`ai_usage_${familyId}`, JSON.stringify(usageByModel));
    }
  }, [usageByModel, familyId]);

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
    setUsageByModel({});
    setIsSidebarOpen(false);
  };

  const formatTokens = (value?: number) => {
    if (value === undefined) return '--';
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
  };

  const formatQuota = (usage?: ChatUsage) => {
    if (!usage || usage.quota.source !== 'headers') return language === 'vi' ? 'Chưa rõ' : 'Unknown';
    if (usage.quota.remainingRequests !== undefined) {
        return `${formatTokens(usage.quota.remainingRequests)} req`;
    }
    return `${formatTokens(usage.quota.remainingTokens)} tok`;
  };

  const getContextLabel = (usage?: ChatUsage) => {
    if (!usage) return '--';
    if (usage.totalTokens > 0) return formatTokens(usage.totalTokens);
    return formatTokens(usage.contextWindow);
  };

  const getContextNote = (usage?: ChatUsage) => {
    if (!usage) return 'No request yet';
    if (usage.contextWindow <= 0) return 'Unknown context';

    const ratio = usage.totalTokens / usage.contextWindow;
    if (ratio >= 1) return 'Full: trim history or fail';
    if (ratio >= 0.9) return 'Near full: old context may trim';
    return 'If full: trim history or fail';
  };

  const getQuotaNote = (usage?: ChatUsage) => {
    if (!usage) return 'No request yet';
    if (usage.quota.source !== 'headers') return 'No remaining header';

    const noRequests =
      usage.quota.remainingRequests !== undefined && usage.quota.remainingRequests <= 0;
    const noTokens = usage.quota.remainingTokens !== undefined && usage.quota.remainingTokens <= 0;
    if (noRequests || noTokens) return 'Full: 429 until reset';

    const lowRequests =
      usage.quota.remainingRequests !== undefined && usage.quota.remainingRequests <= 5;
    const lowTokens =
      usage.quota.remainingTokens !== undefined &&
      usage.quota.remainingTokens <= usage.maxOutputTokens;
    if (lowRequests || lowTokens) return 'Low: next call may 429';

    return 'If empty: 429 until reset';
  };

  const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

  const getContextPercent = (usage?: ChatUsage) => {
    if (!usage?.contextWindow) return 0;
    return clampPercent((usage.totalTokens / usage.contextWindow) * 100);
  };

  const getQuotaPercent = (usage?: ChatUsage) => {
    if (!usage || usage.quota.source !== 'headers') return 0;
    if (usage.quota.limitTokens && usage.quota.remainingTokens !== undefined) {
      return clampPercent((usage.quota.remainingTokens / usage.quota.limitTokens) * 100);
    }
    if (usage.quota.limitRequests && usage.quota.remainingRequests !== undefined) {
      return clampPercent((usage.quota.remainingRequests / usage.quota.limitRequests) * 100);
    }
    return 0;
  };

  const getContextBarColor = (usage?: ChatUsage) => {
    const percent = getContextPercent(usage);
    if (!usage) return 'bg-slate-300 dark:bg-slate-700';
    if (percent >= 95) return 'bg-rose-500';
    if (percent >= 85) return 'bg-amber-500';
    return 'bg-primary';
  };

  const getQuotaBarColor = (usage?: ChatUsage) => {
    const percent = getQuotaPercent(usage);
    if (!usage || usage.quota.source !== 'headers') return 'bg-slate-300 dark:bg-slate-700';
    if (percent <= 5) return 'bg-rose-500';
    if (percent <= 15) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const trackUsage = (usage?: ChatUsage) => {
    if (!usage) return;
    setUsageByModel(prev => ({ ...prev, [usage.provider]: usage }));
  };

  const getStatusLabel = (status: string) => {
    if (!status) return language === 'vi' ? 'Đang tạo câu trả lời' : 'Generating answer';
    const imageLabels: Record<string, string> = {
      compressing_image: language === 'vi' ? 'Đang nén ảnh' : 'Compressing image',
      uploading_image: language === 'vi' ? 'Đang gửi ảnh' : 'Uploading image',
      gemini_reading_image: language === 'vi' ? 'Gemini đang đọc ảnh' : 'Gemini is reading image',
    };
    if (imageLabels[status]) return imageLabels[status];

    const labels: Record<string, string> = {
      direct_response: language === 'vi' ? 'Đang trả kết quả trực tiếp' : 'Returning direct result',
      fetching_gold_price: language === 'vi' ? 'Đang lấy giá vàng' : 'Fetching gold price',
      building_menu: language === 'vi' ? 'Đang gợi ý thực đơn' : 'Building menu',
      checking_calendar: language === 'vi' ? 'Đang kiểm tra lịch' : 'Checking calendar',
      updating_calendar: language === 'vi' ? 'Đang cập nhật lịch' : 'Updating calendar',
      generating_answer: language === 'vi' ? 'Đang tạo câu trả lời' : 'Generating answer',
      reading_horoscope: language === 'vi' ? 'Đang xem tử vi' : 'Reading horoscope',
      reading_image: language === 'vi' ? 'Đang đọc hình ảnh' : 'Reading image',
      model_call: language === 'vi' ? 'Đang gọi AI' : 'Calling AI',
      model_stream_open: language === 'vi' ? 'Đang mở luồng trả lời' : 'Opening response stream',
    };
    return labels[status] || status;
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

  const handleApproveMemory = async () => {
    if (!memoryConsent || !user?.id) return;
    try {
      const currentProfile = parseMemoryProfile(user.notificationSettings);
      const type = memoryConsent.type as keyof typeof currentProfile;
      const list = [...((currentProfile[type] as string[]) || [])];

      if (!list.includes(memoryConsent.value)) {
        list.push(memoryConsent.value);
      }

      await usersAPI.update(user.id, {
        notificationSettings: {
          ...(user.notificationSettings as any || {}),
          aiMemory: {
            ...currentProfile,
            [type]: list,
            lastUpdatedAt: new Date().toISOString()
          }
        }
      });

      toast.success(language === 'vi' ? 'Đã lưu vào bộ nhớ AI' : 'Saved to AI memory');
      setMemoryConsent(null);
    } catch (error) {
      console.error('Failed to save memory:', error);
      toast.error(language === 'vi' ? 'Lỗi lưu thông tin' : 'Save failed');
    }
  };

  const handleApproveRag = async () => {
    if (!ragConsent) return;
    if (!familyId || familyId === 'all') {
      toast.error(language === 'vi' ? 'Hay chon mot gia dinh cu the truoc khi luu vao so tay' : 'Choose a specific family before saving to notes');
      return;
    }

    try {
      await chatAPI.createKnowledgeDocument({
        familyId,
        title: ragConsent.title,
        content: ragConsent.content,
        userId: user?.id,
        metadata: { category: ragConsent.category || 'family', source: 'chat_consent' },
      });
      toast.success(language === 'vi' ? 'Da luu vao so tay gia dinh' : 'Saved to Family Notes');
      setRagConsent(null);
    } catch (error) {
      console.error('Failed to save RAG note:', error);
      toast.error(language === 'vi' ? 'Loi luu vao so tay' : 'Save to notes failed');
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading) return;

    // Auto-switch to gemini if image exists and model is groq (Llama typically doesn't handle images here)
    let activeModel = model;
    if (selectedImage && model === 'groq') {
       activeModel = 'gemini';
       setModel('gemini');
    }

    const userMessage = input.trim();
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setMessages(prev => [...prev, { role: 'user', content: userMessage + (currentImage ? '\n\n[Attached Image]' : '') }]);
    setIsLoading(true);
    setStreamStatus(language === 'vi' ? 'Đang phân tích yêu cầu' : 'Routing request');
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let assistantResponse = '';
      let assistantCached = false;
      let pendingFrame: number | null = null;
      let activeSessionId = currentSessionId;
      const flushAssistantResponse = () => {
        pendingFrame = null;
        setMessages((prev: Message[]) => {
          const last = prev.at(-1);
          if (last && last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { role: 'assistant', content: assistantResponse, cached: assistantCached },
            ];
          }
          return prev;
        });
      };
      const updateSessionId = (sessionId?: string) => {
        if (!sessionId) return;
        activeSessionId = sessionId;
        if (!currentSessionId) {
          setCurrentSessionId(sessionId);
          fetchSessions();
        }
      };

      const getMessageOptions = () => ({
        sessionId: activeSessionId,
        model: activeModel,
        userId: user?.id,
        image: currentImage || undefined,
        signal: abortController.signal,
      });

      try {
        if (currentImage) setStreamStatus(getStatusLabel('uploading_image'));
        await chatAPI.sendMessageStream(
          familyId,
          userMessage,
          (content: string) => {
            assistantResponse += content;
            if (pendingFrame === null) {
              pendingFrame = window.requestAnimationFrame(flushAssistantResponse);
            }
          },
          updateSessionId,
          trackUsage,
          (cached) => {
            assistantCached = cached;
          },
          (status, data) => {
            if (status === 'memory_consent_request' && data?.memory) {
               setMemoryConsent(data.memory);
            } else if (status === 'rag_consent_request' && data?.note) {
               setRagConsent(data.note);
            } else {
               setStreamStatus(getStatusLabel(status));
            }
          },
          getMessageOptions()
        );
      } catch (streamError) {
        if (abortController.signal.aborted) {
          assistantResponse = assistantResponse || (language === 'vi' ? 'Đã hủy yêu cầu.' : 'Request cancelled.');
          flushAssistantResponse();
          return;
        }
        console.warn('Streaming failed, falling back to standard chat:', streamError);
        const response = await chatAPI.sendMessage(familyId, userMessage, getMessageOptions());
        assistantResponse = response.data?.content || '';
        assistantCached = !!response.data?.cached;
        updateSessionId(response.data?.sessionId);
        trackUsage(response.data?.usage);
        flushAssistantResponse();
      }
      if (pendingFrame !== null) {
        window.cancelAnimationFrame(pendingFrame);
        flushAssistantResponse();
      }
    } catch (error) {
      console.error('Chat error:', error);
      const message = error instanceof Error ? error.message : 'Connection failure';
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection failure: ${message}` }]);
    } finally {
      setIsLoading(false);
      setStreamStatus('');
      abortControllerRef.current = null;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SOURCE_BYTES) {
      alert(language === 'vi' ? 'Ảnh quá lớn (max 5MB)' : 'File too large (max 5MB)');
      return;
    }

    try {
      setStreamStatus(getStatusLabel('compressing_image'));
      const compressedImage = await compressImageFile(file);
      if (compressedImage.length > MAX_IMAGE_DATA_URL_CHARS) {
        alert(language === 'vi' ? 'Ảnh vẫn quá lớn sau khi nén. Hãy chọn ảnh nhỏ hơn.' : 'Image is still too large after compression.');
        e.target.value = '';
        return;
      }
      setSelectedImage(compressedImage);
    } catch (error) {
      console.error('Image processing error:', error);
      alert(language === 'vi' ? 'Không thể đọc ảnh này.' : 'Unable to read this image.');
      e.target.value = '';
    } finally {
      setStreamStatus('');
    }
  };

  const cancelStream = () => {
    abortControllerRef.current?.abort();
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
            <FiPlus /> {language === 'vi' ? 'Tạo đoạn chat mới' : 'New chat'}
          </button>

          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{language === 'vi' ? 'Lịch sử chat' : 'Chat History'}</h3>
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
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tighter italic">Family <span className="text-primary not-italic">GPT</span></h2>
              <p className="text-[9px] text-primary font-black uppercase tracking-widest flex items-center gap-1">
                <span className="w-1 h-1 bg-primary rounded-full animate-ping" />
                {language === 'vi' ? 'Đang hoạt động' : 'Processing Active'}
              </p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 w-full sm:w-auto">
            <div className="flex flex-col gap-2 min-w-[220px]">
              <div className="group relative">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    <FiCpu size={10} />
                    Context
                  </span>
                  <span className="text-[8px] font-black uppercase text-slate-500 dark:text-slate-500">
                    {getContextLabel(activeUsage)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${getContextBarColor(activeUsage)}`}
                    style={{ width: `${getContextPercent(activeUsage)}%` }}
                  />
                </div>
                <div className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-slate-950 p-3 text-[10px] font-bold text-slate-600 dark:text-slate-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  <div className="mb-1 font-black uppercase tracking-widest text-primary">Context Window</div>
                  <div>Used: {formatTokens(activeUsage?.totalTokens)}</div>
                  <div>Window: {formatTokens(activeUsage?.contextWindow)}</div>
                  <div>Remaining: {formatTokens(activeUsage?.remainingTokens)}</div>
                  <div className="mt-2 text-slate-500 dark:text-slate-500">{getContextNote(activeUsage)}</div>
                </div>
              </div>

              <div className="group relative">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    <FiCpu size={10} />
                    Quota
                  </span>
                  <span className="text-[8px] font-black uppercase text-slate-500 dark:text-slate-500">
                    {formatQuota(activeUsage)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${getQuotaBarColor(activeUsage)}`}
                    style={{ width: `${getQuotaPercent(activeUsage)}%` }}
                  />
                </div>
                <div className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-60 rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-slate-950 p-3 text-[10px] font-bold text-slate-600 dark:text-slate-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  <div className="mb-1 font-black uppercase tracking-widest text-primary">API Quota</div>
                  <div>Remaining: {formatQuota(activeUsage)}</div>
                  <div>Request limit: {formatTokens(activeUsage?.quota.limitRequests)}</div>
                  <div>Token limit: {formatTokens(activeUsage?.quota.limitTokens)}</div>
                  <div>Reset: {activeUsage?.quota.resetRequests || activeUsage?.quota.resetTokens || '--'}</div>
                  <div className="mt-2 text-slate-500 dark:text-slate-500">{getQuotaNote(activeUsage)}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="px-1 text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-500">
                Model <span className="text-primary">{model}</span>
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
            </div>
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
                  { text: language === 'vi' ? 'Đề xuất  tối nay ăn gì' : 'Nutrition plan analysis', icon: <FiTrendingUp /> }
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
                (m.content || m.role === 'user') && (
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
                          {m.cached && (
                            <div className="mb-3 inline-flex rounded bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                              Cached
                            </div>
                          )}
                          <ReactMarkdown>
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-5">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 border-black/5 dark:border-white/5 text-primary flex items-center justify-center animate-pulse">
                      <FiActivity />
                    </div>
                    <div className="bg-white dark:bg-slate-900/40 p-6 rounded-2xl border border-black/5 dark:border-white/5">
                      <div className="mb-3 text-[9px] font-black uppercase tracking-widest text-primary">
                        {streamStatus || getStatusLabel('')}
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

        {/* Memory Consent Overlay */}
        {memoryConsent && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[90%] max-w-lg glass bg-indigo-50/90 dark:bg-indigo-900/40 p-5 rounded-2xl border-2 border-indigo-500/30 shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-500 backdrop-blur-xl">
             <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500 text-white flex items-center justify-center text-xl shadow-lg shadow-indigo-500/20">
                   <FiBookOpen />
                </div>
                <div className="flex-1">
                   <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">Ghi nhớ thông tin?</h4>
                   <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-widest mt-0.5">AI MEMORY PROPOSAL</p>
                </div>
                <button onClick={() => setMemoryConsent(null)} className="text-slate-400 hover:text-slate-600">
                   <FiX size={18} />
                </button>
             </div>
             <p className="text-sm text-slate-700 dark:text-slate-300 mb-6 font-medium bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-black/5 dark:border-white/5">
                {language === 'vi'
                  ? `Bạn có muốn tôi ghi nhớ rằng: "${memoryConsent.value}"?`
                  : `Should I remember that: "${memoryConsent.value}"?`}
             </p>
             <div className="flex gap-3">
                <button
                   onClick={handleApproveMemory}
                   className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                   <FiCheck /> {language === 'vi' ? 'Đồng ý' : 'Confirm'}
                </button>
                <button
                   onClick={() => setMemoryConsent(null)}
                   className="flex-1 glass bg-white/50 dark:bg-slate-800/50 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-white transition-all"
                >
                   {language === 'vi' ? 'Để sau' : 'Maybe Later'}
                </button>
             </div>
          </div>
        )}

        {/* RAG Consent Overlay */}
        {ragConsent && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[90%] max-w-xl glass bg-emerald-50/90 dark:bg-emerald-950/50 p-5 rounded-2xl border-2 border-emerald-500/30 shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-500 backdrop-blur-xl">
             <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20">
                   <FiBookOpen />
                </div>
                <div className="flex-1">
                   <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">
                     {language === 'vi' ? 'Luu vao so tay?' : 'Save to Family Notes?'}
                   </h4>
                   <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold uppercase tracking-widest mt-0.5">RAG KNOWLEDGE PROPOSAL</p>
                </div>
                <button onClick={() => setRagConsent(null)} className="text-slate-400 hover:text-slate-600">
                   <FiX size={18} />
                </button>
             </div>
             <div className="text-sm text-slate-700 dark:text-slate-300 mb-6 font-medium bg-white/60 dark:bg-black/20 p-3 rounded-lg border border-black/5 dark:border-white/5 space-y-2">
                <div className="font-black text-slate-900 dark:text-slate-100">{ragConsent.title}</div>
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap">{ragConsent.content}</p>
                <div className="inline-flex rounded-md bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                  {ragConsent.category || 'family'}
                </div>
             </div>
             <div className="flex gap-3">
                <button
                   onClick={handleApproveRag}
                   className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                   <FiCheck /> {language === 'vi' ? 'Dong y luu' : 'Confirm Save'}
                </button>
                <button
                   onClick={() => setRagConsent(null)}
                   className="flex-1 glass bg-white/50 dark:bg-slate-800/50 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-white transition-all"
                >
                   {language === 'vi' ? 'De sau' : 'Maybe Later'}
                </button>
             </div>
          </div>
        )}


        {/* Input */}
        <div className="p-8 border-t border-black/5 dark:border-white/5 bg-white/80 dark:bg-slate-950/40 backdrop-blur-xl relative z-10">
          {selectedImage && (
            <div className="max-w-4xl mx-auto mb-4 flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300">
               <div className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-primary group">
                  <img src={selectedImage} alt="selected" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                  >
                    <FiX size={20} />
                  </button>
               </div>
               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full">
                  Image Ready // {model} context
               </p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-4 max-w-4xl mx-auto">
            <div className="flex-1 relative group flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-primary transition-all shrink-0 hover:scale-105"
              >
                <FiImage size={20} />
              </Button>
              <div className="flex-1 relative">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="pr-16 h-12"
                  disabled={isLoading}
                  placeholder={language === 'vi' ? "Nói chuyện với AI..." : "Message AI..."}
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  {isLoading ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={cancelStream}
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                    >
                      <FiX />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={(!input.trim() && !selectedImage)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                        (input.trim() || selectedImage)
                          ? 'shadow-[0_0_15px_rgba(14,165,233,0.4)] hover:scale-105 active:scale-95'
                          : ''
                      }`}
                    >
                      <FiSend />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </form>
          <p className="text-center mt-5 text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">
             Build by NHN
          </p>
        </div>
      </div>
    </div>
  );
}
