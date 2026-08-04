import { useCallback, useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react';
import { chatAPI, type ChatUsage } from '@/lib/api-client';
import type { AiModelProvider } from './chatbot-usage';
import type { ChatSession, Message } from './chatbot-types';

type UseChatSessionsOptions = {
  familyId: string;
  language: string;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setUsageByModel: Dispatch<SetStateAction<Partial<Record<AiModelProvider, ChatUsage>>>>;
};

export function useChatSessions({
  familyId,
  language,
  setMessages,
  setUsageByModel,
}: UseChatSessionsOptions) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await chatAPI.getSessions(familyId);
      setSessions(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      setSessions([]);
    }
  }, [familyId]);

  const startNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setMessages([]);
    setUsageByModel({});
    setIsSidebarOpen(false);
  }, [setMessages, setUsageByModel]);

  const loadSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsSessionLoading(true);
    try {
      const response = await chatAPI.getHistory(familyId, sessionId);
      const history = Array.isArray(response.data) ? [...response.data].reverse() : [];
      setMessages(history.map((message: any) => ({
        role: message.role,
        content: message.content,
      })));
      setIsSidebarOpen(false);
    } catch (error) {
      console.error('Failed to load session messages:', error);
    } finally {
      setIsSessionLoading(false);
    }
  }, [familyId, setMessages]);

  const deleteSession = useCallback(async (event: MouseEvent, sessionId: string) => {
    event.stopPropagation();
    if (!confirm(language === 'vi' ? 'Hệ thống sẽ xóa vĩnh viễn cấu trúc dữ liệu này. Tiếp tục?' : 'Permanent data deletion. Proceed?')) return;
    try {
      await chatAPI.deleteSession(sessionId, familyId);
      if (currentSessionId === sessionId) startNewSession();
      fetchSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [currentSessionId, familyId, fetchSessions, language, startNewSession]);

  useEffect(() => {
    if (familyId) fetchSessions();
  }, [familyId, fetchSessions]);

  // Restore the last active session for this family so a page reload (F5) lands back in the
  // same conversation instead of the blank "no chat yet" screen.
  useEffect(() => {
    if (!familyId) return;
    const savedSessionId = localStorage.getItem(`chat_session_${familyId}`);
    if (savedSessionId) loadSession(savedSessionId);
    // Only run when familyId changes (mount / family switch) — not on every loadSession identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  // Keep the persisted session id in sync so it always reflects what's on screen (new session,
  // switched session, or explicitly started a fresh one).
  useEffect(() => {
    if (!familyId) return;
    if (currentSessionId) {
      localStorage.setItem(`chat_session_${familyId}`, currentSessionId);
    } else {
      localStorage.removeItem(`chat_session_${familyId}`);
    }
  }, [familyId, currentSessionId]);

  return {
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
  };
}
