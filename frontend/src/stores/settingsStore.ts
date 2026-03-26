import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  theme: 'light' | 'dark' | 'system' | 'scheduled';
  language: 'vi' | 'en';
  setTheme: (theme: 'light' | 'dark' | 'system' | 'scheduled') => void;
  setLanguage: (language: 'vi' | 'en') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'vi',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'family-settings',
    }
  )
);
