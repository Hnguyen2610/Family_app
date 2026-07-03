import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { chatAPI, type ChatUsage } from '@/lib/api-client';
import { getStatusLabel, type AiModelProvider } from './chatbot-usage';
import type { MemoryConsent, Message, RagConsent } from './chatbot-types';

type UseChatStreamOptions = {
  currentSessionId: string | null;
  familyId: string;
  language: string;
  model: AiModelProvider;
  selectedImage: string | null;
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
  setInput: Dispatch<SetStateAction<string>>;
  setMemoryConsent: Dispatch<SetStateAction<MemoryConsent | null>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setModel: Dispatch<SetStateAction<AiModelProvider>>;
  setRagConsent: Dispatch<SetStateAction<RagConsent | null>>;
  setSelectedImage: Dispatch<SetStateAction<string | null>>;
  trackUsage: (usage?: ChatUsage) => void;
  userId?: string;
  onSessionCreated: () => void;
};

export function useChatStream({
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
  userId,
  onSessionCreated,
}: UseChatStreamOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [streamStatus, setStreamStatus] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (input: string, messageOverride?: string) => {
    const messageText = messageOverride ?? input;
    if ((!messageText.trim() && !selectedImage) || isLoading) return;

    let activeModel = model;
    if (selectedImage && model === 'groq') {
      activeModel = 'gemini';
      setModel('gemini');
    }

    const userMessage = messageText.trim();
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setMessages((prev) => [...prev, { role: 'user', content: userMessage + (currentImage ? '\n\n[Attached Image]' : '') }]);
    setIsLoading(true);
    setStreamStatus(language === 'vi' ? 'Dang phan tich yeu cau' : 'Routing request');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      let assistantResponse = '';
      let assistantCached = false;
      let assistantRequestLogId: string | undefined;
      let pendingFrame: number | null = null;
      let activeSessionId = currentSessionId;

      const flushAssistantResponse = () => {
        pendingFrame = null;
        setMessages((prev) => {
          const last = prev.at(-1);
          if (last && last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...last, role: 'assistant', content: assistantResponse, cached: assistantCached, requestLogId: assistantRequestLogId },
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
          onSessionCreated();
        }
      };

      const getMessageOptions = () => ({
        sessionId: activeSessionId,
        model: activeModel,
        userId,
        image: currentImage || undefined,
        signal: abortController.signal,
      });

      try {
        if (currentImage) setStreamStatus(getStatusLabel('uploading_image', language));
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
            } else if (status === 'replace_content') {
              assistantResponse = data?.content || assistantResponse;
              if (pendingFrame !== null) {
                window.cancelAnimationFrame(pendingFrame);
                pendingFrame = null;
              }
              flushAssistantResponse();
            } else if (status === 'request_log_id') {
              assistantRequestLogId = data?.requestLogId || assistantRequestLogId;
              flushAssistantResponse();
            } else {
              setStreamStatus(getStatusLabel(status, language));
            }
          },
          getMessageOptions(),
        );
      } catch (streamError) {
        if (abortController.signal.aborted) {
          assistantResponse = assistantResponse || (language === 'vi' ? 'Da huy yeu cau.' : 'Request cancelled.');
          flushAssistantResponse();
          return;
        }
        console.warn('Streaming failed, falling back to standard chat:', streamError);
        const response = await chatAPI.sendMessage(familyId, userMessage, getMessageOptions());
        assistantResponse = response.data?.content || '';
        assistantCached = !!response.data?.cached;
        assistantRequestLogId = response.data?.requestLogId || assistantRequestLogId;
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
      setMessages((prev) => [...prev, { role: 'assistant', content: `Connection failure: ${message}` }]);
    } finally {
      setIsLoading(false);
      setStreamStatus('');
      abortControllerRef.current = null;
    }
  }, [
    currentSessionId,
    familyId,
    isLoading,
    language,
    model,
    onSessionCreated,
    selectedImage,
    setCurrentSessionId,
    setInput,
    setMemoryConsent,
    setMessages,
    setModel,
    setRagConsent,
    setSelectedImage,
    trackUsage,
    userId,
  ]);

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    cancelStream,
    isLoading,
    sendMessage,
    setStreamStatus,
    streamStatus,
  };
}
