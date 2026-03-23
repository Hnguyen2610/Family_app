import { create } from 'zustand';

interface Event {
  id: string;
  title: string;
  description?: string;
  date: string;
  lunarDate?: string;
  type: string;
}

interface EventStore {
  events: Event[];
  setEvents: (events: Event[]) => void;
  addEvent: (event: Event) => void;
  removeEvent: (id: string) => void;
  updateEvent: (id: string, event: Event) => void;
}

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  setEvents: (events) => set({ events }),
  addEvent: (event) => set((state) => ({ events: [...state.events, event] })),
  removeEvent: (id) =>
    set((state) => ({ events: state.events.filter((e) => e.id !== id) })),
  updateEvent: (id, event) =>
    set((state) => ({
      events: state.events.map((e) => (e.id === id ? event : e)),
    })),
}));

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

interface ChatSession {
  id: string;
  familyId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatStore {
  messages: ChatMessage[];
  sessions: ChatSession[];
  currentSessionId: string | null;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSessionId: (id: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  sessions: [],
  currentSessionId: null,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateLastMessage: (content) =>
    set((state) => {
      if (state.messages.length === 0) return state;
      const newMessages = [...state.messages];
      newMessages[newMessages.length - 1] = {
        ...newMessages[newMessages.length - 1],
        content,
      };
      return { messages: newMessages };
    }),
  setMessages: (messages) => set({ messages }),
  clearMessages: () => set({ messages: [] }),
  setSessions: (sessions) => set({ sessions }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
}));

interface Meal {
  id: string;
  name: string;
  category: string;
  tags?: string[];
}

interface MealStore {
  meals: Meal[];
  suggestions: Meal[];
  setMeals: (meals: Meal[]) => void;
  setSuggestions: (meals: Meal[]) => void;
}

export const useMealStore = create<MealStore>((set) => ({
  meals: [],
  suggestions: [],
  setMeals: (meals) => set({ meals }),
  setSuggestions: (suggestions) => set({ suggestions }),
}));
