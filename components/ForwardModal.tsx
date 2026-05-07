'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Send, Users, User as UserIcon } from 'lucide-react';
import { User, Group, Message } from '@/types/chat';
import { useLanguage } from './LanguageProvider';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onForward: (recipientId: string, isGroup: boolean) => void;
  contacts: User[];
  groups: Group[];
  title?: string;
}

export default function ForwardModal({ isOpen, onClose, onForward, contacts, groups, title }: ForwardModalProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredContacts = contacts.filter(c => 
    c.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.last_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] border border-neutral-200 dark:border-neutral-800"
          >
          <div id="forward-modal-header" className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-white dark:bg-neutral-900 sticky top-0 z-10">
            <h2 id="forward-modal-title" className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{title || t.modals.forwardTitle}</h2>
            <button 
              id="forward-modal-close-btn"
              onClick={onClose}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors text-neutral-500 dark:text-neutral-400"
            >
              <X size={20} />
            </button>
          </div>

          <div id="forward-modal-search-container" className="p-4 border-b border-neutral-100 dark:border-neutral-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" size={18} />
              <input 
                id="forward-modal-search-input"
                type="text" 
                placeholder={t.modals.searchRecipients} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-transparent rounded-xl focus:bg-white dark:focus:bg-neutral-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 outline-none transition-all text-sm text-neutral-900 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {filteredGroups.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 py-2">{t.modals.groups}</h4>
                {filteredGroups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => onForward(group.id, true)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-2xl transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 overflow-hidden relative">
                      {group.avatar_url ? (
                        <Image 
                          src={group.avatar_url} 
                          alt={group.name} 
                          fill 
                          className="object-cover" 
                          referrerPolicy="no-referrer"
                          unoptimized
                        />
                      ) : (
                        <Users size={20} />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{group.name}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{group.member_count} {t.chat.members}</p>
                    </div>
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <Send size={16} />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 py-2">{t.modals.contacts}</h4>
              {filteredContacts.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 px-3 py-2 text-center">{t.modals.noContactsFound}</p>
              ) : (
                filteredContacts.map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => onForward(contact.id, false)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-2xl transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 shrink-0 overflow-hidden relative">
                      {contact.avatar_url ? (
                        <Image 
                          src={contact.avatar_url} 
                          alt={contact.username} 
                          fill 
                          className="object-cover" 
                          referrerPolicy="no-referrer"
                          unoptimized
                        />
                      ) : (
                        <UserIcon size={20} />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{contact.username}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{contact.first_name} {contact.last_name}</p>
                    </div>
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <Send size={16} />
                    </div>
                  </button>
                )))}
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
}
