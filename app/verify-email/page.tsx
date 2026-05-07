'use client';
import { safeLocalStorage } from '@/lib/safeStorage';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MailCheck, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { useSearchParams } from 'next/navigation';

export default function VerifyEmail() {
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const token = searchParams ? searchParams.get('token') : null;

  useEffect(() => {
    if (!token) {
      setError('Отсутствует токен подтверждения (неверная ссылка).');
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Ошибка подтверждения email');
        }
        
        // Update local storage user object if it exists
        const userStr = safeLocalStorage.getItem('user');
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            user.email_verified = true;
            safeLocalStorage.setItem('user', JSON.stringify(user));
          } catch (e) {}
        }

        setSuccess(true);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-xl text-center border border-neutral-100 dark:border-neutral-800">
        
        {loading ? (
          <div>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-neutral-500">Проверка...</p>
          </div>
        ) : success ? (
          <div>
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailCheck size={32} />
            </div>
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Email подтвержден!</h3>
            <p className="text-neutral-500 dark:text-neutral-400 mb-6">
              Ваш email адрес успешно подтвержден. Теперь вы можете отправлять приглашения новым пользователям.
            </p>
            <a href="/" className="block w-full text-center bg-indigo-600 dark:bg-indigo-500 text-white py-3 px-4 rounded-xl hover:bg-indigo-700 transition-colors font-medium">
              Вернуться в чат
            </a>
          </div>
        ) : (
          <div>
            <div className="p-3 mb-6 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-xl border border-red-100 dark:border-red-900/50">
              {error}
            </div>
            <a href="/" className="block w-full text-center bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white py-3 px-4 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors font-medium">
              На главную
            </a>
          </div>
        )}
      </motion.div>
    </div>
  );
}
