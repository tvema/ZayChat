'use client';
import { safeLocalStorage } from '@/lib/safeStorage';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Camera, ArrowRight, UserPlus, CheckCircle2, Languages, Sun, Moon } from 'lucide-react';
import AvatarCropper from '@/components/AvatarCropper';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/components/LanguageProvider';
import { generateRSAKeyPair, exportKey, encryptPrivateKeyWithPassword } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export default function Register() {
  const [step, setStep] = useState(1);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteValid, setInviteValid] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [error, setError] = useState('');
  const { language, setLanguage, t } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (invite) {
      setInviteCode(invite.toUpperCase());
    }
  }, []);

  // Form data
  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });

  // Avatar
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [croppedAvatar, setCroppedAvatar] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = safeLocalStorage.getItem('token');
    const user = safeLocalStorage.getItem('user');
    if (token && user && user !== 'undefined') {
      router.push('/');
    } else {
      // Reset everything for a new user as requested, but keep the private key if it exists
      const pk = safeLocalStorage.getItem('e2e_private_key');
      safeLocalStorage.clear();
      if (pk) safeLocalStorage.setItem('e2e_private_key', pk);
    }
  }, [router]);

  const handleCheckInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode) return;
    
    setCheckingInvite(true);
    setError('');
    
    try {
      const res = await fetch(`/api/invites/check/${inviteCode}`);
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        throw new Error('Server returned invalid response');
      }
      
      if (data.valid) {
        setInviteValid(true);
        setStep(2);
      } else {
        setError(data.message || 'Invalid invite code');
      }
    } catch (err) {
      setError('Error checking invite code');
    } finally {
      setCheckingInvite(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setAvatarSrc(reader.result?.toString() || '');
        setShowCropper(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (blob: Blob) => {
    setCroppedAvatar(blob);
    setAvatarPreview(URL.createObjectURL(blob));
    setShowCropper(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Generate E2EE Keys
      const keyPair = await generateRSAKeyPair();
      const publicKeyJwk = await exportKey(keyPair.publicKey);
      const encryptedPrivateKeyData = await encryptPrivateKeyWithPassword(keyPair.privateKey, formData.password);
      
      const data = new FormData();
      data.append('inviteCode', inviteCode);
      Object.entries(formData).forEach(([key, value]) => {
        data.append(key, value);
      });
      
      data.append('publicKey', publicKeyJwk);
      data.append('encryptedPrivateKey', JSON.stringify(encryptedPrivateKeyData));

      if (croppedAvatar) {
        data.append('avatar', croppedAvatar, 'avatar.jpg');
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        body: data,
      });

      const text = await res.text();
      let result: any = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch (e) {
        throw new Error('Server returned invalid response');
      }

      if (!res.ok) {
        throw new Error(result.error || 'Registration failed');
      }

      // Store the decrypted private key locally for E2EE
      const privateKeyJwk = await exportKey(keyPair.privateKey);
      safeLocalStorage.setItem('e2e_private_key', privateKeyJwk);

      safeLocalStorage.setItem('token', result.token);
      safeLocalStorage.setItem('user', JSON.stringify(result.user));
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-3xl shadow-xl overflow-hidden border border-white/20 dark:border-neutral-800/50 relative z-10"
      >
        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shadow-inner">
              <UserPlus size={24} />
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
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">{t.auth.joinClub}</h1>
          <p className="text-neutral-500 dark:text-gray-400 mb-8">
            {step === 1 ? t.auth.enterInvite : t.auth.completeProfile}
          </p>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm mb-6">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleCheckInvite} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-gray-300 mb-1">{t.auth.useInvite}</label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="block w-full px-4 py-3 border border-neutral-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none transition-all font-mono tracking-widest text-center text-lg bg-white dark:bg-gray-900 text-neutral-900 dark:text-white"
                  placeholder="XXXX-XXXX"
                />
              </div>

              <button
                type="submit"
                disabled={checkingInvite || !inviteCode}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-xl hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all disabled:opacity-70 font-medium"
              >
                {checkingInvite ? t.auth.verifying : t.auth.verifyCode}
                {!checkingInvite && <ArrowRight size={18} />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-gray-700 border-2 border-dashed border-neutral-300 dark:border-gray-600 flex items-center justify-center cursor-pointer overflow-hidden group hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors"
                  >
                    {avatarPreview ? (
                      <div className="relative w-full h-full">
                        <Image 
                          src={avatarPreview} 
                          alt="Avatar preview" 
                          fill 
                          className="object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <Camera className="text-neutral-400 dark:text-gray-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" size={28} />
                    )}
                  </div>
                  {avatarPreview && (
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-1 border-2 border-white dark:border-gray-800">
                      <CheckCircle2 size={16} />
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-gray-300 mb-1">{t.auth.firstName}</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    className="block w-full px-3 py-2 border border-neutral-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-white dark:bg-gray-900 text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-gray-300 mb-1">{t.auth.lastName}</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    className="block w-full px-3 py-2 border border-neutral-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-white dark:bg-gray-900 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-gray-300 mb-1">{t.auth.nickname}</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="block w-full px-3 py-2 border border-neutral-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-white dark:bg-gray-900 text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-gray-300 mb-1">{t.auth.email}</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="block w-full px-3 py-2 border border-neutral-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-white dark:bg-gray-900 text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-gray-300 mb-1">{t.auth.phone}</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="block w-full px-3 py-2 border border-neutral-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-white dark:bg-gray-900 text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-gray-300 mb-1">{t.auth.password}</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="block w-full px-3 py-2 border border-neutral-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none bg-white dark:bg-gray-900 text-neutral-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-xl hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900 transition-all disabled:opacity-70 font-medium mt-6"
              >
                {loading ? t.auth.creatingAccount : t.auth.createAccount}
              </button>
            </form>
          )}

          <div className="mt-8 text-center text-sm text-neutral-500 dark:text-gray-400">
            {t.auth.alreadyHaveAccount}{' '}
            <a href="/login" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
              {t.auth.signIn}
            </a>
          </div>
        </div>
      </motion.div>

      {showCropper && avatarSrc && (
        <AvatarCropper
          imageSrc={avatarSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setShowCropper(false)}
        />
      )}
    </div>
  );
}
