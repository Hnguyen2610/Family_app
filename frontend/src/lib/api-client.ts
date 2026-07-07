import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const ACCESS_TOKEN_KEY = 'family_token';
const REFRESH_TOKEN_KEY = 'family_refresh_token';
export const AUTH_EXPIRED_EVENT = 'family_auth_expired';

type ChatSendOptions = {
  userId?: string;
  sessionId?: string | null;
  image?: string;
  model?: string;
  signal?: AbortSignal;
};

type VisionDraftKind = 'auto' | 'receipt' | 'medicine' | 'school_plan';
type VisionDraftStatus = 'DRAFT' | 'CONFIRMED' | 'DISMISSED';
export type AiFeedbackValue = 'correct' | 'wrong' | 'missing_context' | 'wrong_family' | 'wrong_datetime';

export type AiActionProposal = {
  type: 'action_proposal';
  proposalId: string;
  action: string;
  payload: Record<string, any>;
  message?: string;
};

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

let refreshPromise: Promise<string | null> | null = null;
let authExpiredDispatched = false;

function clearAuthCache() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('family_user');
  localStorage.removeItem('family_id');
}

function dispatchAuthExpired() {
  if (authExpiredDispatched) return;
  authExpiredDispatched = true;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

async function refreshAccessToken() {
  if (typeof window === 'undefined') return null;

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  refreshPromise ??= axios
    .post(`${API_URL}/api/auth/refresh`, { refreshToken })
    .then((response) => {
      const { accessToken, refreshToken: nextRefreshToken, user } = response.data;
      if (!accessToken || !nextRefreshToken) return null;

      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
      if (user) localStorage.setItem('family_user', JSON.stringify(user));
      authExpiredDispatched = false;
      return accessToken as string;
    })
    .catch(() => {
      clearAuthCache();
      dispatchAuthExpired();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// Add a request interceptor to include the JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as any;
    const status = error.response?.status;
    const url = originalRequest?.url || '';
    const isAuthRefreshRequest = url.includes('/api/auth/google') || url.includes('/api/auth/refresh');

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthRefreshRequest) {
      originalRequest._retry = true;
      const accessToken = await refreshAccessToken();
      if (accessToken) {
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${accessToken}`,
        };
        return apiClient(originalRequest);
      }
      if (typeof window !== 'undefined') {
        clearAuthCache();
        dispatchAuthExpired();
      }
    }

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
    const buildRequest = (token: string | null) => fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ familyId, content, userId, sessionId, image, model }),
      signal,
    });

    const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    let response = await buildRequest(token);

    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        response = await buildRequest(refreshedToken);
      }
    }

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
            } else if (parsed.type === 'request_log_id') {
              onStatus?.('request_log_id', parsed);
            } else if (parsed.type === 'replace_content') {
              onStatus?.('replace_content', parsed);
            } else if (parsed.type === 'memory_consent_request') {
              onStatus?.('memory_consent_request', parsed);
            } else if (parsed.type === 'action_proposal') {
              onStatus?.('action_proposal', parsed);
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
  getKnowledgeDocument: (id: string, familyId: string) =>
    apiClient.get(`/api/chat/knowledge/${id}`, { params: { familyId } }),
  updateKnowledgeDocument: (id: string, familyId: string, data: {
    title: string;
    content: string;
    metadata?: Record<string, any>;
  }) => apiClient.patch(`/api/chat/knowledge/${id}`, data, { params: { familyId } }),
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
  sendFeedback: (data: {
    requestLogId: string;
    value: AiFeedbackValue;
    source?: 'web' | 'telegram' | 'admin';
    userId?: string;
    comment?: string;
  }) => apiClient.post('/api/chat/feedback', data),
  confirmProposal: (id: string, userId: string) =>
    apiClient.post(`/api/chat/proposals/${id}/confirm`, { userId }),
  rejectProposal: (id: string, userId: string) =>
    apiClient.post(`/api/chat/proposals/${id}/reject`, { userId }),
  getAdminStats: (adminSecret: string, filters?: { model?: string; skill?: string; status?: string; familyId?: string; hasRag?: string }) =>
    apiClient.get('/api/chat/admin/stats', {
      headers: { 'x-admin-secret': adminSecret },
      params: filters,
    }),
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
  refresh: (refreshToken: string) =>
    apiClient.post('/api/auth/refresh', { refreshToken }),
  logout: (refreshToken?: string) =>
    apiClient.post('/api/auth/logout', { refreshToken }),
  getProfile: () => apiClient.get('/api/auth/profile'),
};

export type WeatherSummary = {
  available: boolean;
  provider: string;
  location: string;
  current?: {
    tempC: number;
    feelsLikeC: number;
    condition: string;
    humidity: number;
    windKph: number;
    icon?: string;
    updatedAt?: string;
  };
  tomorrow?: {
    location: string;
    date: string;
    condition: string;
    chanceOfRain: number;
    totalPrecipMm: number;
    maxTempC: number;
    minTempC: number;
  };
};

export const weatherAPI = {
  getSummary: () => apiClient.get<WeatherSummary>('/api/weather/summary'),
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

export const dailyTasksAPI = {
  getAll: (userId: string) =>
    apiClient.get('/api/daily-tasks', { params: { userId } }),
  create: (data: {
    userId: string;
    title: string;
    priority?: number;
    intervalMinutes?: number;
    repeatWeekdays?: number[];
    activeStartTime?: string;
    activeEndTime?: string;
  }) =>
    apiClient.post('/api/daily-tasks', data),
  update: (id: string, data: {
    title?: string;
    priority?: number;
    intervalMinutes?: number;
    repeatWeekdays?: number[];
    activeStartTime?: string;
    activeEndTime?: string;
    isActive?: boolean;
  }) =>
    apiClient.patch(`/api/daily-tasks/${id}`, data),
  reorder: (items: { id: string; priority: number }[]) =>
    apiClient.patch('/api/daily-tasks/reorder', items),
  completeToday: (id: string, userId: string) =>
    apiClient.patch(`/api/daily-tasks/${id}/done`, { userId }),
  remove: (id: string) =>
    apiClient.delete(`/api/daily-tasks/${id}`),
};

export default apiClient;
