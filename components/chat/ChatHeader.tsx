'use client';

import Image from 'next/image';
import { ChevronLeft, Video, Phone, MoreVertical, UserPlus, Search } from 'lucide-react';
import { ContactMenu } from './ContactMenu';
import { User, Group, Reminder, PinnedMessage } from '@/types/chat';
import { formatLastSeen } from '@/lib/chatUtils';
import { useLanguage } from '../LanguageProvider';
import { Bell, Pin } from 'lucide-react';

interface ChatHeaderProps {
  activeContact: User | null;
  activeGroup: Group | null;
  typingUsers?: { userId: string, username: string }[];
  onBack: () => void;
  onShowInfo: () => void;
  onAddMember: () => void;
  onStartCall: (audioOnly?: boolean) => void;
  onRemoveContact: () => void;
  onClearChat: () => void;
  onMove?: () => void;
  onAddGroup?: () => void;
  activeChatReminders?: Reminder[];
  activeChatPinnedMessages?: PinnedMessage[];
  onShowReminders?: () => void;
  onSetReminder?: () => void;
  onShareContacts?: () => void;
  onToggleSearch?: () => void;
  onLeaveGroup?: () => void;
}

export function ChatHeader({
  activeContact,
  activeGroup,
  typingUsers = [],
  onBack,
  onShowInfo,
  onAddMember,
  onStartCall,
  onRemoveContact,
  onClearChat,
  onMove,
  onAddGroup,
  activeChatReminders = [],
  activeChatPinnedMessages = [],
  onShowReminders,
  onSetReminder,
  onShareContacts,
  onToggleSearch,
  onLeaveGroup,
}: ChatHeaderProps) {
  const { t } = useLanguage();
  const hasTriggeredReminder = activeChatReminders.some(r => !r.is_dismissed && new Date() >= new Date(r.remind_at));
  return (
    <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between px-3 md:px-4 py-2 md:py-0 shrink-0 z-10 shadow-sm md:h-16 transition-all">
      <div className="flex items-center gap-2 md:gap-3 min-w-0 w-full md:w-auto">
        <button 
          onClick={onBack}
          className="md:hidden p-2 -ml-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors shrink-0"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div 
          className="flex items-center gap-2 md:gap-3 cursor-pointer min-w-0"
          onClick={onShowInfo}
        >
          <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold shrink-0 border shadow-sm overflow-hidden ${activeContact ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'}`}>
            {activeContact ? (
              activeContact.avatar_url ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <Image 
                    src={activeContact.avatar_url} 
                    alt="" 
                    fill 
                    className="object-cover" 
                    referrerPolicy="no-referrer"
                    unoptimized
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.style.display = 'none';
                      const parent = img.parentElement;
                      if (parent && activeContact) {
                        const existingFallback = parent.querySelector('.fallback-avatar');
                        if (!existingFallback) {
                          const span = document.createElement('span');
                          span.className = 'fallback-avatar';
                          span.innerText = activeContact.first_name?.[0] || '?';
                          parent.appendChild(span);
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                activeContact.first_name?.[0] || '?'
              )
            ) : (
              activeGroup?.avatar_url ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <Image 
                    src={activeGroup.avatar_url} 
                    alt="" 
                    fill 
                    className="object-cover" 
                    referrerPolicy="no-referrer"
                    unoptimized
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.style.display = 'none';
                      const parent = img.parentElement;
                      if (parent && activeGroup) {
                        const existingFallback = parent.querySelector('.fallback-avatar');
                        if (!existingFallback) {
                          const span = document.createElement('span');
                          span.className = 'fallback-avatar';
                          span.innerText = activeGroup.name?.[0] || '?';
                          parent.appendChild(span);
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                activeGroup?.name?.[0] || '?'
              )
            )}
          </div>
          <div className="flex flex-col min-w-0 overflow-hidden">
            <div className="flex flex-col md:flex-col min-w-0">
              <h2 className="font-semibold text-sm md:text-base text-neutral-800 dark:text-neutral-100 truncate leading-tight">
                {activeContact ? `${activeContact.first_name} ${activeContact.last_name}` : activeGroup?.name}
              </h2>
              <div className={`text-[10px] md:text-[11px] font-medium truncate ${typingUsers.length > 0 ? 'text-indigo-500 dark:text-indigo-400' : (activeContact?.is_online ? 'text-emerald-500 dark:text-emerald-400' : 'text-neutral-500 dark:text-neutral-400')}`}>
                {typingUsers.length > 0 ? (
                  <span className="flex items-center gap-1">
                    {typingUsers.length === 1 
                      ? `${typingUsers[0].username} ${t.chat.isTyping}` 
                      : `${typingUsers.length} ${t.chat.peopleAreTyping}`}
                    <span className="flex gap-[2px]">
                      <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </span>
                ) : activeContact ? (
                  activeContact.is_online ? t.chat.online : (
                    activeContact.last_seen ? `${t.chat.lastSeen} ${formatLastSeen(activeContact.last_seen, t)}` : t.common.notAvailable
                  )
                ) : `${activeGroup?.member_count} ${t.chat.members}`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-1 md:mt-0 md:justify-end overflow-x-auto no-scrollbar py-1 md:py-0">
        {onToggleSearch && (
          <button 
            onClick={onToggleSearch}
            className="p-2 md:p-2.5 rounded-full transition-all text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title={t('common.search') || 'Search'}
          >
            <Search className="w-4.5 h-4.5 md:w-5 md:h-5" />
          </button>
        )}
        {activeChatPinnedMessages.length > 0 && onShowReminders && (
          <button 
            onClick={onShowReminders}
            className="p-2 md:p-2.5 rounded-full transition-all relative text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            title={t('modals.pinned') || 'Pinned Messages'}
          >
            <Pin className="w-4.5 h-4.5 md:w-5 md:h-5" />
            <span className="absolute top-1.5 md:top-2 right-1.5 md:right-2 w-1.5 md:w-2 h-1.5 md:h-2 rounded-full bg-amber-500"></span>
          </button>
        )}
        {activeChatReminders.length > 0 && onShowReminders && (
          <button 
            onClick={onShowReminders}
            className={`p-2 md:p-2.5 rounded-full transition-all relative ${hasTriggeredReminder ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`}
            title={t('modals.reminders') || 'Reminders'}
          >
            <Bell className={`w-4.5 h-4.5 md:w-5 md:h-5 ${hasTriggeredReminder ? 'animate-pulse' : ''}`} />
            <span className={`absolute top-1.5 md:top-2 right-1.5 md:right-2 w-1.5 md:w-2 h-1.5 md:h-2 rounded-full ${hasTriggeredReminder ? 'bg-red-500' : 'bg-indigo-500'}`}></span>
          </button>
        )}
        {activeGroup && (
          <button 
            onClick={onAddMember}
            className="p-2 md:p-2.5 text-neutral-500 dark:text-neutral-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full transition-all"
            title={t.modals.addMember}
          >
            <UserPlus className="w-4.5 h-4.5 md:w-5 md:h-5" />
          </button>
        )}
        {activeContact && (
          <>
            <button 
              onClick={() => onStartCall(true)}
              className="p-2 md:p-2.5 text-neutral-500 dark:text-neutral-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full transition-all"
              title={t.modals.audioCall}
            >
              <Phone className="w-4.5 h-4.5 md:w-5 md:h-5" />
            </button>
            <button 
              onClick={() => onStartCall(false)}
              className="p-2 md:p-2.5 text-neutral-500 dark:text-neutral-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full transition-all"
              title={t.modals.videoCall}
            >
              <Video className="w-4.5 h-4.5 md:w-5 md:h-5" />
            </button>
          </>
        )}
        <div className="ml-auto md:ml-0">
          <ContactMenu 
            onInfo={onShowInfo}
            onMove={activeContact ? onMove : undefined}
            onAddGroup={activeContact ? onAddGroup : undefined}
            onClearChat={onClearChat}
            onDelete={activeContact ? onRemoveContact : undefined}
            onSetReminder={onSetReminder}
            onShareContacts={activeContact ? onShareContacts : undefined}
            onLeaveGroup={activeGroup ? onLeaveGroup : undefined}
            isGroup={!!activeGroup}
            trigger={
              <button 
                className="p-2 md:p-2.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
              >
                <MoreVertical className="w-4.5 h-4.5 md:w-5 md:h-5" />
              </button>
            }
          />
        </div>
      </div>
    </header>
  );
}
