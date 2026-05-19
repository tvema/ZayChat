'use client';
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Message, User, Group } from '@/types/chat';
import { FileIcon, LinkIcon, Headphones, Image as ImageIcon, Download, Loader2 } from 'lucide-react';
import { useLanguage } from '@/components/LanguageProvider';
import { FileAttachment } from '@/components/FileAttachment';
import type { Socket } from 'socket.io-client';

interface SharedMediaRendererProps {
  messages: Message[];
  activeTab: 'media' | 'docs' | 'audio' | 'links';
  socket?: Socket | null;
  activeGroup?: Group | null;
  activeContact?: User | null;
  token?: string;
}

export function SharedMediaRenderer({ messages, activeTab, socket = null, activeGroup, activeContact, token }: SharedMediaRendererProps) {
  const { t } = useLanguage();
  const [fetchedMessages, setFetchedMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchMedia = useCallback(async (isLoadMore = false) => {
    const contactId = activeGroup?.id || activeContact?.id;
    if (!contactId || !token) return;
    
    setIsLoading(true);
    try {
      const before = isLoadMore && fetchedMessages.length > 0 ? fetchedMessages[fetchedMessages.length - 1].created_at : '';
      const isGroup = !!activeGroup;
      
      const res = await fetch(`/api/messages/${contactId}/media?isGroup=${isGroup}&limit=50${before ? `&before=${before}` : ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.length < 50) {
          setHasMore(false);
        }
        setFetchedMessages(prev => isLoadMore ? [...prev, ...data] : data);
      }
    } catch (e) {
      console.error('Failed to fetch media messages', e);
    } finally {
      setIsLoading(false);
    }
  }, [activeGroup?.id, activeContact?.id, token, fetchedMessages]);

  useEffect(() => {
    setFetchedMessages([]);
    setHasMore(true);
    fetchMedia(false);
  }, [activeGroup?.id, activeContact?.id]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && hasMore && !isLoading) {
      fetchMedia(true);
    }
  };

  const allMessages = useMemo(() => {
    const map = new Map<string, Message>();
    fetchedMessages.forEach(m => map.set(m.id, m));
    messages.forEach(m => {
      if (m.content.includes('"type":"file"') || m.content.includes('"type":"link"') || m.content.includes('http')) {
        map.set(m.id, m);
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [fetchedMessages, messages]);

  const items = useMemo(() => {
    const results: any[] = [];
    allMessages.forEach(msg => {
      // It's possible msg.content is just text, or JSON if file
      try {
        const metadata = JSON.parse(msg.content);
        if (metadata.type === 'file') {
          const type = metadata.mime?.toLowerCase() || '';
          const isImage = type.startsWith('image/');
          const isAudio = type.startsWith('audio/');
          const isVideo = type.startsWith('video/');
          const isMedia = isImage || isVideo;
          const isDoc = !isMedia && !isAudio;
          
          if (activeTab === 'media' && isMedia) {
            results.push({ ...metadata, msgId: msg.id, createdAt: msg.created_at, isImage, isVideo });
          } else if (activeTab === 'audio' && isAudio) {
            results.push({ ...metadata, msgId: msg.id, createdAt: msg.created_at });
          } else if (activeTab === 'docs' && isDoc) {
            results.push({ ...metadata, msgId: msg.id, createdAt: msg.created_at });
          }
        }
      } catch (e) {
        // Not JSON
      }

      if (activeTab === 'links') {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let contentToMatch = msg.content;
        try {
          const js = JSON.parse(msg.content);
          if (js.text) contentToMatch = js.text;
        } catch(e) {}

        const matches = contentToMatch.match(urlRegex);
        if (matches) {
          matches.forEach(url => {
            results.push({ type: 'link', url, msgId: msg.id, createdAt: msg.created_at });
          });
        }
      }
    });

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allMessages, activeTab]);

  if (items.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center h-full">
        <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4 text-neutral-400">
          {activeTab === 'media' && <ImageIcon size={32} />}
          {activeTab === 'docs' && <FileIcon size={32} />}
          {activeTab === 'audio' && <Headphones size={32} />}
          {activeTab === 'links' && <LinkIcon size={32} />}
        </div>
        <p className="text-neutral-500 font-medium">Нет данных</p>
      </div>
    );
  }

  if (activeTab === 'media') {
    return (
      <div 
        className="grid grid-cols-3 gap-1 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800"
        onScroll={handleScroll}
      >
        {items.map((item, idx) => {
          const isDecryptedUrl = item.url && !item.isEncrypted;
          return (
            <a key={idx} href={isDecryptedUrl ? item.url : '#'} onClick={(e) => { if (!isDecryptedUrl) e.preventDefault(); }} target={isDecryptedUrl ? "_blank" : undefined} rel="noopener noreferrer" className="relative aspect-square cursor-pointer group bg-neutral-100 dark:bg-neutral-800 overflow-hidden block">
              <FileAttachment 
                fileData={item} 
                senderId={item.senderId || ''} 
                socket={socket} 
                activeGroup={activeGroup} 
                isThumbnail={true} 
                thumbnailClassName="w-full h-full [&>img]:object-cover [&>video]:object-cover [&>img]:group-hover:scale-105 [&>video]:group-hover:scale-105" 
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
              {item.isVideo && (
                <span className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded pointer-events-none">Видео</span>
              )}
            </a>
          );
        })}
        {isLoading && (
          <div className="col-span-3 flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'docs' || activeTab === 'audio') {
    return (
      <div 
        className="flex flex-col gap-2 p-2 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800"
        onScroll={handleScroll}
      >
        {items.map((item, idx) => (
          <FileAttachment 
            key={idx} 
            fileData={item} 
            senderId={item.senderId || ''} 
            socket={socket} 
            activeGroup={activeGroup} 
          />
        ))}
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'links') {
    return (
      <div 
        className="flex flex-col gap-2 p-2 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800"
        onScroll={handleScroll}
      >
        {items.map((item, idx) => (
          <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center shrink-0">
              <LinkIcon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 truncate">{item.url}</p>
            </div>
          </a>
        ))}
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        )}
      </div>
    );
  }

  return null;
}
