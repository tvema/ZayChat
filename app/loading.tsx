'use client';

export default function Loading() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-neutral-100 dark:bg-neutral-900">
      <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-900/30 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
    </div>
  );
}
