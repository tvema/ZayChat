'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Lock, BellOff, EyeOff, Check, Users, MessageSquare } from 'lucide-react';
import Image from 'next/image';
import { User } from '@/types/chat';
import { useLanguage } from '@/components/LanguageProvider';
import { useGlobalModal } from '@/components/GlobalModalProvider';

interface ContactCirclesModalProps {
  show: boolean;
  onClose: () => void;
  token: string | null;
  contacts: User[];
  contactCircles: any[];
  setContactCircles: (circles: any[]) => void;
  unlockedCircles: string[];
  setUnlockedCircles: React.Dispatch<React.SetStateAction<string[]>>;
  onContactClick: (contact: User) => void;
}

export function ContactCirclesModal({
  show,
  onClose,
  token,
  contacts,
  contactCircles,
  setContactCircles,
  unlockedCircles,
  setUnlockedCircles,
  onContactClick
}: ContactCirclesModalProps) {
  const { t } = useLanguage();
  const { showAlert, showConfirm } = useGlobalModal();
  const [name, setName] = useState('');
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isBlacklist, setIsBlacklist] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedCircle, setSelectedCircle] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const currentCircle = selectedCircle ? contactCircles.find(c => c.id === selectedCircle.id) : null;

  useEffect(() => {
    if (isEditing && currentCircle) {
      setName(currentCircle.name);
      setDoNotDisturb(currentCircle.do_not_disturb === 1);
      setIsHidden(currentCircle.is_hidden === 1);
      setIsBlacklist(currentCircle.is_blacklist === 1);
      setPassword('');
    }
  }, [isEditing, currentCircle]);

  if (!show) return null;

  const handleUnlock = async (circleId: string, pass: string) => {
    try {
      const res = await fetch(`/api/contact-circles/${circleId}/unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: pass })
      });
      if (res.ok) {
        setUnlockedCircles(prev => [...prev, circleId]);
        const circle = contactCircles.find(c => c.id === circleId);
        if (circle) {
          setSelectedCircle(circle);
          setIsCreating(false);
        }
      } else {
        showAlert(t.modals.incorrectPassword);
      }
    } catch (err) {
      console.error('Error unlocking circle:', err);
      showAlert(t.modals.failedUnlock);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const res = await fetch('/api/contact-circles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          do_not_disturb: doNotDisturb,
          is_hidden: isHidden,
          is_blacklist: isBlacklist,
          password: password || undefined
        })
      });

      if (res.ok) {
        const newCircle = await res.json();
        setContactCircles([...contactCircles, newCircle]);
        resetForm();
      }
    } catch (err) {
      console.error('Failed to create circle:', err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCircle || !name.trim()) return;

    try {
      const res = await fetch(`/api/contact-circles/${currentCircle.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          do_not_disturb: doNotDisturb,
          is_hidden: isHidden,
          is_blacklist: isBlacklist,
          password: password || undefined
        })
      });

      if (res.ok) {
        const updatedCircle = await res.json();
        setContactCircles(contactCircles.map(c => c.id === updatedCircle.id ? { ...updatedCircle, members: c.members } : c));
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Failed to update circle:', err);
    }
  };

  const resetForm = () => {
    setName('');
    setDoNotDisturb(false);
    setIsHidden(false);
    setIsBlacklist(false);
    setPassword('');
    setIsCreating(false);
    setIsEditing(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/contact-circles/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        setContactCircles(contactCircles.filter(c => c.id !== id));
        if (selectedCircle?.id === id) setSelectedCircle(null);
      }
    } catch (err) {
      console.error('Failed to delete circle:', err);
    }
  };

  const handleToggleMember = async (circleId: string, contactId: string, isMember: boolean) => {
    try {
      const method = isMember ? 'DELETE' : 'POST';
      let url = isMember 
        ? `/api/contact-circles/${circleId}/members/${contactId}`
        : `/api/contact-circles/${circleId}/members`;

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: isMember ? undefined : JSON.stringify({ contactId })
      });

      if (res.ok) {
        setContactCircles(contactCircles.map(c => {
          if (c.id === circleId) {
            const members = isMember 
              ? c.members.filter((m: any) => m.contact_id !== contactId)
              : [...c.members, { contact_id: contactId }];
            return { ...c, members };
          }
          return c;
        }));
      }
    } catch (err) {
      console.error('Failed to toggle member:', err);
    }
  };

  const visibleCircles = contactCircles.filter(c => c.is_hidden === 0 || unlockedCircles.includes(c.id));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/50">
          <h2 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">{t.modals.contactCircles}</h2>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar: List of circles */}
          <div className="w-1/3 border-r border-neutral-200 dark:border-neutral-800 flex flex-col bg-neutral-50 dark:bg-neutral-900/30">
                <div className="p-3">
                  <button 
                    onClick={() => { setIsCreating(true); setIsEditing(false); setSelectedCircle(null); }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors text-sm font-medium"
                  >
                    <Plus size={16} />
                    {t.modals.newCircle}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {contactCircles.map(circle => {
                    const isLocked = circle.is_hidden === 1 && !unlockedCircles.includes(circle.id);
                    return (
                      <button
                        key={circle.id}
                        onClick={() => {
                          if (isLocked) {
                            const pass = prompt(t.modals.enterPassword);
                            if (pass) handleUnlock(circle.id, pass);
                          } else {
                            setSelectedCircle(circle);
                            setIsCreating(false);
                            setIsEditing(false);
                          }
                        }}
                        className={`w-full text-left px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${selectedCircle?.id === circle.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-600' : 'border-l-4 border-l-transparent'}`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-neutral-800 dark:text-neutral-200 truncate flex items-center gap-2">
                            {circle.name}
                            {isLocked && <Lock size={12} className="text-neutral-400" />}
                          </div>
                          <div className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                            {isLocked ? t.modals.locked : t.modals.membersCount.replace('{{count}}', circle.members.length.toString())}
                            {circle.do_not_disturb === 1 && <BellOff size={10} className="ml-1" />}
                            {circle.is_hidden === 1 && <EyeOff size={10} />}
                            {circle.is_blacklist === 1 && <Trash2 size={10} className="text-red-500" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
          </div>

          {/* Main content: Create or Edit */}
          <div className="flex-1 flex flex-col bg-white dark:bg-neutral-900 overflow-y-auto">
            {isCreating || isEditing ? (
              <form onSubmit={isCreating ? handleCreate : handleUpdate} className="p-6 space-y-4">
                <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4">
                  {isCreating ? t.modals.newCircle : t.modals.editCircle}
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t.modals.circleName}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.modals.circleNamePlaceholder}
                    className="w-full px-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={doNotDisturb}
                      onChange={(e) => setDoNotDisturb(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-neutral-300 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                        <BellOff size={16} className="text-neutral-500" />
                        {t.modals.doNotDisturb}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">{t.modals.doNotDisturbDesc}</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={isHidden}
                      onChange={(e) => setIsHidden(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-neutral-300 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                        <EyeOff size={16} className="text-neutral-500" />
                        {t.modals.hiddenCircle}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">{t.modals.hiddenCircleDesc}</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={isBlacklist}
                      onChange={(e) => setIsBlacklist(e.target.checked)}
                      className="w-4 h-4 text-red-600 rounded border-neutral-300 focus:ring-red-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                        <Trash2 size={16} className="text-red-500" />
                        {t.modals.blacklistCircle}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">{t.modals.blacklistCircleDesc}</div>
                    </div>
                  </label>
                </div>

                {(isHidden || isBlacklist) && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t.modals.passwordOptional}</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t.modals.passwordPlaceholder}
                        className="w-full pl-9 pr-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 dark:text-white"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl font-medium transition-colors"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={!name.trim()}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                  >
                    {isCreating ? t.modals.createCircle : t.modals.saveChanges}
                  </button>
                </div>
              </form>
            ) : currentCircle ? (
              <div className="flex flex-col h-full">
                <div className="p-6 border-b border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">{currentCircle.name}</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsEditing(true)}
                        className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                        title={t.modals.editCircle}
                      >
                        <Plus size={18} className="rotate-45" />
                      </button>
                      {currentCircle.is_hidden === 1 && unlockedCircles.includes(currentCircle.id) && (
                        <button
                          onClick={() => {
                            setUnlockedCircles(prev => prev.filter(id => id !== currentCircle.id));
                            setSelectedCircle(null);
                          }}
                          className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                          title={t.chat.locked}
                        >
                          <Lock size={18} />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(currentCircle.id)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title={t.common.delete}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {currentCircle.do_not_disturb === 1 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
                        <BellOff size={12} /> {t.modals.muted}
                      </span>
                    )}
                    {currentCircle.is_hidden === 1 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium">
                        <EyeOff size={12} /> {t.modals.hidden}
                      </span>
                    )}
                    {currentCircle.is_blacklist === 1 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium">
                        <Trash2 size={12} /> {t.modals.blacklist}
                      </span>
                    )}
                    {currentCircle.password_hash && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium">
                        <Lock size={12} /> {t.modals.passwordProtected}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="p-6 flex-1 overflow-y-auto">
                  <h4 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4">{t.modals.manageMembers}</h4>
                  <div className="space-y-2">
                    {contacts.map(contact => {
                      const isMember = currentCircle.members.some((m: any) => m.contact_id === contact.id);
                      
                      return (
                        <div key={contact.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors border border-transparent hover:border-neutral-100 dark:hover:border-neutral-800">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold overflow-hidden relative">
                              {contact.avatar_url ? (
                                <Image 
                                  src={contact.avatar_url} 
                                  alt="" 
                                  fill 
                                  className="object-cover" 
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                contact.first_name?.[0] || '?'
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-neutral-800 dark:text-neutral-200">{contact.first_name} {contact.last_name}</div>
                              <div className="flex items-center gap-2">
                                <div className="text-xs text-neutral-500">@{contact.username}</div>
                                <button
                                  onClick={() => {
                                    onContactClick(contact);
                                    onClose();
                                  }}
                                  className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  {t.modals.viewProfile}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isMember && (
                              <button
                                onClick={() => {
                                  onContactClick(contact);
                                  onClose();
                                }}
                                className="p-2 rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900 transition-colors"
                                title={t.chat.openChat}
                              >
                                <MessageSquare size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleMember(currentCircle.id, contact.id, isMember)}
                              className={`p-2 rounded-full transition-colors ${
                                isMember 
                                  ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900' 
                                  : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                              }`}
                            >
                              {isMember ? <Check size={18} /> : <Plus size={18} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {contacts.length === 0 && (
                      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">
                        {t.modals.noContacts}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-500 p-6 text-center">
                <div>
                  <Users size={48} className="mx-auto mb-4 opacity-20" />
                  <p>{t.modals.selectCircle}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
