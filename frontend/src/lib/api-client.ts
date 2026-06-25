import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type ChatSendOptions = {
  userId?: string;
  sessionId?: string | null;
  image?: string;
  model?: string;
  signal?: AbortSignal;
};

type VisionDraftKind = 'auto' | 'receipt' | 'medicine' | 'school_plan';
type VisionDraftStatus = 'DRAFT' | 'CONFIRMED' | 'DISMISSED';

export type ChatUsage = {
  provider: 'groq' | 'gemini';
  model: string;
  contextWindow: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  remainingTokens: number;
  maxOutputTokens: number;
  historyLimit: number;
  source: 'api' | 'estimated';
  quota: {
    source: 'headers' | 'unavailable';
    remainingRequests?: number;
    remainingTokens?: number;
    limitRequests?: number;
    limitTokens?: number;
    resetRequests?: string;
    resetTokens?: string;
    retryAfter?: string;
    note?: string;
  };
};

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('family_token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Events API
export const eventsAPI = {
  getAll: (familyId: string, month?: number, year?: number, userId?: string) =>
    apiClient.get('/api/events', {
      params: { familyId, month, year, userId },
    }),
  getById: (id: string, familyId: string, userId?: string) =>
    apiClient.get(`/api/events/${id}`, { params: { familyId, userId } }),
  create: (familyId: string, userId: string, data: any) =>
    apiClient.post('/api/events', data, {
      params: { familyId, userId },
    }),
  update: (id: string, familyId: string, userId: string, data: any) =>
    apiClient.put(`/api/events/${id}`, data, {
      params: { familyId, userId },
    }),
  delete: (id: string, familyId: string, userId: string) =>
    apiClient.delete(`/api/events/${id}`, {
      params: { familyId, userId },
    }),
};

// Meals API
export const mealsAPI = {
  // Original
  getAll: () => apiClient.get('/api/meals'),
  getById: (id: string) => apiClient.get(`/api/meals/${id}`),
  create: (data: any) => apiClient.post('/api/meals', data),
  update: (id: string, data: any) => apiClient.put(`/api/meals/${id}`, data),
  delete: (id: string) => apiClient.delete(`/api/meals/${id}`),

  // Custom Preferences
  addCustomPreference: (userId: string, mealName: string, category: string) =>
    apiClient.post('/api/meals/preferences/custom', { userId, mealName, category }),
  getUserPreferences: (userId: string) =>
    apiClient.get(`/api/meals/preferences/${userId}`),
  removePreference: (userId: string, mealId: string) =>
    apiClient.delete(`/api/meals/preferences/${userId}/${mealId}`),

  // Suggestions & History
  generateMenu: (familyId: string, userId?: string) =>
    apiClient.get(`/api/meals/family/${familyId}/generate-menu`, {
      params: { userId },
    }),
  getRecentHistory: (familyId: string, days?: number, userId?: string) =>
    apiClient.get('/api/meals/history/recent', {
      params: { familyId, days, userId },
    }),
};

// Chat API
export const chatAPI = {
  sendMessage: (
    familyId: string,
    content: string,
    userIdOrOptions?: string | ChatSendOptions,
    image?: string,
    model?: string
  ) => {
    const options =
      typeof userIdOrOptions === 'object'
        ? userIdOrOptions
        : { userId: userIdOrOptions, image, model };
    const bodyOptions = { ...options };
    delete bodyOptions.signal;

    return apiClient.post('/api/chat/message', {
      familyId,
      content,
      ...bodyOptions,
    });
  },
  sendMessageStream: async (
    familyId: string,
    content: string,
    onChunk: (text: string) => void,
    onSessionId: (id: string) => void,
    onUsage?: (usage: ChatUsage) => void,
    onCached?: (cached: boolean) => void,
    onStatus?: (status: string, data?: any) => void,
    options: ChatSendOptions = {}
  ) => {
    const { userId, sessionId, image, model, signal } = options;
    const token = typeof window !== 'undefined' ? localStorage.getItem('family_token') : null;
    const response = await fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ familyId, content, userId, sessionId, image, model }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Stream request failed: ${response.status}${errorText ? ` - ${errorText.slice(0, 160)}` : ''}`);
    }
    if (!response.body) throw new Error('No readable stream');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              onChunk(parsed.content);
            } else if (parsed.type === 'session_id') {
              onSessionId(parsed.sessionId);
            } else if (parsed.type === 'usage' && parsed.usage) {
              onUsage?.(parsed.usage);
            } else if (parsed.type === 'cached') {
              onCached?.(!!parsed.cached);
            } else if (parsed.type === 'status') {
              onStatus?.(parsed.status, parsed);
            } else if (parsed.type === 'memory_consent_request') {
              onStatus?.('memory_consent_request', parsed);
            }
          } catch (e) {
            // ignore split JSON chunks
          }
        }
      }
    }
  },
  getHistory: (familyId: string, sessionId?: string, limit?: number) =>
    apiClient.get('/api/chat/history', {
      params: { familyId, sessionId, limit },
    }),
  clearHistory: (familyId: string, sessionId?: string) =>
    apiClient.delete(`/api/chat/history/${familyId}`, {
      params: { sessionId },
    }),
  getSessions: (familyId: string) =>
    apiClient.get('/api/chat/sessions', { params: { familyId } }),
  deleteSession: (id: string, familyId: string) =>
    apiClient.delete(`/api/chat/sessions/${id}`, { params: { familyId } }),
  createKnowledgeDocument: (data: {
    familyId: string;
    title: string;
    content: string;
    userId?: string;
    metadata?: Record<string, any>;
  }) => apiClient.post('/api/chat/knowledge', data),
  getKnowledgeDocuments: (familyId: string) =>
    apiClient.get('/api/chat/knowledge', { params: { familyId } }),
  deleteKnowledgeDocument: (id: string, familyId: string) =>
    apiClient.delete(`/api/chat/knowledge/${id}`, { params: { familyId } }),
  createVisionDraft: (data: {
    familyId: string;
    userId?: string;
    image?: string;
    imageUrl?: string;
    kind?: VisionDraftKind;
    note?: string;
  }) => apiClient.post('/api/chat/vision/drafts', data),
  getVisionDrafts: (familyId: string, status?: VisionDraftStatus | 'ALL') =>
    apiClient.get('/api/chat/vision/drafts', {
      params: { familyId, ...(status && status !== 'ALL' ? { status } : {}) },
    }),
  updateVisionDraftStatus: (id: string, familyId: string, status: VisionDraftStatus) =>
    apiClient.patch(`/api/chat/vision/drafts/${id}/status`, { status }, { params: { familyId } }),
  getAdminStats: (adminSecret: string) =>
    apiClient.get('/api/chat/admin/stats', { headers: { 'x-admin-secret': adminSecret } }),
};

// Families API
export const familiesAPI = {
  getAll: () => apiClient.get('/api/families'),
  getById: (id: string) => apiClient.get(`/api/families/${id}`),
  create: (name: string) => apiClient.post('/api/families', { name }),
  update: (id: string, name: string) => apiClient.put(`/api/families/${id}`, { name }),
  delete: (id: string) => apiClient.delete(`/api/families/${id}`),
};

// Users API
export const usersAPI = {
  getAll: (familyId?: string, userId?: string) =>
    familyId ? apiClient.get(`/api/users/family/${familyId}`, { params: { userId } }) : apiClient.get('/api/users'),
  getById: (id: string) => apiClient.get(`/api/users/${id}`),
  create: (data: any) => apiClient.post('/api/users', data),
  update: (id: string, data: any) => apiClient.put(`/api/users/${id}`, data),
  delete: (id: string) => apiClient.delete(`/api/users/${id}`),
};

export const authAPI = {
  loginWithGoogle: (token: string) =>
    apiClient.post('/api/auth/google', { token }),
  getProfile: () => apiClient.get('/api/auth/profile'),
};

export const notificationsAPI = {
  getAll: (userId: string) => apiClient.get('/api/notifications', { params: { userId } }),
  markAsRead: (id: string, userId: string) => apiClient.patch(`/api/notifications/${id}/read`, null, { params: { userId } }),
  markAllAsRead: (userId: string) => apiClient.post('/api/notifications/read-all', null, { params: { userId } }),
  delete: (id: string, userId: string) => apiClient.delete(`/api/notifications/${id}`, { params: { userId } }),
  deleteAll: (userId: string) => apiClient.delete('/api/notifications/all', { params: { userId } }),
  subscribePush: (userId: string, subscription: any) =>
    apiClient.post('/api/notifications/push/subscribe', subscription, { params: { userId } }),
  unsubscribePush: (userId: string, endpoint: string) =>
    apiClient.post('/api/notifications/push/unsubscribe', { endpoint }, { params: { userId } }),
};

export default apiClient;
