'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/components/LanguageProvider';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4 text-center">
      <h1 className="text-6xl font-bold text-red-600 dark:text-red-400 mb-4">Ошибка</h1>
      <h2 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100 mb-6">Что-то пошло не так!</h2>
      <p className="text-neutral-500 dark:text-neutral-400 mb-8 max-w-md">
        {error.message || "Произошла непредвиденная ошибка."}
      </p>
      <button
        onClick={() => reset()}
        className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-lg shadow-indigo-200 dark:shadow-none"
      >
        Попробовать снова
      </button>
    </div>
  );
}
