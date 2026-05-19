'use client';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { X, Mail, Phone, User as UserIcon, Edit, Clock } from 'lucide-react';
import { User, Message } from '@/types/chat';
import { useLanguage } from '@/components/LanguageProvider';
import { formatLastSeen } from '@/lib/chatUtils';
import { SharedMediaRenderer } from '@/components/SharedMediaRenderer';
import { useState } from 'react';

import type { Socket } from 'socket.io-client';

interface UserInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  currentUser: User | null;
  messages?: Message[];
  socket?: Socket | null;
  token?: string;
}

export const UserInfoModal = ({ isOpen, onClose, user, currentUser, messages = [], socket = null, token = '' }: UserInfoModalProps) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'info' | 'media' | 'docs' | 'audio' | 'links'>('info');

  return (
    <AnimatePresence>
      {isOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative h-[90vh] flex flex-col"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-black/10 hover:bg-black/20 rounded-full text-white transition-colors z-20"
            >
              <X size={20} />
            </button>
            
            <div className="relative h-32 bg-indigo-500 shrink-0">
            </div>
            
            <div className="px-6 relative flex flex-col items-center text-center shrink-0">
              <div className="w-24 h-24 rounded-full bg-white dark:bg-neutral-900 p-1 -mt-12 mb-4 relative z-10 shrink-0">
                <div className="w-full h-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative">
                  {user.avatar_url ? (
                    <div className="relative w-full h-full">
                      <Image 
                        src={user.avatar_url} 
                        alt="Avatar" 
                        fill 
                        className="object-cover" 
                        referrerPolicy="no-referrer"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600 dark:text-neutral-400 font-bold text-2xl">
                      {user.first_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                {user.is_online && (
                  <div className="absolute bottom-2 right-2 w-5 h-5 bg-emerald-500 border-4 border-white dark:border-neutral-900 rounded-full z-20"></div>
                )}
              </div>
              
              <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{user.first_name} {user.last_name}</h3>
              <p className="text-indigo-600 dark:text-indigo-400 font-medium mb-4 flex flex-col items-center gap-1">
                <span>@{user.username}</span>
                {user.is_online ? (
                  <span className="text-emerald-600 dark:text-emerald-400 text-sm font-semibold bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                    {t.chat.online}
                  </span>
                ) : (
                  user.last_seen && (
                    <span className="text-neutral-500 dark:text-neutral-400 text-xs font-medium flex items-center gap-1">
                      <Clock size={12} />
                      {t.chat.lastSeen} {formatLastSeen(user.last_seen, t)}
                    </span>
                  )
                )}
              </p>
            </div>

            {/* TABS */}
            <div className="flex px-4 gap-1 border-b border-neutral-100 dark:border-neutral-800 shrink-0 overflow-x-auto no-scrollbar justify-center">
              {[
                { id: 'info', label: 'Инфо' },
                { id: 'media', label: 'Медиа' },
                { id: 'docs', label: 'Файлы' },
                { id: 'audio', label: 'Аудио' },
                { id: 'links', label: 'Ссылки' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === tab.id 
                      ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400' 
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab === 'info' ? (
                <div className="w-full space-y-3 px-6 py-4 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800">
                  {user.email && (
                    <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl text-left">
                      <div className="w-10 h-10 rounded-full bg-white dark:bg-neutral-800 flex items-center justify-center text-neutral-500 dark:text-neutral-400 shadow-sm shrink-0">
                        <Mail size={18} />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">{t.auth.email}</p>
                        <p className="text-sm text-neutral-900 dark:text-neutral-100 truncate">{user.email}</p>
                      </div>
                    </div>
                  )}
                  
                  {user.phone && (
                    <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl text-left">
                      <div className="w-10 h-10 rounded-full bg-white dark:bg-neutral-800 flex items-center justify-center text-neutral-500 dark:text-neutral-400 shadow-sm shrink-0">
                        <Phone size={18} />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">{t.auth.phone}</p>
                        <p className="text-sm text-neutral-900 dark:text-neutral-100 truncate">{user.phone}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <SharedMediaRenderer messages={messages} activeTab={activeTab} socket={socket} activeContact={user} token={token} />
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
