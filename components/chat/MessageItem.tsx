'use client';

import React, { useState, Fragment, useRef, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Check, CheckCheck, Forward, Reply, SmilePlus, MoreHorizontal, Edit2, Trash2, Bell, Pin, Lock, Ban, Download, Type } from 'lucide-react';
import { createPortal } from 'react-dom';
import { User, Message, Group } from '@/types/chat';
import { isOnlyEmojis } from '@/lib/chatUtils';
import { renderMessageText } from '@/lib/chatComponents';
import { FileAttachment } from '@/components/FileAttachment';
import { ContactsShareViewer } from '@/components/chat/ContactsShareViewer';
import type { Socket } from 'socket.io-client';

export interface MessageItemProps {
  msg: Message;
  index: number;
  prevMsg: Message | null;
  nextMsg: Message | null;
  repliedMsg: Message | null;
  user: User;
  userContacts?: User[];
  activeContact: User | null;
  activeGroup: Group | null;
  socket: Socket | null;
  chatTheme: any;
  t: (key: string) => string;
  isFirstRenderOfChat: React.MutableRefObject<boolean>;
  formatDateSeparator: (time: number) => string;
  
  selectedMessageId: string | null;
  setSelectedMessageId: (id: string | null) => void;
  activeDropdownId: string | null;
  setActiveDropdownId: (id: string | null) => void;
  reactionMessageId: string | null;
  setReactionMessageId: (id: string | null) => void;
  
  dropdownStyle: React.CSSProperties | undefined;
  setDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | undefined>>;
  
  handleReaction: (emojiData: any, overrideId?: string) => void;
  setReplyingTo: (msg: Message) => void;
  setForwardingMessage: (msg: Message) => void;
  setShowForwardModal: (show: boolean) => void;
  setEditingMessage: (msg: Message) => void;
  handleDeleteMessage: (msgId: string) => void;
  
  onSetReminder?: (msgId: string) => void;
  pinnedMessageIds?: string[];
  onPinMessage?: (msgId: string, snippet?: string) => void;
  onUnpinMessage?: (msgId: string, snippet?: string) => void;
  onMessageClick?: (msg: Message) => void;
}

