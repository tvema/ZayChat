'use client';
import { safeLocalStorage } from '@/lib/safeStorage';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User as UserIcon, Mail, Phone, Lock, Save, Loader2, Bell, Sun, Moon, Languages, Image as ImageIcon } from 'lucide-react';
import { User } from '@/types/chat';
import { useLanguage } from '@/components/LanguageProvider';
import { useTheme } from 'next-themes';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { clearAllFiles } from '@/lib/db';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUpdateProfile: (data: { firstName: string; lastName: string; email: string; phone: string }) => Promise<void>;
  onChangePassword: (data: { oldPassword: string; newPassword: string }) => Promise<void>;
  onAvatarClick?: () => void;
}

export const ProfileModal = ({ isOpen, onClose, user, onUpdateProfile, onChangePassword, onAvatarClick }: ProfileModalProps) => {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions'>('profile');
  
  // Profile state
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });

  // Security state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [securityMessage, setSecurityMessage] = useState({ type: '', text: '' });

  // Sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setProfileMessage({ type: '', text: '' });
      setSecurityMessage({ type: '', text: '' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveTab('profile');
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (activeTab === 'sessions' && isOpen) {
      fetchSessions();
    }
  }, [activeTab, isOpen]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const token = safeLocalStorage.getItem('token');
      const res = await fetch('/api/sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const token = safeLocalStorage.getItem('token');
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch (err) {
      console.error('Failed to terminate session', err);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileMessage({ type: '', text: '' });
    try {
      await onUpdateProfile({ firstName, lastName, email, phone });
      setProfileMessage({ type: 'success', text: t.common.success });
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message || t.common.error });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleEmailVerifyClick = async () => {
    try {
      const storedToken = safeLocalStorage.getItem('token');
      const res = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${storedToken}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      setProfileMessage({ type: 'success', text: 'Письмо для подтверждения отправлено на ' + email });
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message });
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setSecurityMessage({ type: 'error', text: t.modals.confirmPassword }); // Using confirmPassword as mismatch message for now or I should add one
      return;
    }
    setIsUpdatingPassword(true);
    setSecurityMessage({ type: '', text: '' });
    try {
      await onChangePassword({ oldPassword, newPassword });
      setSecurityMessage({ type: 'success', text: t.common.success });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setSecurityMessage({ type: 'error', text: err.message || t.common.error });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const PushNotificationToggle = () => {
    const { isSubscribed, permission, subscribeToPush, unsubscribeFromPush } = usePushNotifications(safeLocalStorage.getItem('token'));
    
    const handleToggle = async () => {
      if (!isSubscribed) {
        if (permission === 'denied') {
          alert('Браузер заблокировал уведомления. Вы можете включить их вручную в настройках сайта в браузере.');
        } else {
          try {
            await subscribeToPush(true);
          } catch (e: any) {
             alert(e.message || 'Ошибка включения уведомлений');
          }
        }
      } else {
        await unsubscribeFromPush();
      }
    };

    return (
      <button 
        type="button"
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isSubscribed ? 'bg-indigo-600' : 'bg-neutral-200 dark:bg-neutral-700'}`}
      >
        <span 
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isSubscribed ? 'translate-x-6' : 'translate-x-1'}`} 
        />
      </button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t.common.settings}</h2>
              <button 
                onClick={onClose}
                className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full text-neutral-700 dark:text-neutral-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex border-b border-neutral-100 dark:border-neutral-800 shrink-0">
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'profile' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                {t.common.profile}
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'security' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                {t.chat.changePassword}
              </button>
              <button
                onClick={() => setActiveTab('sessions')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'sessions' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
              >
                {t.modals.sessions}
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {activeTab === 'profile' ? (
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  {profileMessage.text && (
                    <div className={`p-3 rounded-xl text-sm ${profileMessage.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                      {profileMessage.text}
                    </div>
                  )}

                  <div className="flex flex-col items-center justify-center space-y-3 pb-3">
                    <div className="relative group cursor-pointer" onClick={onAvatarClick}>
                      <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold overflow-hidden border-2 border-white dark:border-neutral-800 shadow-xl overflow-hidden hover:opacity-80 transition-opacity">
                        {user.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img 
                            src={user.avatar_url} 
                            alt="Avatar" 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <span className="text-3xl">{user.first_name?.[0] || '?'}</span>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <ImageIcon className="w-6 h-6 text-white mb-1" />
                        </div>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={onAvatarClick}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium"
                    >
                      Изменить аватар
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t.auth.firstName}</label>
                      <div className="relative">
                        <UserIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                        <input 
                          type="text" 
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-neutral-800 dark:text-neutral-100"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t.auth.lastName}</label>
                      <div className="relative">
                        <UserIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                        <input 
                          type="text" 
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-neutral-800 dark:text-neutral-100"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="flex justify-between items-center text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      <span>{t.auth.email}</span>
                      {user.email_verified ? (
                        <span className="text-emerald-500 font-medium">Подтвержден</span>
                      ) : (
                        <button type="button" onClick={handleEmailVerifyClick} className="text-indigo-500 hover:underline">Подтвердить</button>
                      )}
                    </label>
                    <div className="relative">
                      <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-neutral-800 dark:text-neutral-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t.auth.phone}</label>
                    <div className="relative">
                      <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                      <input 
                        type="tel" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-neutral-800 dark:text-neutral-100"
                      />
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                           <Bell size={16} /> {t.modals.notificationSettings}
                        </label>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.modals.receivePush}</p>
                      </div>
                      <PushNotificationToggle />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={isUpdatingProfile}
                    className="w-full py-3 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 mt-6"
                  >
                    {isUpdatingProfile ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {t.common.save}
                  </button>

                  <div className="pt-6 mt-6 border-t border-neutral-100 dark:border-neutral-800 space-y-4">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Настройки</h3>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-400">
                          {mounted && resolvedTheme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                        </div>
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          {mounted && resolvedTheme === 'dark' ? t.modals.switchToLightMode : t.modals.switchToDarkMode}
                        </span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          if (mounted) {
                            setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
                          }
                        }}
                        className="py-1 px-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-sm transition-colors text-neutral-700 dark:text-neutral-300"
                      >
                        Переключить
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-600 dark:text-neutral-400">
                          <Languages size={18} />
                        </div>
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Язык интерфейса</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
                        className="py-1 px-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-sm transition-colors text-neutral-700 dark:text-neutral-300"
                      >
                        {language === 'en' ? 'Русский' : 'English'}
                      </button>
                    </div>
                  </div>
                </form>
              ) : activeTab === 'security' ? (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  {securityMessage.text && (
                    <div className={`p-3 rounded-xl text-sm ${securityMessage.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                      {securityMessage.text}
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t.modals.currentPassword}</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                      <input 
                        type="password" 
                        required
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-neutral-800 dark:text-neutral-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t.modals.newPassword}</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                      <input 
                        type="password" 
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-neutral-800 dark:text-neutral-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t.modals.confirmPassword}</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                      <input 
                        type="password" 
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-neutral-800 dark:text-neutral-100"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit" 
                    disabled={isUpdatingPassword}
                    className="w-full py-3 bg-neutral-900 dark:bg-neutral-100 hover:bg-black dark:hover:bg-white text-white dark:text-neutral-900 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 mt-6"
                  >
                    {isUpdatingPassword ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                    {t.chat.changePassword}
                  </button>
                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                      {t.modals.resetDescription}
                    </p>
                    <button 
                      type="button"
                      onClick={async () => {
                        const pk = safeLocalStorage.getItem('e2e_private_key');
                        safeLocalStorage.clear();
                        if (pk) safeLocalStorage.setItem('e2e_private_key', pk);
                        try {
                          await clearAllFiles();
                        } catch (e) {
                          console.error("Failed to clear files cache", e);
                        }
                        window.location.reload();
                      }}
                      className="w-full py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    >
                      {t.modals.resetSession}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{t.modals.activeSessions}</h3>
                  {isLoadingSessions ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="animate-spin text-indigo-500" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sessions.map(session => (
                        <div key={session.id} className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700/50 flex flex-col gap-2 relative">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100">{session.device_info}</span>
                              {session.is_current && (
                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] uppercase tracking-wider font-bold rounded-full">{t.modals.currentSession}</span>
                              )}
                            </div>
                            {!session.is_current && (
                              <button 
                                onClick={() => handleTerminateSession(session.id)}
                                className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                              >
                                {t.modals.terminateSession}
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 flex flex-col gap-1">
                            <span>{t.modals.ipAddress} {session.ip_address}</span>
                            <span>{t.modals.lastActive} {new Date(session.last_active).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
