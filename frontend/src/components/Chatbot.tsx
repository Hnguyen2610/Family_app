'use client';

import { useState, useRef, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { chatAPI, usersAPI, type AiFeedbackValue, type ChatUsage } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { parseMemoryProfile } from '@/utils/ai-memory-profile';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { compressImageFile, MAX_IMAGE_DATA_URL_CHARS } from '@/lib/image-utils';
import { type MemoryConsent, type Message, type RagConsent } from './chatbot/chatbot-types';
import { createDefaultUsageByModel, getStatusLabel, type AiModelProvider } from './chatbot/chatbot-usage';
import { ChatbotHeader } from './chatbot/ChatbotHeader';
import { ChatInputBar } from './chatbot/ChatInputBar';
import { ChatMessageList } from './chatbot/ChatMessageList';
import { ChatSidebar } from './chatbot/ChatSidebar';
import { MemoryConsentCard } from './chatbot/MemoryConsentCard';
import { RagConsentCard } from './chatbot/RagConsentCard';
import { useChatSessions } from './chatbot/useChatSessions';
import { useChatStream } from './chatbot/useChatStream';

const MAX_IMAGE_SOURCE_BYTES = 8 * 1024 * 1024;

export default function Chatbot() {
  const { language } = useTranslation();
  const { user, currentFamilyId } = useAuth();
  const familyId = currentFamilyId || '';

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [model, setModel] = useState<AiModelProvider>('groq');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [usageByModel, setUsageByModel] = useState<Partial<Record<AiModelProvider, ChatUsage>>>(createDefaultUsageByModel);
  const [memoryConsent, setMemoryConsent] = useState<MemoryConsent | null>(null);
  const [ragConsent, setRagConsent] = useState<RagConsent | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    currentSessionId,
    deleteSession,
    fetchSessions,
    isSessionLoading,
    isSidebarOpen,
    loadSession,
    sessions,
    setCurrentSessionId,
    setIsSidebarOpen,
    startNewSession,
  } = useChatSessions({ familyId, language, setMessages, setUsageByModel });

  const activeUsage = usageByModel[model];
  const trackUsage = (usage?: ChatUsage) => {
    if (!usage) return;
    setUsageByModel((prev) => ({ ...prev, [usage.provider]: usage }));
  };

  const {
    cancelStream,
    isLoading,
    sendMessage,
    setStreamStatus,
    streamStatus,
  } = useChatStream({
    currentSessionId,
    familyId,
    language,
    model,
    selectedImage,
    setCurrentSessionId,
    setInput,
    setMemoryConsent,
    setMessages,
    setModel,
    setRagConsent,
    setSelectedImage,
    trackUsage,
    userId: user?.id,
    onSessionCreated: fetchSessions,
  });

  const isBusy = isLoading || isSessionLoading;

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  useEffect(() => {
    const savedUsage = localStorage.getItem(`ai_usage_${familyId}`);
    if (savedUsage) {
      try {
        setUsageByModel(JSON.parse(savedUsage));
      } catch (error) {
        console.warn('Failed to parse saved AI usage');
      }
    }
  }, [familyId]);

  useEffect(() => {
    if (familyId && Object.keys(usageByModel).length > 0) {
      localStorage.setItem(`ai_usage_${familyId}`, JSON.stringify(usageByModel));
    }
  }, [usageByModel, familyId]);

  useEffect(() => {
    if (!familyId || isBusy) return;

    const pendingMsg = sessionStorage.getItem('pending_chat_prompt');
    if (!pendingMsg?.trim()) return;

    sessionStorage.removeItem('pending_chat_prompt');
    void sendMessage('', pendingMsg);
  }, [familyId, isBusy, sendMessage]);

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
          ...((user.notificationSettings as any) || {}),
          aiMemory: {
            ...currentProfile,
            [type]: list,
            lastUpdatedAt: new Date().toISOString(),
            lastWrite: {
              type: memoryConsent.memoryType || type,
              confidence: memoryConsent.confidence ?? 0.8,
              sourceMessage: memoryConsent.sourceMessage,
              savedAt: new Date().toISOString(),
            },
          },
        },
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
      toast.error(language === 'vi' ? 'Hãy chọn một gia đình cụ thể trước khi lưu vào sổ tay' : 'Choose a specific family before saving to notes');
      return;
    }

    try {
      await chatAPI.createKnowledgeDocument({
        familyId,
        title: ragConsent.title,
        content: ragConsent.content,
        userId: user?.id,
        metadata: {
          category: ragConsent.category || 'family',
          source: 'chat_consent',
          memoryType: ragConsent.memoryType || 'family_fact',
          confidence: ragConsent.confidence ?? 0.8,
          sourceMessage: ragConsent.sourceMessage,
        },
      });
      toast.success(language === 'vi' ? 'Đã lưu vào sổ tay gia đình' : 'Saved to Family Notes');
      setRagConsent(null);
    } catch (error) {
      console.error('Failed to save RAG note:', error);
      toast.error(language === 'vi' ? 'Lỗi lưu vào sổ tay' : 'Save to notes failed');
    }
  };

  const handleFeedback = async (messageIndex: number, value: AiFeedbackValue) => {
    const message = messages[messageIndex];
    if (!message?.requestLogId || message.feedback) return;

    try {
      await chatAPI.sendFeedback({
        requestLogId: message.requestLogId,
        value,
        source: 'web',
        userId: user?.id,
      });
      setMessages((prev) => prev.map((item, index) => (
        index === messageIndex ? { ...item, feedback: value } : item
      )));
      toast.success(language === 'vi' ? 'Đã ghi nhận feedback' : 'Feedback recorded');
    } catch (error) {
      console.error('Failed to send AI feedback:', error);
      toast.error(language === 'vi' ? 'Không gửi được feedback' : 'Feedback failed');
    }
  };

  const handleProposalAction = async (messageIndex: number, action: 'confirm' | 'reject') => {
    const message = messages[messageIndex];
    if (!message?.proposal || !user?.id || message.proposalStatus) return;

    try {
      if (action === 'confirm') {
        await chatAPI.confirmProposal(message.proposal.proposalId, user.id);
      } else {
        await chatAPI.rejectProposal(message.proposal.proposalId, user.id);
      }
      setMessages((prev) => prev.map((item, index) => (
        index === messageIndex
          ? { ...item, proposalStatus: action === 'confirm' ? 'confirmed' : 'rejected' }
          : item
      )));
      toast.success(action === 'confirm'
        ? (language === 'vi' ? 'Đã xác nhận thao tác' : 'Action confirmed')
        : (language === 'vi' ? 'Đã hủy thao tác' : 'Action rejected'));
    } catch (error: any) {
      console.error('Failed to update proposal:', error);
      const serverMessage = error?.response?.data?.message || error?.message;
      toast.error(serverMessage || (language === 'vi' ? 'Không thể cập nhật thao tác' : 'Could not update action'));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await sendMessage(input);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SOURCE_BYTES) {
      alert(language === 'vi' ? 'Ảnh quá lớn (tối đa 8MB)' : 'File too large (max 8MB)');
      return;
    }

    try {
      setStreamStatus(getStatusLabel('compressing_image', language));
      const compressedImage = await compressImageFile(file);
      if (compressedImage.length > MAX_IMAGE_DATA_URL_CHARS) {
        alert(language === 'vi' ? 'Ảnh vẫn quá lớn sau khi nén. Hãy chọn ảnh nhỏ hơn.' : 'Image is still too large after compression.');
        event.target.value = '';
        return;
      }
      setSelectedImage(compressedImage);
    } catch (error) {
      console.error('Image processing error:', error);
      alert(language === 'vi' ? 'Không thể đọc ảnh này.' : 'Unable to read this image.');
      event.target.value = '';
    } finally {
      setStreamStatus('');
    }
  };

  return (
    <div className="flex h-[min(780px,calc(100dvh-92px))] min-h-[560px] md:h-[calc(100dvh-116px)] md:min-h-[680px] bg-card rounded-2xl overflow-hidden relative border border-border transition-all shadow-sm">
      {isSidebarOpen && (
        <div
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <ChatSidebar
        currentSessionId={currentSessionId}
        isOpen={isSidebarOpen}
        language={language}
        sessions={sessions}
        onClose={() => setIsSidebarOpen(false)}
        onDeleteSession={deleteSession}
        onLoadSession={loadSession}
        onStartNewSession={startNewSession}
      />

      <div className="flex-1 flex flex-col relative bg-white dark:bg-slate-900/60">
        <ChatbotHeader
          activeUsage={activeUsage}
          isSidebarOpen={isSidebarOpen}
          language={language}
          model={model}
          setIsSidebarOpen={setIsSidebarOpen}
          setModel={setModel}
          usageByModel={usageByModel}
        />

        <ChatMessageList
          isLoading={isBusy}
          language={language}
          messages={messages}
          scrollContainerRef={scrollContainerRef}
          streamStatus={streamStatus}
          onFeedback={handleFeedback}
          onProposalAction={handleProposalAction}
          onSetInput={setInput}
        />

        {memoryConsent && (
          <MemoryConsentCard
            consent={memoryConsent}
            language={language}
            onApprove={handleApproveMemory}
            onDismiss={() => setMemoryConsent(null)}
          />
        )}

        {ragConsent && (
          <RagConsentCard
            consent={ragConsent}
            language={language}
            onApprove={handleApproveRag}
            onDismiss={() => setRagConsent(null)}
          />
        )}

        <ChatInputBar
          fileInputRef={fileInputRef}
          input={input}
          isLoading={isBusy}
          language={language}
          selectedImage={selectedImage}
          onCancelStream={cancelStream}
          onFileChange={handleFileChange}
          onInputChange={setInput}
          onRemoveImage={() => setSelectedImage(null)}
          onSubmit={handleSubmit}
          onUploadClick={() => fileInputRef.current?.click()}
        />
      </div>
    </div>
  );
}
