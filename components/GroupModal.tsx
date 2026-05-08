'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { X, Camera, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '@/components/LanguageProvider';
import { useGlobalModal } from '@/components/GlobalModalProvider';
import { User } from '@/types/chat';
import { importKey, encryptAESKeyWithRSA } from '@/lib/crypto';

interface GroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  user: User | null;
  onGroupCreated: (group: any) => void;
}

export function GroupModal({ isOpen, onClose, token, user, onGroupCreated }: GroupModalProps) {
  const { t } = useLanguage();
  const { showAlert } = useGlobalModal();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatar(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      if (avatar) {
        formData.append('avatar', avatar);
      }

      // Generate group key and encrypt it for the creator
      if (user && user.public_key && window.crypto && window.crypto.subtle) {
        try {
          const groupKey = await window.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );
          const creatorPublicKey = await importKey(user.public_key as string, 'public');
          const encryptedKey = await encryptAESKeyWithRSA(groupKey, creatorPublicKey);
          
          const encryptedKeys = {
            "1": encryptedKey
          };
          formData.append('encrypted_keys', JSON.stringify(encryptedKeys));
        } catch (cryptoErr) {
          console.error("Crypto error during group creation:", cryptoErr);
          // Proceed without encryption if crypto fails but warn
        }
      }

      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        const group = await res.json();
        console.log('Group created successfully on server:', group);
        onGroupCreated(group);
        onClose();
        setName('');
        setDescription('');
        setAvatar(null);
        setAvatarPreview(null);
      } else {
        let errorMsg = t.common.error;
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || t.common.error;
        } catch(e) {
          errorMsg = `Server error ${res.status}`;
        }
        showAlert(`${t.common.error}: ${errorMsg}`);
      }
    } catch (err: any) {
      console.error('Failed to create group:', err);
      showAlert(`Ошибка создания: ${err.message || err.toString()}`);
    } finally {
      setIsLoading(false);
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
            className="w-full max-w-md overflow-hidden bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
              <h2 className="text-xl font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
                <Users className="w-5 h-5" />
                {t.modals.createGroup}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors text-neutral-500 dark:text-neutral-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="flex flex-col items-center gap-4">
                <div 
                  className="relative w-24 h-24 rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarPreview ? (
                    <Image 
                      src={avatarPreview} 
                      alt="Preview" 
                      fill 
                      className="object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Camera className="w-8 h-8 opacity-20 dark:opacity-40 group-hover:opacity-40 dark:group-hover:opacity-60 transition-opacity text-neutral-900 dark:text-neutral-100" />
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAvatarChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <p className="text-sm opacity-50 text-neutral-900 dark:text-neutral-100">{t.modals.groupPhoto}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-70 text-neutral-900 dark:text-neutral-100">{t.modals.groupName}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.modals.groupNamePlaceholder}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 opacity-70 text-neutral-900 dark:text-neutral-100">{t.modals.groupDescription}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.modals.groupDescriptionPlaceholder}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[100px] resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="w-full py-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-all disabled:opacity-50"
            >
                {isLoading ? t.modals.creating : t.modals.createGroup}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
