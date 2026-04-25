'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  setThemePreference: () => {},
});

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem('gdg_theme');
  // Also check what's already on the document
  const current = document.documentElement.getAttribute('data-theme');
  if (current && (current === 'light' || current === 'dark')) {
    return current;
  }
  return stored === 'light' || stored === 'dark' ? stored : 'dark';
}

function persistTheme(theme) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('gdg_theme', theme);
  document.cookie = `gdg_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Persist theme whenever it changes
  useEffect(() => {
    persistTheme(theme);
  }, [theme]);

  // Listen for storage changes and custom events
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === 'gdg_theme' && (event.newValue === 'light' || event.newValue === 'dark')) {
        setTheme(event.newValue);
      }
    };

    const onCustomTheme = (event) => {
      const next = event.detail;
      if (next === 'light' || next === 'dark') {
        setTheme(next);
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('gdg-theme-change', onCustomTheme);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('gdg-theme-change', onCustomTheme);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const setThemePreference = (nextTheme) => {
    if (nextTheme === 'light' || nextTheme === 'dark') {
      setTheme(nextTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
