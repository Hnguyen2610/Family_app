'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

export default function ThemeManager() {
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (t: 'light' | 'dark' | 'system' | 'scheduled') => {
      let activeTheme = t;

      if (t === 'system') {
        activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else if (t === 'scheduled') {
        const hour = new Date().getHours();
        activeTheme = hour >= 19 || hour < 6 ? 'dark' : 'light';
      }

      if (activeTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);

    // Listen for system theme changes if set to system
    let mediaQuery: MediaQueryList | null = null;
    let handleChange: (() => void) | null = null;

    if (theme === 'system') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
    }

    // Add interval to check for scheduled theme
    const interval = setInterval(() => {
      if (theme === 'scheduled') {
        applyTheme('scheduled');
      }
    }, 60000); // Check every minute

    return () => {
      if (mediaQuery && handleChange) {
        mediaQuery.removeEventListener('change', handleChange);
      }
      clearInterval(interval);
    };
  }, [theme]);

  return null;
}
