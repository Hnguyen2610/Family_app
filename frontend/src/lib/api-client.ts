import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
};

// Chat API
export const chatAPI = {
  sendMessage: (familyId: string, content: string, userId?: string, image?: string, model?: string) =>
    apiClient.post('/api/chat/message', {
      familyId,
      content,
      userId,
      image,
      model,
    }),
  sendMessageStream: async (
    familyId: string,
    content: string,
    onChunk: (text: string) => void,
    onSessionId: (id: string) => void,
    options: { userId?: string; sessionId?: string | null; image?: string; model?: string } = {}
  ) => {
    const { userId, sessionId, image, model } = options;
    const token = typeof window !== 'undefined' ? localStorage.getItem('family_token') : null;
    const response = await fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ familyId, content, userId, sessionId, image, model }),
    });

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
  getAll: (familyId?: string) =>
    familyId ? apiClient.get(`/api/users/family/${familyId}`) : apiClient.get('/api/users'),
  getById: (id: string) => apiClient.get(`/api/users/${id}`),
  create: (data: any) => apiClient.post('/api/users', data),
  update: (id: string, data: any) => apiClient.put(`/api/users/${id}`, data),
  delete: (id: string) => apiClient.delete(`/api/users/${id}`),
};

export const authAPI = {
  loginWithGoogle: (token: string) =>
    apiClient.post('/api/auth/google', { token }),
};

export default apiClient;
