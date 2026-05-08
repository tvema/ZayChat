'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, ArrowRight, ShieldCheck, Languages, Sun, Moon } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { generateRSAKeyPair, exportKey, encryptPrivateKeyWithPassword } from '@/lib/crypto';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const { language, setLanguage, t } = useLanguage();
  const searchParams = useSearchParams();
  const token = searchParams ? searchParams.get('token') : null;
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!token) {
      setError('Отсутствует токен сброса пароля (неверная ссылка).');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    if (newPassword.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // 1. Generate entirely new RSA key pair for the user
      const keyPair = await generateRSAKeyPair();
      const publicKeyJwk = await exportKey(keyPair.publicKey);
      
      // 2. Encrypt the private key with the new password
      const encryptedPrivateKeyData = await encryptPrivateKeyWithPassword(keyPair.privateKey, newPassword);
      
      // 3. Send new keys and new password to the server
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword, // We send plaintext to the server, server hashes it with bcrypt
          publicKey: publicKeyJwk,
          encryptedPrivateKey: JSON.stringify(encryptedPrivateKeyData)
        }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при сохранении нового пароля');
      }
      
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div 
        className="min-h-[100dvh] flex items-center justify-center p-4 font-sans py-12 relative bg-cover bg-center transition-all duration-700"
        style={{
          backgroundImage: mounted ? `url('${resolvedTheme === 'dark' 
            ? 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1920&auto=format&fit=crop' 
            : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1920&auto=format&fit=crop'}')` 
            : 'none',
          backgroundColor: mounted ? undefined : 'var(--fallback-bg, #f8fafc)',
        }}
      >
        <div className="absolute inset-0 bg-white/40 dark:bg-black/60 backdrop-blur-md"></div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-3xl p-8 shadow-xl text-center border border-white/20 dark:border-neutral-800/50 relative z-10">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4 relative z-10">
            <ShieldCheck size={32} />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2 relative z-10">Обновлен!</h3>
          <p className="text-neutral-500 dark:text-neutral-400 mb-6 relative z-10">
            Ваш пароль и ключи шифрования успешно обновлены. Теперь вы можете войти в аккаунт. Старые сессии были автоматически завершены.
          </p>
          <a href="/login" className="block w-full text-center bg-indigo-600 dark:bg-indigo-500 text-white py-3 px-4 rounded-xl hover:bg-indigo-700 transition-colors font-medium relative z-10">
            Войти в ZState
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-[100dvh] flex items-center justify-center p-4 font-sans py-12 relative bg-cover bg-center transition-all duration-700"
      style={{
        backgroundImage: mounted ? `url('${resolvedTheme === 'dark' 
          ? 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1920&auto=format&fit=crop' 
          : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1920&auto=format&fit=crop'}')` 
          : 'none',
        backgroundColor: mounted ? undefined : 'var(--fallback-bg, #f8fafc)',
      }}
    >
      <div className="absolute inset-0 bg-white/40 dark:bg-black/60 backdrop-blur-md"></div>
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
          className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100/80 dark:bg-neutral-800/80 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors backdrop-blur-sm"
          title="Change language"
        >
          <Languages size={14} />
          {language === 'en' ? 'RU' : 'EN'}
        </button>
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex items-center justify-center w-8 h-8 bg-neutral-100/80 dark:bg-neutral-800/80 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors backdrop-blur-sm"
          title="Toggle theme"
        >
          {mounted && resolvedTheme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 dark:bg-indigo-500 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-3xl font-bold text-white tracking-widest bg-clip-text">ZS</span>
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2 tracking-tight">Новый пароль</h1>
          <p className="text-neutral-500 dark:text-neutral-400">Придумайте новый пароль для шифрования ключей</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-xl shadow-neutral-200/50 dark:shadow-black/20 border border-neutral-100 dark:border-neutral-800">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-xl border border-red-100 dark:border-red-900/50">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Новый пароль</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600"
                  placeholder="••••••••"
                  disabled={!token}
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Повторите пароль</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600"
                  placeholder="••••••••"
                  disabled={!token}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 dark:bg-indigo-500 text-white py-3 px-4 rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-600 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all disabled:opacity-70 font-medium mt-6"
            >
              {loading ? 'Генерация ключей...' : 'Обновить и войти'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
