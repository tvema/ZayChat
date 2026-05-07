'use client';
import { safeLocalStorage } from '@/lib/safeStorage';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Search, UserPlus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Group } from '@/types/chat';
import { useLanguage } from './LanguageProvider';
import { useGlobalModal } from './GlobalModalProvider';
import { importKey, decryptAESKeyWithRSA, encryptAESKeyWithRSA } from '@/lib/crypto';
import { keyRing } from '@/lib/keyRing';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  group: Group;
  contacts: User[];
  onMemberAdded: () => void;
}

export function AddMemberModal({ isOpen, onClose, token, group, contacts, onMemberAdded }: AddMemberModalProps) {
  const { t } = useLanguage();
  const { showAlert } = useGlobalModal();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [existingMembers, setExistingMembers] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && group) {
      fetch(`/api/groups/${group.id}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => setExistingMembers(data.map((m: any) => m.id)))
      .catch(err => console.error('Failed to fetch members:', err));
    }
  }, [isOpen, group, token]);

  // Sorting logic for contacts
  const sortedContacts = [...contacts].sort((a, b) => {
    // 1. Online first
    if (a.is_online && !b.is_online) return -1;
    if (!a.is_online && b.is_online) return 1;

    // 2. Sort by last_message_timestamp (descending)
    const timeA = a.last_message_timestamp ? new Date(a.last_message_timestamp).getTime() : 0;
    const timeB = b.last_message_timestamp ? new Date(b.last_message_timestamp).getTime() : 0;
    
    if (timeA !== timeB) {
      return timeB - timeA;
    }

    // 3. Fallback to name
    return (a.first_name || '').localeCompare(b.first_name || '');
  });

  // Filter contacts based on search query
  const filteredContacts = sortedContacts.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.last_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const url = searchQuery.length >= 2 
          ? `/api/users/search?q=${encodeURIComponent(searchQuery)}`
          : `/api/users/search`;
        
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Filter out users that are already in contacts to avoid duplicates
          const contactIds = new Set(contacts.map(c => c.id));
          const newResults = data.filter((u: User) => !contactIds.has(u.id));
          
          // Sort search results too
          newResults.sort((a: User, b: User) => {
            if (a.is_online && !b.is_online) return -1;
            if (!a.is_online && b.is_online) return 1;
            const timeA = a.last_message_timestamp ? new Date(a.last_message_timestamp).getTime() : 0;
            const timeB = b.last_message_timestamp ? new Date(b.last_message_timestamp).getTime() : 0;
            if (timeA !== timeB) return timeB - timeA;
            return (a.first_name || '').localeCompare(b.first_name || '');
          });

          setSearchResults(newResults);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, token, contacts]);

  const handleAddMember = async (userId: string, targetUser: User) => {
    if (group.encrypted_keys && !targetUser.public_key) {
      alert(t('chat.userNoPublicKey') || 'Cannot add user: they need to log in to generate encryption keys first.');
      return;
    }

    setAddingUserId(userId);
    try {
      let encryptedKeysForNewUser: Record<string, string> | null = null;
      
      if (group.encrypted_keys && targetUser.public_key) {
        try {
          let keysObj: Record<string, string>;
          try {
            keysObj = JSON.parse(group.encrypted_keys);
          } catch (e) {
            keysObj = { "1": group.encrypted_keys };
          }
          const privateKeyJwk = safeLocalStorage.getItem('e2e_private_key');
          
          if (privateKeyJwk) {
            const targetPublicKey = await importKey(targetUser.public_key, 'public');
            encryptedKeysForNewUser = {};
            
            for (const [version, encryptedGroupKey] of Object.entries(keysObj)) {
              try {
                const groupAesKey = await keyRing.getAesKey(encryptedGroupKey as string);
                if (groupAesKey) {
                  const encryptedKeyForNewUser = await encryptAESKeyWithRSA(groupAesKey, targetPublicKey);
                  encryptedKeysForNewUser[version] = encryptedKeyForNewUser;
                }
              } catch (e) {
                console.error(`Failed to encrypt group key version ${version} for new member`, e);
              }
            }
            
            if (Object.keys(encryptedKeysForNewUser).length === 0) {
              encryptedKeysForNewUser = null;
            }
          }
        } catch (e) {
          console.error("Failed to process group keys for new member", e);
        }
      }

      const res = await fetch(`/api/groups/${group.id}/members`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          userId,
          encrypted_keys: encryptedKeysForNewUser
        })
      });

      if (res.ok) {
        setExistingMembers(prev => [...prev, userId]);
        onMemberAdded();
      } else {
        const errorData = await res.json();
        showAlert(`${t.common.error}: ${errorData.error || 'Failed to add member'}`);
      }
    } catch (err) {
      console.error('Failed to add member:', err);
      showAlert(t.common.error);
    } finally {
      setAddingUserId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md overflow-hidden bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
              <h2 className="text-xl font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
                <UserPlus className="w-5 h-5" />
                {t.modals.addMembersTitle}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-neutral-500 dark:text-neutral-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 opacity-30 text-neutral-900 dark:text-neutral-100" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.modals.searchUsersPlaceholder}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading ? (
                <div className="p-8 text-center opacity-50 text-neutral-900 dark:text-neutral-100">{t.modals.searching}</div>
              ) : (
                <>
                  {/* Contacts Section */}
                  {filteredContacts.length > 0 && (
                    <div className="mb-2">
                      <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        {t.chat.contacts}
                      </div>
                      {filteredContacts.map(user => {
                        const isMember = existingMembers.includes(user.id);
                        return (
                          <div 
                            key={user.id}
                            className="flex items-center justify-between p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 relative">
                                {user.avatar_url ? (
                                  <Image 
                                    src={user.avatar_url} 
                                    alt={user.username} 
                                    fill 
                                    className="object-cover" 
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-bold opacity-30 text-neutral-900 dark:text-neutral-100">
                                    {user.first_name?.[0] || '?'}
                                  </div>
                                )}
                                {user.is_online && (
                                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-neutral-900 rounded-full"></div>
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-neutral-900 dark:text-neutral-100">{user.first_name} {user.last_name}</div>
                                <div className="text-xs opacity-50 text-neutral-900 dark:text-neutral-100">@{user.username}</div>
                              </div>
                            </div>

                            {isMember ? (
                              <div className="p-2 text-green-500">
                                <Check className="w-5 h-5" />
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddMember(user.id, user)}
                                disabled={addingUserId === user.id}
                                className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-indigo-600 dark:text-indigo-400 transition-all disabled:opacity-50"
                              >
                                <UserPlus className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Other Users (Search Results) */}
                  {searchResults.length > 0 && (
                    <div>
                      <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        {t.modals.otherUsers}
                      </div>
                      {searchResults.map(user => {
                        const isMember = existingMembers.includes(user.id);
                        return (
                          <div 
                            key={user.id}
                            className="flex items-center justify-between p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 relative">
                                {user.avatar_url ? (
                                  <Image 
                                    src={user.avatar_url} 
                                    alt={user.username} 
                                    fill 
                                    className="object-cover" 
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-bold opacity-30 text-neutral-900 dark:text-neutral-100">
                                    {user.first_name?.[0] || '?'}
                                  </div>
                                )}
                                {user.is_online && (
                                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-neutral-900 rounded-full"></div>
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-neutral-900 dark:text-neutral-100">{user.first_name} {user.last_name}</div>
                                <div className="text-xs opacity-50 text-neutral-900 dark:text-neutral-100">@{user.username}</div>
                              </div>
                            </div>

                            {isMember ? (
                              <div className="p-2 text-green-500">
                                <Check className="w-5 h-5" />
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddMember(user.id, user)}
                                disabled={addingUserId === user.id}
                                className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-indigo-600 dark:text-indigo-400 transition-all disabled:opacity-50"
                              >
                                <UserPlus className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {filteredContacts.length === 0 && searchResults.length === 0 && (
                    <div className="p-8 text-center opacity-50 text-neutral-900 dark:text-neutral-100">
                      {searchQuery.length >= 2 ? t.modals.noUsersFound : t.modals.minCharacters}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
