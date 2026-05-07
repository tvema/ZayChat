'use client';

import { X, Search, Users } from 'lucide-react';
import { User, Group } from '@/types/chat';
import { useState } from 'react';
import { useLanguage } from './LanguageProvider';
import Image from 'next/image';

interface AddToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: User | null;
  groups: Group[];
  onAdd: (userId: string, groupId: string, targetUser?: User) => void;
}

export function AddToGroupModal({
  isOpen,
  onClose,
  contact,
  groups,
  onAdd
}: AddToGroupModalProps) {
  const [search, setSearch] = useState('');
  const { t } = useLanguage();

  if (!isOpen || !contact) return null;

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
            {t.chat.addToGroup}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl mb-4 border border-neutral-100 dark:border-neutral-800">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold overflow-hidden">
              {contact.avatar_url ? (
                <Image src={contact.avatar_url} alt="" width={40} height={40} className="object-cover" referrerPolicy="no-referrer" unoptimized />
              ) : (
                contact.first_name[0]
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                {contact.first_name} {contact.last_name}
              </div>
              <div className="text-xs text-neutral-500">
                {contact.username}
              </div>
            </div>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={t.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800">
            {filteredGroups.length > 0 ? (
              filteredGroups.map(group => (
                <button
                  key={group.id}
                  onClick={() => onAdd(contact.id, group.id, contact)}
                  className="w-full flex items-center gap-3 p-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-xl transition-colors text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 overflow-hidden border border-neutral-200 dark:border-neutral-700">
                    {group.avatar_url ? (
                      <Image src={group.avatar_url} alt="" width={40} height={40} className="object-cover" referrerPolicy="no-referrer" unoptimized />
                    ) : (
                      <Users className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
                      {group.name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {group.member_count} {t.chat.members}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="py-8 text-center text-neutral-500 text-sm">
                {groups.length === 0 ? "У вас нет групп" : t.common.noResults}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