export function MessageItem({
  msg, index, prevMsg, nextMsg, repliedMsg,
  user, userContacts = [], activeContact, activeGroup, socket, chatTheme,
  t, isFirstRenderOfChat, formatDateSeparator,
  selectedMessageId, setSelectedMessageId,
  activeDropdownId, setActiveDropdownId,
  reactionMessageId, setReactionMessageId,
  dropdownStyle, setDropdownStyle,
  handleReaction, setReplyingTo,
  setForwardingMessage, setShowForwardModal,
  setEditingMessage, handleDeleteMessage,
  onSetReminder, pinnedMessageIds = [], onPinMessage, onUnpinMessage, onMessageClick
}: MessageItemProps) {
  const isSystem = msg.sender_id === 'system';
  const isPrevSystem = prevMsg?.sender_id === 'system';
  const isNextSystem = nextMsg?.sender_id === 'system';

  const msgTime = new Date(msg.created_at.includes('T') ? msg.created_at : msg.created_at.replace(' ', 'T') + 'Z').getTime();
  const prevMsgTime = prevMsg ? new Date(prevMsg.created_at.includes('T') ? prevMsg.created_at : prevMsg.created_at.replace(' ', 'T') + 'Z').getTime() : 0;
  const nextMsgTime = nextMsg ? new Date(nextMsg.created_at.includes('T') ? nextMsg.created_at : nextMsg.created_at.replace(' ', 'T') + 'Z').getTime() : 0;

  const msgDateString = new Date(msgTime).toDateString();
  const prevMsgDateString = prevMsg ? new Date(prevMsgTime).toDateString() : null;
  const showDateSeparator = msgDateString !== prevMsgDateString;

  const isSameSenderAsPrev = prevMsg && !isPrevSystem && prevMsg.sender_id === msg.sender_id && !showDateSeparator;
  const isSameSenderAsNext = nextMsg && !isNextSystem && nextMsg.sender_id === msg.sender_id;
  
  const isGroupStart = !isSameSenderAsPrev || (msgTime - prevMsgTime > 300000);
  const isGroupEnd = !isSameSenderAsNext || (nextMsgTime - msgTime > 300000);

  const marginTopClass = index === 0 ? '' : (isGroupStart || isSystem || isPrevSystem ? 'mt-4 md:mt-6' : 'mt-[1px]');

  if (isSystem) {
    return (
      <Fragment>
        {showDateSeparator && (
          <div className="flex justify-center my-6">
            <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 text-xs font-medium rounded-full border border-neutral-200/60 dark:border-neutral-700/50">
              {formatDateSeparator(msgTime)}
            </span>
          </div>
        )}
        <motion.div 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex justify-center mb-4 ${marginTopClass}`}
        >
          <div 
            onClick={() => {
              if (msg.reply_to) {
                const element = document.getElementById(`message-${msg.reply_to}`);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  element.classList.add('bg-indigo-50/50', 'dark:bg-indigo-900/40', 'ring-2', 'ring-indigo-500/50', 'rounded-xl', 'transition-all', 'duration-500');
                  setTimeout(() => element.classList.remove('bg-indigo-50/50', 'dark:bg-indigo-900/40', 'ring-2', 'ring-indigo-500/50', 'rounded-xl', 'transition-all', 'duration-500'), 2000);
                }
              }
            }}
            className={`bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-xs px-4 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 shadow-sm font-medium ${msg.reply_to ? 'cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors' : ''}`}
          >
            {msg.content}
          </div>
        </motion.div>
      </Fragment>
    );
  }

  const isMine = String(msg.sender_id) === String(user.id);
  const theme = isMine ? chatTheme.currentUser : chatTheme.opponent;
  const largeEmoji = isOnlyEmojis(msg.content);

  const [dragX, setDragX] = useState(0);
  const swipeThreshold = 60;
  
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchIsSwiping = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (typeof window !== 'undefined' && window.getSelection()?.toString().length) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchIsSwiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isSystem) return;
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    if (!touchIsSwiping.current) {
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
        touchIsSwiping.current = true;
      }
    }

    if (touchIsSwiping.current) {
      if (isMine && diffX < 0) {
        setDragX(Math.max(diffX, -swipeThreshold * 1.5));
      } else if (!isMine && diffX > 0) {
        setDragX(Math.min(diffX, swipeThreshold * 1.5));
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchIsSwiping.current && Math.abs(dragX) >= swipeThreshold) {
      setReplyingTo(msg);
    }
    setDragX(0);
    touchStartX.current = null;
    touchStartY.current = null;
    touchIsSwiping.current = false;
  };

  let dynamicBorderRadius = 'rounded-2xl';
  if (isMine) {
    if (isGroupStart && isGroupEnd) dynamicBorderRadius += ' rounded-tr-sm';
    else if (isGroupStart) dynamicBorderRadius += ' rounded-tr-sm rounded-br-md';
    else if (isGroupEnd) dynamicBorderRadius += ' rounded-tr-md rounded-br-2xl';
    else dynamicBorderRadius += ' rounded-tr-md rounded-br-md';
  } else {
    if (isGroupStart && isGroupEnd) dynamicBorderRadius += ' rounded-tl-sm';
    else if (isGroupStart) dynamicBorderRadius += ' rounded-tl-sm rounded-bl-md';
    else if (isGroupEnd) dynamicBorderRadius += ' rounded-tl-md rounded-bl-2xl';
    else dynamicBorderRadius += ' rounded-tl-md rounded-bl-md';
  }

  const reactionCounts = msg.reactions.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const trimmedContent = msg.content.trim();
  const isJson = trimmedContent.startsWith('{') && trimmedContent.endsWith('}');
  let parsedContent = null;
  if (isJson) {
    try {
      parsedContent = JSON.parse(trimmedContent);
      if (parsedContent && !parsedContent.type && (parsedContent.url || parsedContent.fileId)) {
        parsedContent.type = 'file';
      }
    } catch (e) {}
  }

  let spacerWidth = 55;
  if (msg.is_edited) spacerWidth += 35;
  if (msg.encryption_data) spacerWidth += 15;
  if (isMine) spacerWidth += 20;

  const openDropdown = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && typeof e.stopPropagation === 'function') {
      try { e.stopPropagation(); } catch (err) {}
    }

    let target: HTMLElement | null = null;
    
    if (e && 'currentTarget' in e && e.currentTarget) {
      const ct = e.currentTarget as HTMLElement;
      if (ct.id && ct.id.includes('msg-more-btn')) {
        target = ct;
      }
    }

    if (!target) {
      target = document.getElementById(`msg-more-btn-${msg.id}`);
    }

    if (!target || target.offsetWidth === 0) {
      target = document.getElementById(`message-${msg.id}`);
    }

    if (!target) return;

    const rect = target.getBoundingClientRect();
    const expectedItems = isMine ? 6 : 4;
    const menuHeight = expectedItems * 40 + 16 + 50; // extra 50px for reaction bar
    
    let top: number | 'auto' = rect.bottom + 4;
    let bottom: number | 'auto' = 'auto';
    
    if (rect.bottom + menuHeight > window.innerHeight) {
      top = 'auto';
      bottom = window.innerHeight - rect.top + 4;
    }
    
    const menuWidth = 260;
    let leftValue = isMine ? rect.right - menuWidth : rect.left;
    
    if (leftValue + menuWidth > window.innerWidth) {
      leftValue = window.innerWidth - menuWidth - 8;
    }
    if (leftValue < 8) {
      leftValue = 8;
    }
    
    setDropdownStyle({
      position: 'fixed',
      top: top !== 'auto' ? top : undefined,
      bottom: bottom !== 'auto' ? bottom : undefined,
      left: leftValue,
      zIndex: 100
    });
    
    setActiveDropdownId(activeDropdownId === msg.id ? null : msg.id);
  };

  useEffect(() => {
    const handleActionRequest = (e: any) => {
      if (e.detail?.messageId === msg.id) {
        if (e.detail.action === 'reply') {
          setReplyingTo(msg);
        } else if (e.detail.action === 'forward') {
          setForwardingMessage(msg);
          setShowForwardModal(true);
        }
      }
    };
    window.addEventListener('message-action-request', handleActionRequest);
    return () => window.removeEventListener('message-action-request', handleActionRequest);
  }, [msg, setReplyingTo, setForwardingMessage, setShowForwardModal]);

  if (trimmedContent === '[[SYSTEM_REQUEST_UNBLOCK]]') {
    return (
      <Fragment>
        {showDateSeparator && (
          <div className="flex justify-center my-6">
            <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 text-xs font-medium rounded-full border border-neutral-200/60 dark:border-neutral-700/50">
              {formatDateSeparator(msgTime)}
            </span>
          </div>
        )}
        <div className="flex justify-center my-4 opacity-75">
          <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800/50 px-4 py-2 rounded-xl text-neutral-600 dark:text-neutral-300 text-xs text-center border border-neutral-200 dark:border-neutral-700/50">
            <Lock size={14} className="text-neutral-400" />
            <span>
              {isMine 
                ? 'Вы отправили запрос на разблокировку' 
                : `${msg.sender_username || 'Пользователь'} просит убрать его из чёрного списка`
              }
            </span>
          </div>
        </div>
      </Fragment>
    );
  }

  return (
    <Fragment>
      {showDateSeparator && (
        <div className="flex justify-center my-6">
          <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 text-xs font-medium rounded-full border border-neutral-200/60 dark:border-neutral-700/50">
            {formatDateSeparator(msgTime)}
          </span>
        </div>
      )}
      <motion.div 
        id={`message-${msg.id}`}
        initial={isFirstRenderOfChat.current ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} group ${marginTopClass} transition-colors duration-500`}
      >
        <div className={`flex items-end gap-2 max-w-[calc(100%-1rem)] sm:max-w-[85%] md:max-w-[75%] min-w-0 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          {!isMine && activeGroup && (
            <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 select-none ${isGroupEnd ? 'opacity-100' : 'opacity-0'}`}>
              {(msg.sender_avatar_url) ? (
                <div className="relative w-full h-full">
                  <Image src={msg.sender_avatar_url} alt={msg.sender_username || ''} fill className="object-cover" referrerPolicy="no-referrer" unoptimized />
                </div>
              ) : (
                <div className="w-full h-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 dark:text-indigo-400 font-medium text-xs">
                  {msg.sender_username?.charAt(0)?.toUpperCase()}
                </div>
              )}
            </div>
          )}
          <div className="relative flex items-center gap-2 group/bubble">
            {!isSystem && (
              <motion.div 
                style={{ 
                  position: 'absolute',
                  [isMine ? 'right' : 'left']: -30,
                }}
                animate={{
                  opacity: Math.min(Math.abs(dragX) / swipeThreshold, 1),
                  x: isMine ? Math.min(dragX, 0) : Math.max(dragX, 0),
                }}
                transition={dragX === 0 ? { type: "spring", stiffness: 400, damping: 30 } : { type: "tween", duration: 0 }}
                className="text-neutral-400 pointer-events-none"
              >
                <Reply size={20} />
              </motion.div>
            )}

            <motion.div 
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              animate={{ x: isMine ? Math.min(dragX, 0) : Math.max(dragX, 0) }}
              transition={dragX === 0 ? { type: "spring", stiffness: 400, damping: 30 } : { type: "tween", duration: 0 }}
              className="relative min-w-0 max-w-full w-fit flex flex-col select-text"
              onClick={(e) => {
                e.stopPropagation();
                onMessageClick?.(msg);
                setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id);
              }}
            >
              {activeGroup && !isMine && isGroupStart && (
                <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-1 ml-1 uppercase tracking-wider truncate">
                  {msg.sender_username}
                </div>
              )}
              <div className={`relative px-4 py-2.5 shadow-sm max-w-full w-fit overflow-hidden ${theme.backgroundColor} ${theme.textColor} ${dynamicBorderRadius} ${theme.borderColor ? 'border ' + theme.borderColor : ''}`}>
                {msg.forwarded_from && (
                  <div className="flex flex-col gap-0.5 mb-1.5">
                    <div className="flex items-center gap-1 text-[10px] italic opacity-70">
                      <Forward size={10} />
                      <span>{t('modals.forwarded')}</span>
                    </div>
                    {msg.forwarded_from_username && (
                      <div className="text-[10px] font-bold opacity-80 pl-3.5">
                        {msg.forwarded_from_username}
                      </div>
                    )}
                  </div>
                )}
                {repliedMsg && (
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (msg.reply_to) {
                        const element = document.getElementById(`message-${msg.reply_to}`);
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          element.classList.add('bg-indigo-50/50', 'dark:bg-indigo-900/40', 'ring-2', 'ring-indigo-500/50', 'rounded-xl', 'transition-all', 'duration-500');
                          setTimeout(() => element.classList.remove('bg-indigo-50/50', 'dark:bg-indigo-900/40', 'ring-2', 'ring-indigo-500/50', 'rounded-xl', 'transition-all', 'duration-500'), 2000);
                        }
                      }
                    }}
                    className={`cursor-pointer mb-2 p-2 rounded-lg text-sm border-l-2 overflow-hidden max-w-full w-full min-w-0 flex flex-col transition-colors ${isMine ? 'bg-indigo-700/20 hover:bg-indigo-700/30 border-indigo-200 text-indigo-100' : 'bg-neutral-200/50 hover:bg-neutral-300/50 dark:bg-neutral-700/50 dark:hover:bg-neutral-600/50 border-neutral-400 dark:border-neutral-500 text-neutral-600 dark:text-neutral-300'}`}
                  >
                    <p className="font-semibold text-xs mb-0.5 opacity-80 min-w-0 truncate">
                      {repliedMsg.sender_id === user.id ? t('modals.you') : (repliedMsg.sender_username || activeContact?.first_name || t('common.user'))}
                    </p>
                    <div className="opacity-90 min-w-0">
                      {(() => {
                        if (Boolean((repliedMsg as any).is_deleted)) {
                          return (
                            <div className="flex items-center gap-1.5 italic opacity-60 text-xs text-neutral-500">
                              <Ban size={12} />
                              <span>сообщение удалено</span>
                            </div>
                          );
                        }
                        const trimmed = repliedMsg.content.trim();
                        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                          try {
                            const parsed = JSON.parse(trimmed);
                            if (parsed.type === 'file' || parsed.url || parsed.fileId) {
                              return (
                                <div className="flex flex-col gap-1 min-w-0">
                                  <FileAttachment fileData={parsed} senderId={repliedMsg.sender_id} socket={socket} isThumbnail={true} encryptionData={repliedMsg.encryption_data} activeGroup={activeGroup} />
                                  {parsed.text && <span className="whitespace-pre-wrap break-words text-xs line-clamp-1 truncate">{parsed.text}</span>}
                                </div>
                              );
                            }
                          } catch (e) {}
                          return <span className="truncate text-xs min-w-0">{t('modals.fileAttachment')}</span>;
                        }
                        return <p className="whitespace-pre-wrap break-words [word-break:break-word] text-xs line-clamp-3">{repliedMsg.content}</p>;
                      })()}
                    </div>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="min-w-0 break-words">
                    {Boolean((msg as any).is_deleted) ? (
                      <div className="flex items-center gap-1.5 italic opacity-60">
                        <Ban size={16} />
                        <p className="text-[15px] leading-relaxed">сообщение удалено</p>
                        <span style={{ width: `${spacerWidth}px` }} className="inline-flex shrink-0 h-[14px] align-bottom opacity-0" aria-hidden="true">&#8203;</span>
                      </div>
                    ) : (parsedContent && parsedContent.type === 'file') ? (
                      <div className="flex flex-col gap-2">
                        <FileAttachment fileData={parsedContent} senderId={msg.sender_id} socket={socket} encryptionData={msg.encryption_data} activeGroup={activeGroup} messageId={msg.id} />
                        {parsedContent.text && (
                          <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed min-w-0">
                            {renderMessageText(parsedContent.text)}
                            <span style={{ width: `${spacerWidth}px` }} className="inline-flex shrink-0 h-[14px] align-bottom opacity-0" aria-hidden="true">&#8203;</span>
                          </div>
                        )}
                        {!parsedContent.text && (
                          <div className="h-[4px]">
                            <span style={{ width: `${spacerWidth}px` }} className="inline-flex shrink-0 h-[4px] align-bottom opacity-0" aria-hidden="true">&#8203;</span>
                          </div>
                        )}
                      </div>
                    ) : (parsedContent && parsedContent.type === 'contacts_share') ? (
                      <div className="flex flex-col gap-2">
                        <ContactsShareViewer contacts={parsedContent.contacts || []} isSender={isMine} userContacts={userContacts} />
                        <div className="h-[4px]">
                          <span style={{ width: `${spacerWidth}px` }} className="inline-flex shrink-0 h-[4px] align-bottom opacity-0" aria-hidden="true">&#8203;</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`whitespace-pre-wrap break-words min-w-0 ${largeEmoji ? 'text-5xl py-2' : 'text-[15px] leading-relaxed'}`}>
                        {renderMessageText(msg.content)}
                        <span style={{ width: `${spacerWidth}px` }} className="inline-flex shrink-0 h-[14px] align-bottom opacity-0" aria-hidden="true">&#8203;</span>
                      </div>
                    )}
                  </div>
                  
                  <div className={`absolute bottom-[6px] right-3 flex justify-end items-center shrink-0 select-none ${isMine ? 'text-indigo-100' : 'text-neutral-400 dark:text-neutral-500'}`}>
                    {(msg.is_edited === true || (msg as any).is_edited === 1) && (
                      <span className="text-[10px] opacity-80 mr-1 italic">
                        {t('common.edited') || 'edited'}
                      </span>
                    )}
                    <span className="text-[10px] opacity-80 mt-[1px] font-medium tracking-wide">
                      {new Date(msg.created_at.includes('T') ? msg.created_at : msg.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.encryption_data && (
                      <span title="End-to-End Encrypted" className="flex items-center">
                        <Lock size={10} className="opacity-70 mx-0.5" />
                      </span>
                    )}
                    {isMine && (
                      <div className="ml-1 flex items-center">
                        {msg.status === 'sent' && <Check size={14} className="opacity-80" />}
                        {msg.status === 'delivered' && <CheckCheck size={14} className="opacity-80" />}
                        {msg.status === 'read' && <CheckCheck size={14} className="text-sky-300 dark:text-sky-400 opacity-100" />}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
            
            {Object.keys(reactionCounts).length > 0 && (
              <div className={`absolute -bottom-5 ${isMine ? 'left-2' : 'right-2'} flex gap-1.5 bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 shadow-sm rounded-full px-2 py-1 z-10 max-w-full overflow-x-auto scrollbar-hide`}>
                {Object.entries(reactionCounts).map(([emoji, count]) => (
                  <button 
                    key={emoji} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setReactionMessageId(msg.id);
                      handleReaction({ emoji });
                    }}
                    className="flex items-center gap-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 px-2 py-0.5 rounded-full transition-colors"
                  >
                    <span className="text-xl leading-none">{emoji}</span>
                    {count > 1 && <span className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">{count}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!Boolean((msg as any).is_deleted) && (
            <div 
              className={`items-center transition-opacity shrink-0 gap-1 mx-1 ${isMine ? 'flex-row-reverse' : 'flex-row'} ${selectedMessageId === msg.id || activeDropdownId === msg.id ? 'flex opacity-100' : 'hidden md:flex opacity-0 md:group-hover:opacity-100'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setReactionMessageId(msg.id)}
                className={`p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-all ${reactionMessageId === msg.id ? 'opacity-100 bg-neutral-100 dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400' : ''}`}
                title={t('modals.react')}
              >
                <SmilePlus size={18} />
              </button>
              
              <div className="relative">
                <button 
                  id={`msg-more-btn-${msg.id}`}
                  onClick={openDropdown}
                  className={`p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-all ${activeDropdownId === msg.id ? 'opacity-100 bg-neutral-100 dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400' : ''}`}
                >
                  <MoreHorizontal size={18} />
                </button>

                {activeDropdownId === msg.id && typeof document !== 'undefined' && createPortal(
                  <Fragment>
                    <div 
                      className="fixed inset-0 z-[90]" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdownId(null);
                      }}
                    />
                    <div 
                      style={dropdownStyle}
                      className="min-w-[260px] max-w-[90vw] bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-100 dark:border-neutral-700 overflow-hidden py-1 z-[100]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-neutral-100 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/80">
                        {['👍', '❤️', '😂', '😲', '😢', '🔥'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => {
                              handleReaction({ emoji }, msg.id);
                              setActiveDropdownId(null);
                            }}
                            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full transition-transform hover:scale-110 flex items-center justify-center flex-1"
                          >
                            <span className="text-xl leading-none">{emoji}</span>
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setReactionMessageId(msg.id);
                            setActiveDropdownId(null);
                          }}
                          className="p-1.5 text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full flex items-center justify-center ml-1"
                          title={t('modals.react') || 'More Reactions'}
                        >
                          <SmilePlus size={18} />
                        </button>
                      </div>

                      <button 
                        onClick={() => {
                          setReplyingTo(msg);
                          setActiveDropdownId(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 transition-colors"
                      >
                        <Reply size={16} /> {t('modals.reply')}
                      </button>
                      <button 
                        onClick={() => {
                          setForwardingMessage(msg);
                          setShowForwardModal(true);
                          setActiveDropdownId(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 transition-colors"
                      >
                        <Forward size={16} /> {t('modals.forward')}
                      </button>

                      {(parsedContent && parsedContent.type === 'file') && (
                        <Fragment>
                          <button 
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('save-file-requested', { detail: { fileId: parsedContent.fileId || parsedContent.url, messageId: msg.id } }));
                              setActiveDropdownId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-2 transition-colors"
                          >
                            <Download size={16} /> {t('modals.saveToDevice') || 'Сохранить'}
                          </button>
                          {(parsedContent.mime?.startsWith('audio/') || parsedContent.mime?.startsWith('video/')) && (
                            <button
                               onClick={() => {
                                 window.dispatchEvent(new CustomEvent('transcribe-requested', { detail: { messageId: msg.id } }));
                                 setActiveDropdownId(null);
                               }}
                               className="w-full text-left px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center gap-2 transition-colors"
                            >
                               <Type size={16} /> {t('common.transcribe') || 'Transcribe'}
                            </button>
                          )}
                        </Fragment>
                      )}

                      {onSetReminder && (
                        <button 
                          onClick={() => {
                            onSetReminder(msg.id);
                            setActiveDropdownId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center gap-2 transition-colors"
                        >
                          <Bell size={16} /> {t('modals.setReminder') || 'Set Reminder'}
                        </button>
                      )}

                      {pinnedMessageIds.includes(msg.id) ? (
                        <button 
                          onClick={() => {
                            if (onUnpinMessage) {
                              const snippetText = msg.content && typeof msg.content === 'string' ? msg.content : '';
                              let cleanSnippet = snippetText;
                              if (cleanSnippet.startsWith('{') && cleanSnippet.endsWith('}')) {
                                try {
                                  const parsed = JSON.parse(cleanSnippet);
                                  cleanSnippet = parsed.text ? `📎 ${parsed.text}` : '📎 Attachment';
                                } catch (e) {}
                              }
                              const snippet = cleanSnippet.length > 50 ? cleanSnippet.substring(0, 50) + '...' : cleanSnippet;
                              onUnpinMessage(msg.id, snippet);
                            }
                            setActiveDropdownId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2 transition-colors"
                        >
                          <Pin size={16} className="fill-current" /> {t('modals.unpinMessage') || 'Unpin Message'}
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            if (onPinMessage) {
                              const snippetText = msg.content && typeof msg.content === 'string' ? msg.content : '';
                              let cleanSnippet = snippetText;
                              if (cleanSnippet.startsWith('{') && cleanSnippet.endsWith('}')) {
                                try {
                                  const parsed = JSON.parse(cleanSnippet);
                                  cleanSnippet = parsed.text ? `📎 ${parsed.text}` : '📎 Attachment';
                                } catch (e) {}
                              }
                              const snippet = cleanSnippet.length > 50 ? cleanSnippet.substring(0, 50) + '...' : cleanSnippet;
                              onPinMessage(msg.id, snippet);
                            }
                            setActiveDropdownId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 transition-colors"
                        >
                          <Pin size={16} /> {t('modals.pinMessage') || 'Pin Message'}
                        </button>
                      )}
                      
                      {isMine && !Boolean((msg as any).is_deleted) && (
                        <Fragment>
                          <div className="h-px bg-neutral-100 dark:bg-neutral-700 my-1"></div>
                          <button 
                            onClick={() => {
                              setEditingMessage(msg);
                              setActiveDropdownId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 transition-colors"
                          >
                            <Edit2 size={16} /> {t('common.edit') || 'Edit'}
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm(t('common.deleteConfirm') || 'Are you sure you want to delete this message?')) {
                                handleDeleteMessage(msg.id);
                              }
                              setActiveDropdownId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                          >
                            <Trash2 size={16} /> {t('common.delete')}
                          </button>
                        </Fragment>
                      )}
                    </div>
                  </Fragment>, document.body
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </Fragment>
  );
}
