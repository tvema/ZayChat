'use client';

import React, { useState, useRef } from 'react';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { WelcomeScreen } from '@/components/chat/WelcomeScreen';
import { chatTheme } from '@/chat-theme.config';
import { User, Group, Message, Reminder, PinnedMessage } from '@/types/chat';
import type { Socket } from 'socket.io-client';
import type { EmojiClickData } from 'emoji-picker-react';
import { UploadCloud, Search, X, Activity } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { useTheme } from 'next-themes';
import ReminderModal from '@/components/chat/ReminderModal';
import RemindersListModal from '@/components/chat/RemindersListModal';
import { PinnedMessagesBar } from '@/components/chat/PinnedMessagesBar';
import { ShareContactsModal } from '@/components/ShareContactsModal';

interface MainChatAreaProps {
  user: User;
  contacts: User[];
  activeContact: User | null;
  activeGroup: Group | null;
  messages: Message[];
  typingUsers: Record<string, { userId: string, username: string }[]>;
  socket: Socket | null;
  replyingTo: Message | null;
  setReplyingTo: (msg: Message | null) => void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (show: boolean) => void;
  reactionMessageId: string | null;
  setReactionMessageId: (id: string | null) => void;
  selectedMessageId: string | null;
  setSelectedMessageId: (id: string | null) => void;
  setForwardingMessage: (msg: Message | null) => void;
  setShowForwardModal: (show: boolean) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  chatFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleSendMessage: (content: string, file?: File) => Promise<void> | void;
  handleEditMessage: (messageId: string, content: string) => void;
  handleDeleteMessage: (messageId: string) => void;
  editingMessage: Message | null;
  setEditingMessage: (msg: Message | null) => void;
  handleReaction: (emojiData: any, overrideId?: string) => void;
  handleBackClick: () => void;
  setShowUserInfoModal: (show: boolean) => void;
  setShowGroupInfoModal: (show: boolean) => void;
  setShowAddMemberModal: (show: boolean) => void;
  startCall: (contactId: string, audioOnly?: boolean) => void;
  handleRemoveContact: (contactId: string) => void;
  handleLeaveGroup: (groupId: string) => void;
  handleClearChat: (contactId: string, isGroup?: boolean) => void;
  setShowMoveToCircleModal: (show: boolean) => void;
  setMovingContact: (contact: User | null) => void;
  setShowAddToGroupModal: (show: boolean) => void;
  setTargetContact: (contact: User | null) => void;
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  scrollPositionsRef: React.RefObject<Record<string, { scrollTop?: number; distanceFromBottom?: number; wasAtBottom: boolean }>>;
  reminders: Reminder[];
  pinnedMessages: PinnedMessage[];
  handleSetReminder: (messageId: string | null, remindAt: string, comment?: string, recurrence?: string, targetUserIds?: string[]) => void;
  handleEditReminder: (reminderId: string, remindAt: string, comment?: string, recurrence?: string) => void;
  handleDeleteReminder: (reminderId: string) => void;
  handlePinMessage: (messageId: string, snippet?: string) => void;
  handleUnpinMessage: (messageId: string, snippet?: string) => void;
  handleAddContact: (contactId: string) => void;
  handleBlockContact: (contactId: string) => void;
  inChatSearchQuery: string;
  isInChatSearching: boolean;
  handleInChatSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setInChatSearchQuery: (q: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  highlightedMessageId: string | null;
  setHighlightedMessageId: (id: string | null) => void;
  token: string | null;
}

export function MainChatArea({
  user,
  contacts,
  activeContact,
  activeGroup,
  messages,
  typingUsers,
  socket,
  replyingTo,
  setReplyingTo,
  showEmojiPicker,
  setShowEmojiPicker,
  reactionMessageId,
  setReactionMessageId,
  selectedMessageId,
  setSelectedMessageId,
  setForwardingMessage,
  setShowForwardModal,
  messagesEndRef,
  chatFileInputRef,
  handleSendMessage,
  handleEditMessage,
  handleDeleteMessage,
  editingMessage,
  setEditingMessage,
  handleReaction,
  handleBackClick,
  setShowUserInfoModal,
  setShowGroupInfoModal,
  setShowAddMemberModal,
  startCall,
  handleRemoveContact,
  handleLeaveGroup,
  handleClearChat,
  setShowMoveToCircleModal,
  setMovingContact,
  setShowAddToGroupModal,
  setTargetContact,
  loadMoreMessages,
  hasMoreMessages,
  isLoadingMore,
  scrollPositionsRef,
  reminders,
  pinnedMessages,
  handleSetReminder,
  handleEditReminder,
  handleDeleteReminder,
  handlePinMessage,
  handleUnpinMessage,
  handleAddContact,
  handleBlockContact,
  inChatSearchQuery,
  isInChatSearching,
  handleInChatSearch,
  setInChatSearchQuery,
  isSearchOpen,
  setIsSearchOpen,
  highlightedMessageId,
  setHighlightedMessageId,
  token
}: MainChatAreaProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [showReminderModal, setShowReminderModal] = useState<string | null>(null);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [showRemindersList, setShowRemindersList] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const dragCounter = React.useRef(0);
  const { t } = useLanguage();

  // Handle message highlighting/navigation
  React.useEffect(() => {
    if (highlightedMessageId) {
      setTimeout(() => {
        const el = document.getElementById(`message-${highlightedMessageId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-indigo-50/50', 'dark:bg-indigo-900/40', 'ring-2', 'ring-indigo-500/50');
          setTimeout(() => {
            el.classList.remove('bg-indigo-50/50', 'dark:bg-indigo-900/40', 'ring-2', 'ring-indigo-500/50');
            setHighlightedMessageId(null);
          }, 3000);
        }
      }, 500);
    }
  }, [highlightedMessageId, setHighlightedMessageId]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0 && (activeContact || activeGroup)) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    if ((activeContact || activeGroup) && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setDroppedFile(file);
    }
  };

  const activeChatReminders = reminders.filter(r => 
    r.chat_id === (activeGroup ? activeGroup.id : activeContact?.id)
  );

  const [isRequestingUnblock, setIsRequestingUnblock] = useState(false);
  const handleRequestUnblock = async (contactId: string) => {
    if (!token) return;
    setIsRequestingUnblock(true);
    try {
      await fetch(`/api/contacts/${contactId}/request_unblock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      alert('Запрос на разблокировку отправлен');
    } catch (e) {
      console.error(e);
      alert('Ошибка отправки');
    } finally {
      setIsRequestingUnblock(false);
    }
  };

  return (
    <main 
      className={`flex-1 min-w-0 min-h-0 flex flex-col bg-indigo-50/50 dark:bg-indigo-950/20 relative ${(!activeContact && !activeGroup) ? 'hidden md:flex' : 'flex'}`}
      style={{ backgroundImage: `url("${mounted && resolvedTheme === 'dark' ? '/bunny_wallpaper_dark.jpg' : '/bunny_wallpaper_light.jpg'}")`, backgroundSize: '400px', backgroundRepeat: 'repeat' }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-[100] bg-indigo-500/10 backdrop-blur-sm border-4 border-dashed border-indigo-500/50 rounded-lg flex flex-col items-center justify-center pointer-events-none transition-all duration-200">
          <div className="bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center">
              <UploadCloud size={32} />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {t('modals.dropFileToUpload') || 'Drop file to send'}
              </h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                {t('modals.releaseToSend') || 'Release to send to chat'}
              </p>
            </div>
          </div>
        </div>
      )}
      {activeContact || activeGroup ? (
        <>
          <ChatHeader
            activeContact={activeContact}
            activeGroup={activeGroup}
            typingUsers={typingUsers[activeGroup?.id || activeContact?.id || ''] || []}
            onBack={handleBackClick}
            onShowInfo={() => {
              if (activeContact) setShowUserInfoModal(true);
              else if (activeGroup) setShowGroupInfoModal(true);
            }}
            onAddMember={() => setShowAddMemberModal(true)}
            onStartCall={(audioOnly) => activeContact && startCall(activeContact.id, audioOnly)}
            onRemoveContact={() => activeContact && handleRemoveContact(activeContact.id)}
            onLeaveGroup={() => activeGroup && handleLeaveGroup(activeGroup.id)}
            onClearChat={() => activeContact ? handleClearChat(activeContact.id) : activeGroup && handleClearChat(activeGroup.id, true)}
            onMove={() => {
              if (activeContact) {
                setMovingContact(activeContact);
                setShowMoveToCircleModal(true);
              }
            }}
            onAddGroup={() => {
              if (activeContact) {
                setTargetContact(activeContact);
                setShowAddToGroupModal(true);
              }
            }}
            onShareContacts={() => setShowShareModal(true)}
            activeChatReminders={activeChatReminders}
            activeChatPinnedMessages={pinnedMessages}
            onShowReminders={() => setShowRemindersList(true)}
            onSetReminder={() => setShowReminderModal('chat')}
            onToggleSearch={() => {
              setIsSearchOpen(!isSearchOpen);
            }}
          />

          {isSearchOpen && (
            <div className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800 p-2 flex items-center gap-2 relative shadow-sm z-10 transition-all">
              <div className="relative flex-1">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isInChatSearching ? 'text-indigo-500 animate-pulse' : 'text-neutral-400'}`} />
                <input
                  type="text"
                  placeholder={t('common.search') || 'Search in chat...'}
                  value={inChatSearchQuery}
                  onChange={handleInChatSearch}
                  className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-full py-1.5 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                  autoFocus
                />
                {isInChatSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Activity className="w-3 h-3 text-indigo-500 animate-spin" />
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setIsSearchOpen(false);
                }}
                className="p-1.5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <PinnedMessagesBar 
            pinnedMessages={pinnedMessages}
            onUnpinMessage={handleUnpinMessage}
            onMessageClick={(msgId) => {
              // Optional: scroll to message
              const el = document.getElementById(`message-${msgId}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('bg-indigo-50', 'dark:bg-indigo-900/20');
                setTimeout(() => el.classList.remove('bg-indigo-50', 'dark:bg-indigo-900/20'), 2000);
              }
            }}
          />

          {activeContact && (activeContact.is_contact === false || (activeContact as any).is_contact === 0) && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/30 px-4 py-3 flex items-center justify-between z-10 shadow-sm">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t('chat.notInContacts') || 'This user is not in your contacts.'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBlockContact(activeContact.id)}
                  className="px-3 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-900 dark:text-red-100 text-sm font-medium rounded-lg transition-colors"
                >
                  {t('common.block') || 'Block'}
                </button>
                <button
                  onClick={() => handleAddContact(activeContact.id)}
                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-800/40 dark:hover:bg-amber-800/60 text-amber-900 dark:text-amber-100 text-sm font-medium rounded-lg transition-colors"
                >
                  {t('chat.addToContacts') || 'Add to Contacts'}
                </button>
              </div>
            </div>
          )}

          <MessageList
            messages={isSearchOpen && inChatSearchQuery.trim() ? messages.filter(msg => {
              if (!msg.content) return false;
              let textToSearch = msg.content;
              if (textToSearch.startsWith('{') && textToSearch.endsWith('}')) {
                try {
                  const parsed = JSON.parse(textToSearch);
                  textToSearch = parsed.text || '';
                } catch (e) {}
              }
              return textToSearch.toLowerCase().includes(inChatSearchQuery.toLowerCase());
            }) : messages}
            user={user}
            userContacts={contacts}
            activeContact={activeContact}
            activeGroup={activeGroup}
            socket={socket}
            reactionMessageId={reactionMessageId}
            selectedMessageId={selectedMessageId}
            setSelectedMessageId={setSelectedMessageId}
            setReactionMessageId={setReactionMessageId}
            setReplyingTo={setReplyingTo}
            setForwardingMessage={setForwardingMessage}
            setShowForwardModal={setShowForwardModal}
            messagesEndRef={messagesEndRef}
            handleReaction={handleReaction}
            handleEditMessage={handleEditMessage}
            handleDeleteMessage={handleDeleteMessage}
            onSetReminder={(msgId) => setShowReminderModal(msgId)}
            onPinMessage={handlePinMessage}
            onUnpinMessage={handleUnpinMessage}
            pinnedMessageIds={pinnedMessages.map(p => p.message_id)}
            editingMessage={editingMessage}
            setEditingMessage={setEditingMessage}
            loadMoreMessages={loadMoreMessages}
            hasMoreMessages={hasMoreMessages}
            isLoadingMore={isLoadingMore}
            scrollPositionsRef={scrollPositionsRef}
            onMessageClick={(msg) => {
              if (isSearchOpen && inChatSearchQuery.trim()) {
                setIsSearchOpen(false);
                setHighlightedMessageId(msg.id);
              }
            }}
          />

          {activeContact && activeContact.is_blacklisted_by ? (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-center border-t border-red-100 dark:border-red-900 text-sm">
              <p>Вы не можете отправлять сообщения, так как этот пользователь добавил вас в чёрный список.</p>
              <button 
                onClick={() => handleRequestUnblock(activeContact.id)}
                disabled={isRequestingUnblock}
                className="mt-2 text-indigo-600 dark:text-indigo-400 font-medium hover:underline disabled:opacity-50"
              >
                {isRequestingUnblock ? 'Отправка...' : 'Отправить запрос на разблокировку'}
              </button>
            </div>
          ) : (
            <MessageInput
              showEmojiPicker={showEmojiPicker}
              setShowEmojiPicker={setShowEmojiPicker}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              editingMessage={editingMessage}
              setEditingMessage={setEditingMessage}
              handleEditMessage={handleEditMessage}
              user={user}
              activeContact={activeContact}
              activeGroup={activeGroup}
              socket={socket}
              token={token}
              handleSendMessage={handleSendMessage}
              chatFileInputRef={chatFileInputRef}
              droppedFile={droppedFile}
              onClearDroppedFile={() => setDroppedFile(null)}
            />
          )}
        </>
      ) : (
        <WelcomeScreen />
      )}

      {(showReminderModal || editingReminder) && (
        <ReminderModal 
          activeGroup={activeGroup}
          initialReminder={editingReminder || undefined}
          onClose={() => {
            setShowReminderModal(null);
            setEditingReminder(null);
          }}
          onSave={(remindAt, comment, recurrence, targetUserIds) => {
            if (editingReminder) {
              handleEditReminder(editingReminder.id, remindAt, comment, recurrence);
            } else {
              handleSetReminder(showReminderModal === 'chat' ? null : showReminderModal, remindAt, comment, recurrence, targetUserIds);
            }
            setShowReminderModal(null);
            setEditingReminder(null);
          }}
        />
      )}

      {showShareModal && (
        <ShareContactsModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          contacts={contacts}
          targetName={activeGroup ? activeGroup.name : activeContact ? `${activeContact.first_name} ${activeContact.last_name || ''}`.trim() || activeContact.username : undefined}
          excludedContactId={activeContact ? activeContact.id : undefined}
          onShare={(selectedContacts) => {
            const payload = {
              type: 'contacts_share',
              contacts: selectedContacts.map(c => ({
                id: c.id,
                username: c.username,
                first_name: c.first_name,
                last_name: c.last_name,
                avatar_url: c.avatar_url
              }))
            };
            handleSendMessage(JSON.stringify(payload));
          }}
        />
      )}

      {showRemindersList && (
        <RemindersListModal
          reminders={activeChatReminders}
          pinnedMessages={pinnedMessages}
          onClose={() => setShowRemindersList(false)}
          onDeleteReminder={handleDeleteReminder}
          onEditReminder={(reminder) => {
            setEditingReminder(reminder);
            setShowRemindersList(false);
          }}
          onUnpinMessage={handleUnpinMessage}
        />
      )}
    </main>
  );
}
