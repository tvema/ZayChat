'use client';
import { safeSessionStorage, safeLocalStorage } from '@/lib/safeStorage';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { motion } from 'motion/react';
import { KeyRound, User, Lock, ArrowRight, Languages, Sun, Moon } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { decryptPrivateKeyWithPassword, exportKey, generateRSAKeyPair, encryptPrivateKeyWithPassword } from '@/lib/crypto';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    setMounted(true);
    const token = safeLocalStorage.getItem('token');
    const user = safeLocalStorage.getItem('user');
    if (token && user && user !== 'undefined') {
      window.location.href = '/';
    } else {
      // Reset everything for a new user as requested
      safeLocalStorage.clear();
      
      // Check if we were redirected due to session revocation
      if (typeof window !== 'undefined' && window.location.search.includes('revoked=true')) {
        setError(language === 'en' ? 'Your session was terminated from another device. Please log in again.' : 'Ваша сессия была завершена с другого устройства. Пожалуйста, войдите снова.');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [router, language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        throw new Error('Server returned invalid response');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      // Clear any service worker caches or states if needed (non-blocking)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          for (const reg of regs) {
            reg.update().catch(e => console.warn('SW update failed', e));
          }
        }).catch(e => console.warn('Error reading sw registrations', e));
      }

      if (data.user.encrypted_private_key) {
        try {
          const encryptedKeyData = typeof data.user.encrypted_private_key === 'string' 
            ? JSON.parse(data.user.encrypted_private_key) 
            : data.user.encrypted_private_key;
          const privateKey = await decryptPrivateKeyWithPassword(encryptedKeyData, password);
          const privateKeyJwk = await exportKey(privateKey);
          safeLocalStorage.setItem('e2e_private_key', privateKeyJwk);
        } catch (e: any) {
          throw new Error('Не удалось расшифровать приватный ключ. Проверьте пароль или используйте Сброс пароля. ' + (e.message || ''));
        }
      } else {
        // Old user without keys! Generate them now.
        try {
          const keyPair = await generateRSAKeyPair();
          const publicKeyJwk = await exportKey(keyPair.publicKey);
          const privateKeyJwk = await exportKey(keyPair.privateKey);
          const encryptedPrivateKeyData = await encryptPrivateKeyWithPassword(keyPair.privateKey, password);
          
          // Save to server
          const updateRes = await fetch('/api/users/keys', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${data.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              publicKey: publicKeyJwk,
              encryptedPrivateKey: JSON.stringify(encryptedPrivateKeyData)
            })
          });
          
          if (updateRes.ok) {
            safeLocalStorage.setItem('e2e_private_key', privateKeyJwk);
            data.user.public_key = publicKeyJwk;
            data.user.encrypted_private_key = JSON.stringify(encryptedPrivateKeyData);
          } else {
            const errText = await updateRes.text();
            throw new Error('Failed to save encryption keys: ' + errText);
          }
        } catch (e: any) {
          throw new Error('Криптография не поддерживается или произошла ошибка: ' + e.message);
        }
      }

      safeLocalStorage.setItem('token', data.token);
      safeLocalStorage.setItem('user', JSON.stringify(data.user));
      if (typeof window !== 'undefined') {
        safeSessionStorage.setItem('user_password', password);
      }
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = () => {
    safeLocalStorage.clear();
    safeSessionStorage.clear();
    if ('indexedDB' in window) {
      try {
        indexedDB.deleteDatabase('chat_files_db');
        indexedDB.deleteDatabase('shared_files_db');
      } catch (e) {
        console.warn('IDB delete error', e);
      }
    }
    window.location.reload();
  };

  return (
    <div 
      className="min-h-[100dvh] flex items-center justify-center p-4 font-sans relative bg-cover bg-center transition-all duration-700"
      style={{
        backgroundImage: mounted ? `url('${resolvedTheme === 'dark' 
          ? 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1920&auto=format&fit=crop' 
          : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1920&auto=format&fit=crop'}')` 
          : 'none',
        backgroundColor: mounted ? undefined : 'var(--fallback-bg, #f8fafc)',
      }}
    >
      <div className="absolute inset-0 bg-white/40 dark:bg-black/60 backdrop-blur-md"></div>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-3xl shadow-xl overflow-hidden border border-white/20 dark:border-neutral-800/50 relative z-10"
      >
        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shadow-inner">
              <KeyRound size={24} />
            </div>
            <div className="flex items-center gap-2">
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
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">{t.auth.welcome}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mb-8">{t.auth.enterDetails}</p>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm mb-6 border border-red-100 dark:border-red-900/30">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            {/* Anti-autofill hidden trap to trick browser password managers */}
            <input type="text" name="fakeusernameremembered" className="hidden" tabIndex={-1} aria-hidden="true" autoComplete="off" />
            <input type="password" name="fakepasswordremembered" className="hidden" tabIndex={-1} aria-hidden="true" autoComplete="off" />

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t.auth.nickname} / Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  name="unique_chat_username_field"
                  required
                  value={username}
                  autoComplete="new-password"
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600"
                  placeholder={`${t.auth.nickname} or Email`}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">{t.auth.password}</label>
                <a href="/forgot-password" className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                  Забыли пароль?
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  name="unique_chat_password_field"
                  required
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={(e) => e.target.removeAttribute('readonly')}
                  readOnly
                  className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 dark:bg-indigo-500 text-white py-3 px-4 rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-600 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all disabled:opacity-70 font-medium"
            >
              {loading ? t.auth.signingIn : t.auth.signIn}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800 flex flex-col items-center gap-4">
            <div className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">
              {t.auth.noAccount}{' '}
              <a href="/register" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                {t.auth.useInvite}
              </a>
            </div>
            
            <button 
              onClick={handleClearData}
              className="text-[10px] text-neutral-400 hover:text-red-500 transition-colors uppercase tracking-widest font-bold"
            >
              Очистить кэш и данные (Debug Reset)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
