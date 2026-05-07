'use client';

import { ShieldCheck } from 'lucide-react';
import { useLanguage } from '../LanguageProvider';

export function WelcomeScreen() {
  const { t } = useLanguage();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 p-8 text-center bg-neutral-50 dark:bg-neutral-950">
      <div className="w-24 h-24 bg-white dark:bg-neutral-900 rounded-full flex items-center justify-center shadow-sm border border-neutral-100 dark:border-neutral-800 mb-6">
        <ShieldCheck size={40} className="text-indigo-200 dark:text-indigo-900/50" />
      </div>
      <h2 className="text-xl font-medium text-neutral-700 dark:text-neutral-300 mb-2">{t('modals.welcomeTitle')}</h2>
      <p className="max-w-md">{t('modals.welcomeDesc')}</p>
    </div>
  );
}
