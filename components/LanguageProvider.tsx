'use client';
import { safeLocalStorage } from '@/lib/safeStorage';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations } from '@/lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: any;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ru');

  useEffect(() => {
    const savedLang = safeLocalStorage.getItem('language') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'ru')) {
      setLanguageState(savedLang);
      document.documentElement.lang = savedLang;
    } else {
      // Default to Russian if not set
      setLanguageState('ru');
      document.documentElement.lang = 'ru';
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    safeLocalStorage.setItem('language', lang);
    document.documentElement.lang = lang;
  };

  // Create a t function that supports dot notation and also acts as an object
  const currentTranslations = translations[language];
  
  const t = (key: string, options?: { count?: number }) => {
    const keys = key.split('.');
    let result: any = currentTranslations;
    for (const k of keys) {
      if (result && result[k]) {
        result = result[k];
      } else {
        return key; // Fallback to key if not found
      }
    }
    
    if (typeof result === 'string' && options?.count !== undefined) {
      return result.replace('{{count}}', options.count.toString());
    }
    
    return result;
  };

  // Assign all properties of currentTranslations to the t function
  // to support object-style access like t.chat.appName
  Object.assign(t, currentTranslations);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
