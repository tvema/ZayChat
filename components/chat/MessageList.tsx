'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Check, CheckCheck, Forward, Reply, SmilePlus, ChevronDown, MoreHorizontal, Edit2, Trash2, X, Bell, Pin, Lock, Ban } from 'lucide-react';
import type { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import dynamic from 'next/dynamic';
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
const EmojiPicker = dynamic(() => import('emoji-picker-react').then(mod => mod.default), { ssr: false });
import { User, Message, Group } from '@/types/chat';
import { chatTheme } from '@/chat-theme.config';
import { isOnlyEmojis } from '@/lib/chatUtils';
import { renderMessageText } from '@/lib/chatComponents';
import { FileAttachment } from '@/components/FileAttachment';
import type { Socket } from 'socket.io-client';
import { useTheme } from 'next-themes';
import { useLanguage } from '../LanguageProvider';

interface MessageListProps {
  user: User;
  userContacts?: User[];
  messages: Message[];
  activeContact: User | null;
  activeGroup: Group | null;
  socket: Socket | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  setReactionMessageId: (id: string | null) => void;
  setForwardingMessage: (msg: Message | null) => void;
  setShowForwardModal: (show: boolean) => void;
  setReplyingTo: (msg: Message | null) => void;
  selectedMessageId: string | null;
  setSelectedMessageId: (id: string | null) => void;
  reactionMessageId: string | null;
  handleReaction: (emojiData: any, overrideId?: string) => void;
  handleEditMessage: (messageId: string, content: string) => void;
  handleDeleteMessage: (messageId: string) => void;
  onSetReminder?: (messageId: string) => void;
  onPinMessage?: (messageId: string, snippet?: string) => void;
  onUnpinMessage?: (messageId: string, snippet?: string) => void;
  pinnedMessageIds?: string[];
  editingMessage: Message | null;
  setEditingMessage: (msg: Message | null) => void;
  loadMoreMessages?: () => Promise<void>;
  hasMoreMessages?: boolean;
  isLoadingMore?: boolean;
  scrollPositionsRef: React.RefObject<Record<string, { scrollTop?: number; distanceFromBottom?: number; wasAtBottom: boolean }>>;
  onMessageClick?: (msg: Message) => void;
}

import { MessageItem } from '@/components/chat/MessageItem';

export function MessageList({
  user,
  userContacts = [],
  messages,
  activeContact,
  activeGroup,
  socket,
  messagesEndRef,
  setReactionMessageId,
  setForwardingMessage,
  setShowForwardModal,
  setReplyingTo,
  selectedMessageId,
  setSelectedMessageId,
  reactionMessageId,
  handleReaction,
  handleEditMessage,
  handleDeleteMessage,
  onSetReminder,
  onPinMessage,
  onUnpinMessage,
  pinnedMessageIds = [],
  editingMessage,
  setEditingMessage,
  loadMoreMessages,
  hasMoreMessages,
  isLoadingMore,
  scrollPositionsRef,
  onMessageClick
}: MessageListProps) {
  const { theme: currentTheme } = useTheme();
  const { t, language } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(isAtBottom);

  // Still keep this for any external state changes if needed, but we will also 
  // update the ref synchronously in critical paths to avoid race conditions.
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | undefined>(undefined);
  const [showFullEmojiPicker, setShowFullEmojiPicker] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  
  const chatId = activeContact?.id || activeGroup?.id || null;
  const lastSeenChatId = useRef(chatId);

  // Filter messages to only show those belonging to the active chat
  const filteredMessages = messages.filter(m => {
    if (activeGroup) return m.group_id === activeGroup.id;
    if (activeContact) return !m.group_id && (m.sender_id === activeContact.id || m.receiver_id === activeContact.id);
    return false;
  });

  const prevMessagesLength = useRef(filteredMessages.length);
  const prevMessagesRef = useRef(filteredMessages);
  const currentChatId = useRef<string | null>(null);
  const chatInitialized = useRef<Record<string, boolean>>({});
  const isRestoring = useRef(false);
  const lastScrollTop = useRef(0);
  const isFirstRenderOfChat = useRef(true);
  const unreadCountOnEnterRef = useRef(0);
  const firstUnreadMessageIdRef = useRef<string | null>(null);
  const hasUserScrolledRef = useRef(false);

  // Update isFirstRenderOfChat synchronously during render to disable animations immediately
  if (chatId !== currentChatId.current) {
    isFirstRenderOfChat.current = true;
    hasUserScrolledRef.current = false;
    const newUnreadCount = activeContact?.unread_count || activeGroup?.unread_count || 0;
    unreadCountOnEnterRef.current = newUnreadCount;
    // We do NOT set firstUnreadMessageIdRef here if messages are empty, we will do it when isFirstLoad triggers
    if (newUnreadCount > 0 && filteredMessages.length > 0) {
      const idx = Math.max(0, filteredMessages.length - newUnreadCount);
      firstUnreadMessageIdRef.current = filteredMessages[idx]?.id || null;
    } else {
      firstUnreadMessageIdRef.current = null;
    }
  }
  
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const targetTop = container.scrollHeight - container.clientHeight;
    
    if (behavior === 'auto') {
      container.scrollTop = targetTop;
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      if (chatId && scrollPositionsRef.current) {
        scrollPositionsRef.current[chatId] = { 
          scrollTop: targetTop,
          wasAtBottom: true 
        };
      }
    } else {
      container.scrollTo({
        top: targetTop,
        behavior: 'smooth'
      });
    }
    
    setHasNewMessages(false);
  }, [chatId]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isRestoring.current) return;
    
    // Prevent saving bogus scroll positions during chat switch or when empty
    if (chatId !== currentChatId.current || filteredMessages.length === 0) return;

    // Track that the user has manually scrolled, so we stop anchoring to the unread message
    if (!isFirstRenderOfChat.current) {
      hasUserScrolledRef.current = true;
    }

    if (activeDropdownId) {
      setActiveDropdownId(null);
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    
    // Load more messages if scrolled to top
    if (scrollTop < 100 && hasMoreMessages && !isLoadingMore && loadMoreMessages) {
      loadMoreMessages();
    }
    
    // Use a small threshold (50px) to determine if we're at the bottom
    const isScrollable = scrollHeight > clientHeight;
    const atBottom = !isScrollable || (scrollHeight - scrollTop - clientHeight < 50);
    
    // Save current scroll position and bottom state
    if (chatId && scrollPositionsRef.current) {
      scrollPositionsRef.current[chatId] = { scrollTop, wasAtBottom: atBottom };
    }

    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    
    if (atBottom) {
      setHasNewMessages(false);
    }
  }, [chatId, filteredMessages.length, setIsAtBottom, hasMoreMessages, isLoadingMore, loadMoreMessages]);

  useLayoutEffect(() => {
    if (chatId !== lastSeenChatId.current) {
      lastSeenChatId.current = chatId;
      const saved = (chatId && scrollPositionsRef.current) ? scrollPositionsRef.current[chatId] : null;
      const newIsAtBottom = saved ? saved.wasAtBottom : true;
      isAtBottomRef.current = newIsAtBottom;
      setIsAtBottom(newIsAtBottom);
      setHasNewMessages(false);
    }
  }, [chatId]);

  useLayoutEffect(() => {
    // 1. Handle Chat Switch & Initial Load
    const isNewChat = chatId !== currentChatId.current;
    const isFirstLoad = chatId && !chatInitialized.current[chatId] && filteredMessages.length > 0;

    let justComputedFirstUnread = false;
    if (unreadCountOnEnterRef.current > 0 && !firstUnreadMessageIdRef.current) {
      if (filteredMessages.length > 0 && (filteredMessages.length >= unreadCountOnEnterRef.current || !isLoadingMore)) {
        const idx = Math.max(0, filteredMessages.length - unreadCountOnEnterRef.current);
        firstUnreadMessageIdRef.current = filteredMessages[idx]?.id || null;
        justComputedFirstUnread = true;
      }
    }

    if (isNewChat || isFirstLoad || justComputedFirstUnread) {
      if (isNewChat) {
        currentChatId.current = chatId;
        isFirstRenderOfChat.current = true;
        if (chatId) chatInitialized.current[chatId] = false;
      }

      if (filteredMessages.length > 0) {
        const container = scrollContainerRef.current;
        if (!container) return;
        
        prevMessagesLength.current = filteredMessages.length;
        prevMessagesRef.current = filteredMessages;
        isRestoring.current = true;
        
        const saved = (chatId && scrollPositionsRef.current) ? scrollPositionsRef.current[chatId] : null;
        
        const restore = () => {
          if (firstUnreadMessageIdRef.current) {
            const el = document.getElementById(`message-${firstUnreadMessageIdRef.current}`);
            if (el && container) {
              // Scroll to the unread message with a small top padding
              container.scrollTop = Math.max(0, el.offsetTop - 60);
              if (chatId && scrollPositionsRef.current) {
                 scrollPositionsRef.current[chatId] = { scrollTop: container.scrollTop, wasAtBottom: false };
              }
              isAtBottomRef.current = false;
              setIsAtBottom(false);
              return;
            }
          } else if (unreadCountOnEnterRef.current > 0 && isLoadingMore) {
            // We haven't found the unread boundary yet and are still loading. Stay near top.
            container.scrollTop = 0;
            if (chatId && scrollPositionsRef.current) {
               scrollPositionsRef.current[chatId] = { scrollTop: 0, wasAtBottom: false };
            }
            isAtBottomRef.current = false;
            setIsAtBottom(false);
            return;
          }

          if (saved && !saved.wasAtBottom && saved.scrollTop !== undefined) {
             container.scrollTop = Math.max(0, saved.scrollTop);
             isAtBottomRef.current = false;
             setIsAtBottom(false);
          } else {
             container.scrollTop = container.scrollHeight;
             isAtBottomRef.current = true;
             setIsAtBottom(true);
          }
        };

        // Restore immediately and synchronously before paint
        restore();
        
        // Double-check restoration after a short delay to handle layout shifts
        const doubleCheck = setTimeout(() => {
          if (container && chatId === currentChatId.current) {
            restore();
          }
          isRestoring.current = false;
          // Keep isFirstRenderOfChat true for a bit longer to ensure no animations during initial load
          setTimeout(() => {
            if (chatId === currentChatId.current) {
              isFirstRenderOfChat.current = false;
            }
          }, 100);
          
          if (chatId && (!unreadCountOnEnterRef.current || firstUnreadMessageIdRef.current || !isLoadingMore)) {
             chatInitialized.current[chatId] = true;
          }
        }, 30);

        return () => {
          clearTimeout(doubleCheck);
          isRestoring.current = false;
        };
      }
      return;
    }

    // 2. Handle New Messages in CURRENT chat
    if (!isRestoring.current && chatId === currentChatId.current && filteredMessages.length > prevMessagesLength.current) {
      const container = scrollContainerRef.current;
      
      const lastMessage = filteredMessages[filteredMessages.length - 1];
      const prevLastMessage = prevMessagesRef.current[prevMessagesRef.current.length - 1];
      const isNewMessageAtBottom = !prevLastMessage || lastMessage.id !== prevLastMessage.id;

      if (!isNewMessageAtBottom) {
        // Messages were added at the top (pagination)
        if (container) {
          const scrollHeightDiff = container.scrollHeight - lastScrollTop.current;
          container.scrollTop += scrollHeightDiff;
          
          if (chatId && scrollPositionsRef.current && scrollPositionsRef.current[chatId]) {
             scrollPositionsRef.current[chatId].scrollTop = container.scrollTop;
          }
        }
      } else {
        // New message at the bottom
        const isMine = String(lastMessage.sender_id) === String(user.id);

        if (isMine || isAtBottom) {
          // Use a small delay to ensure DOM is updated
          setTimeout(() => scrollToBottom(isMine ? 'smooth' : 'auto'), 50);
        } else {
          setHasNewMessages(true);
        }
      }
    }
    
    if (scrollContainerRef.current) {
      lastScrollTop.current = scrollContainerRef.current.scrollHeight;
    }
    prevMessagesLength.current = filteredMessages.length;
    prevMessagesRef.current = filteredMessages;
  }, [chatId, filteredMessages, isAtBottom, scrollToBottom, user.id, isLoadingMore]);

  // Handle content height changes (like image loads)
  useEffect(() => {
    if (!contentRef.current) return;

    const observer = new ResizeObserver(() => {
      // Don't auto-scroll while restoring position, changing chats, or scrolling up manually
      if (isRestoring.current || chatId !== currentChatId.current) return;
      
      const container = scrollContainerRef.current;
      if (!container) return;

      // If user hasn't explicitly scrolled and there is an unread message boundary, keep it pinned
      if (!hasUserScrolledRef.current && firstUnreadMessageIdRef.current) {
        const el = document.getElementById(`message-${firstUnreadMessageIdRef.current}`);
        if (el) {
          isRestoring.current = true;
          // Notice we subtract 60 to keep the badge visible since we scroll to the actual message ID
          container.scrollTop = Math.max(0, el.offsetTop - 60);
          
          if (chatId && scrollPositionsRef.current && scrollPositionsRef.current[chatId]) {
            scrollPositionsRef.current[chatId].scrollTop = container.scrollTop;
          }
          
          setTimeout(() => {
            isRestoring.current = false;
          }, 50);
          return;
        }
      }

      if (isAtBottomRef.current) {
        scrollToBottom('auto');
      }
    });

    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [scrollToBottom, chatId]);

  const formatDateSeparator = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return t('chat.today') || 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return t('chat.yesterday') || 'Yesterday';
    } else {
      return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  return (
    <div className="flex-1 relative flex flex-col min-h-0" onClick={() => setSelectedMessageId(null)}>
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-6"
      >
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        <div ref={contentRef} className="flex flex-col">
        {filteredMessages.map((msg, index) => {
          const prevMsg = index > 0 ? filteredMessages[index - 1] : null;
          const nextMsg = index < filteredMessages.length - 1 ? filteredMessages[index + 1] : null;
          const repliedMsg = msg.reply_to ? filteredMessages.find(m => m.id === msg.reply_to) : null;
          
          const isFirstUnread = firstUnreadMessageIdRef.current === msg.id;

          return (
            <React.Fragment key={msg.id}>
              {isFirstUnread && (
                <div className="w-full flex items-center justify-center my-4 relative">
                  <div className="absolute w-full h-px bg-indigo-500/30"></div>
                  <span className="relative bg-white dark:bg-neutral-900 px-4 py-1 rounded-full text-xs font-medium text-indigo-500 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 shadow-sm">
                    {t('modals.newMessages') || 'Новые сообщения'}
                  </span>
                </div>
              )}
              <MessageItem
                msg={msg}
              index={index}
              prevMsg={prevMsg}
              nextMsg={nextMsg}
              repliedMsg={repliedMsg || null}
              user={user}
              userContacts={userContacts}
              activeContact={activeContact}
              activeGroup={activeGroup}
              socket={socket}
              chatTheme={chatTheme}
              t={t}
              isFirstRenderOfChat={isFirstRenderOfChat}
              formatDateSeparator={formatDateSeparator}
              selectedMessageId={selectedMessageId}
              setSelectedMessageId={setSelectedMessageId}
              activeDropdownId={activeDropdownId}
              setActiveDropdownId={setActiveDropdownId}
              reactionMessageId={reactionMessageId}
              setReactionMessageId={setReactionMessageId}
              dropdownStyle={dropdownStyle}
              setDropdownStyle={setDropdownStyle}
              handleReaction={handleReaction}
              setReplyingTo={setReplyingTo}
              setForwardingMessage={setForwardingMessage}
              setShowForwardModal={setShowForwardModal}
              setEditingMessage={setEditingMessage}
              handleDeleteMessage={handleDeleteMessage}
              onSetReminder={onSetReminder}
              pinnedMessageIds={pinnedMessageIds}
              onPinMessage={onPinMessage}
              onUnpinMessage={onUnpinMessage}
              onMessageClick={onMessageClick}
            />
            </React.Fragment>
          );
        })}
      <div ref={messagesEndRef} />
      </div>
      </div>

      {/* Scroll to Bottom Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          scrollToBottom('smooth');
        }}
        className={`absolute bottom-6 right-6 z-30 bg-indigo-500 text-white p-3 rounded-full shadow-xl hover:bg-indigo-600 transition-all duration-300 flex items-center justify-center group border-2 border-white dark:border-neutral-800 ${
          (!isAtBottom || hasNewMessages)
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 translate-y-8 scale-75 pointer-events-none'
        }`}
      >
        <div className="relative">
          <ChevronDown size={24} />
          {hasNewMessages && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
        </div>
      </button>

      {/* Quick Reactions & Emoji Picker Overlay */}
      <AnimatePresence>
        {reactionMessageId && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/5 dark:bg-black/20"
              onClick={() => {
                setReactionMessageId(null);
                setShowFullEmojiPicker(false);
              }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-2xl rounded-2xl overflow-hidden bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 max-w-[90vw]"
            >
              {!showFullEmojiPicker ? (
                <div className="p-4 w-[280px]">
                  <div className="text-sm text-neutral-500 font-medium mb-3 text-center">React to message</div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {['👍', '👋', '🤣', '🥰', '😘', '🤤', '❤️', '😍', '😎', '🤷🏻‍♂️', '🤦🏻‍♂️'].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          handleReaction({ emoji } as any);
                          setReactionMessageId(null);
                        }}
                        className="text-2xl hover:bg-neutral-100 dark:hover:bg-neutral-700 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowFullEmojiPicker(true)}
                      className="text-lg bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-600 dark:text-neutral-300 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                    >
                      <SmilePlus size={20} />
                    </button>
                  </div>
                </div>
              ) : (
                <EmojiPicker 
                  onEmojiClick={(emojiData) => {
                    handleReaction(emojiData);
                    setReactionMessageId(null);
                    setShowFullEmojiPicker(false);
                  }} 
                  width="100%" 
                  theme={(currentTheme === 'dark' ? 'dark' : 'light') as EmojiTheme}
                />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
