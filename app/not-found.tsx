'use client';

import { useLanguage } from '@/components/LanguageProvider';

export default function NotFound() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-neutral-100 dark:bg-neutral-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-neutral-600 dark:text-neutral-400">Страница не найдена</p>
      </div>
    </div>
  );
}
