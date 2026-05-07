'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Shield, User as UserIcon } from 'lucide-react';
import { Group, User } from '@/types/chat';
import { useLanguage } from './LanguageProvider';
import { useGlobalModal } from '@/components/GlobalModalProvider';
import { importKey, encryptAESKeyWithRSA } from '@/lib/crypto';

interface GroupMember extends User {
  role: 'admin' | 'member';
  public_key?: string;
}

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: Group | null;
  token: string;
  currentUser: User | null;
  onGroupDeleted?: (groupId: string) => void;
  onAvatarClick?: (type: 'user' | 'group', id?: string) => void;
}

export const GroupInfoModal = ({ isOpen, onClose, group, token, currentUser, onGroupDeleted, onAvatarClick }: GroupInfoModalProps) => {
  const { t } = useLanguage();
  const { showAlert, showConfirm } = useGlobalModal();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{type: 'remove'|'promote'|'delete', userId?: string} | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!group) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/members`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (err) {
      console.error('Failed to fetch group members:', err);
    } finally {
      setIsLoading(false);
    }
  }, [group, token]);

  useEffect(() => {
    if (isOpen && group) {
      fetchMembers();
      setConfirmAction(null);
    }
  }, [isOpen, group, fetchMembers]);

  const handleRemoveMember = async (userId: string) => {
    if (!group) return;
    try {
      let encryptedKeysForRemaining = null;
      let newKeyVersion = null;

      if (group.current_key_version) {
        try {
          const newAesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
          newKeyVersion = group.current_key_version + 1;
          
          const remainingMembers = members.filter(m => m.id !== userId);
          const encryptedKeysObj: Record<string, string> = {};
          
          for (const member of remainingMembers) {
            if (member.public_key) {
              const targetPublicKey = await importKey(member.public_key, 'public');
              const encryptedKey = await encryptAESKeyWithRSA(newAesKey, targetPublicKey);
              encryptedKeysObj[member.id] = encryptedKey;
            }
          }
          
          if (Object.keys(encryptedKeysObj).length > 0) {
            encryptedKeysForRemaining = encryptedKeysObj;
          }
        } catch (e) {
          console.error("Failed to generate and encrypt new group key", e);
        }
      }

      const res = await fetch(`/api/groups/${group.id}/members/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          encrypted_keys: encryptedKeysForRemaining,
          key_version: newKeyVersion
        })
      });
      if (res.ok) {
        fetchMembers();
        setConfirmAction(null);
      } else {
        const data = await res.json();
        showAlert(data.error || t('common.error'));
      }
    } catch (err: any) {
      console.error('Failed to remove member:', err);
      showAlert(err.message);
    }
  };

  const handlePromoteMember = async (userId: string) => {
    if (!group) return;
    try {
      const res = await fetch(`/api/groups/${group.id}/members/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: 'admin' })
      });
      if (res.ok) {
        fetchMembers();
        setConfirmAction(null);
      } else {
        const data = await res.json();
        showAlert(data.error || t('common.error'));
      }
    } catch (err: any) {
      console.error('Failed to promote member:', err);
      showAlert(err.message);
    }
  };

  const handleDeleteGroup = async () => {
    if (!group) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        onClose();
        if (onGroupDeleted) {
          onGroupDeleted(group.id);
        }
      } else {
        const data = await res.json();
        showAlert(data.error || t('common.error'));
      }
    } catch (err: any) {
      console.error('Failed to delete group:', err);
      showAlert(err.message);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  };

  const currentUserMember = members.find(m => m.id === currentUser?.id);
  const isAdmin = currentUserMember?.role === 'admin';

  return (
    <AnimatePresence>
      {isOpen && group && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col max-h-[80vh]"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors z-10"
            >
              <X size={20} />
            </button>
            
            <div className="relative h-32 bg-indigo-600 shrink-0">
              {/* Header background */}
            </div>
            
            <div className="px-6 pb-4 pt-0 relative flex flex-col items-center text-center shrink-0">
              <div 
                className={`w-24 h-24 rounded-2xl bg-white dark:bg-neutral-900 p-1 -mt-12 mb-4 relative z-10 shadow-lg ${isAdmin || group.creator_id === currentUser?.id ? 'cursor-pointer hover:opacity-90' : ''}`}
                onClick={() => {
                  if ((isAdmin || group.creator_id === currentUser?.id) && onAvatarClick) {
                    onAvatarClick('group', group.id);
                  }
                }}
              >
                <div className="w-full h-full rounded-xl bg-indigo-100 dark:bg-indigo-900/30 overflow-hidden relative flex items-center justify-center">
                  {group.avatar_url ? (
                    <Image 
                      src={group.avatar_url} 
                      alt="Avatar" 
                      fill 
                      className="object-cover" 
                      referrerPolicy="no-referrer"
                      unoptimized
                    />
                  ) : (
                    <Users className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                  )}
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{group.name}</h3>
              {group.description && (
                <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm">{group.description}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800">
              <div className="flex items-center justify-between mb-4 sticky top-0 bg-white dark:bg-neutral-900 py-2 z-10">
                <h4 className="text-sm font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{t.modals.groupMembers} ({members.length})</h4>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0 relative">
                        {member.avatar_url ? (
                          <Image 
                            src={member.avatar_url} 
                            alt="Avatar" 
                            fill 
                            className="object-cover" 
                            referrerPolicy="no-referrer"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-600 dark:text-neutral-400 font-bold text-sm">
                            {member.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                          {member.first_name} {member.last_name}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">@{member.username}</p>
                      </div>
                      {member.role === 'admin' ? (
                        <div className="flex items-center gap-1 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full shrink-0">
                          <Shield size={12} />
                          <span className="text-[10px] font-bold uppercase">{t.modals.admin}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 rounded-full shrink-0">
                          <UserIcon size={12} />
                          <span className="text-[10px] font-bold uppercase">{t.modals.member}</span>
                        </div>
                      )}
                      {isAdmin && member.id !== currentUser?.id && (
                        <div className="flex items-center gap-1 shrink-0">
                          {confirmAction?.type === 'promote' && confirmAction.userId === member.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">{t.modals.confirmPromote}</span>
                              <button onClick={() => handlePromoteMember(member.id)} className="text-xs text-indigo-600 dark:text-indigo-400 font-bold px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-md">{t.modals.yes}</button>
                              <button onClick={() => setConfirmAction(null)} className="text-xs text-neutral-500 dark:text-neutral-400 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-md">{t.modals.no}</button>
                            </div>
                          ) : confirmAction?.type === 'remove' && confirmAction.userId === member.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">{t.modals.confirmRemove}</span>
                              <button onClick={() => handleRemoveMember(member.id)} className="text-xs text-red-600 dark:text-red-400 font-bold px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded-md">{t.modals.yes}</button>
                              <button onClick={() => setConfirmAction(null)} className="text-xs text-neutral-500 dark:text-neutral-400 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-md">{t.modals.no}</button>
                            </div>
                          ) : (
                            <>
                              {member.role !== 'admin' && (
                                <button
                                  onClick={() => setConfirmAction({ type: 'promote', userId: member.id })}
                                  className="p-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-md transition-colors"
                                  title={t.modals.promoteToAdmin}
                                >
                                  <Shield size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => setConfirmAction({ type: 'remove', userId: member.id })}
                                  className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md transition-colors"
                                title={t.modals.removeFromGroup}
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {isAdmin && (
              <div className="px-6 pb-6 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                {confirmAction?.type === 'delete' ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-red-600 dark:text-red-400 text-center font-medium">{t.modals.deleteGroupConfirm}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteGroup}
                        disabled={isDeleting}
                        className="flex-1 py-3 px-4 bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-800 font-semibold rounded-xl transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? t.modals.deleting : t.modals.yesDelete}
                      </button>
                      <button
                        onClick={() => setConfirmAction(null)}
                        disabled={isDeleting}
                        className="flex-1 py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 font-semibold rounded-xl transition-colors disabled:opacity-50"
                      >
                        {t.common.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmAction({ type: 'delete' })}
                    className="w-full py-3 px-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold rounded-xl transition-colors"
                  >
                    {t.modals.deleteGroup}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
