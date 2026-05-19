import { safeSessionStorage } from '@/lib/safeStorage';
import { safeLocalStorage } from '@/lib/safeStorage';
import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { User, Message, Group, Reaction, Reminder, PinnedMessage } from '@/types/chat';
import { EmojiClickData } from 'emoji-picker-react';
import { useGlobalModal } from '@/components/GlobalModalProvider';
import { useLanguage } from '@/components/LanguageProvider';
import { 
  encryptFile, 
  decryptFile, 
  decryptAESKeyWithRSA, 
  encryptAESKeyWithRSA,
  importKey, 
  base64ToArrayBuffer, 
  encryptText, 
  decryptText, 
  arrayBufferToBase64, 
  encryptPrivateKeyWithPassword,
  generateRSAKeyPair,
  exportKey
} from '@/lib/crypto';
import { keyRing } from '@/lib/keyRing';
import { decryptMessageIfNeeded } from '@/lib/cryptoUtils';
import { useChatData } from './useChatData';
import { useChatActions } from './useChatActions';
import { useChatModals } from './useChatModals';
import { useSocketEvents } from './useSocketEvents';

import { getCachedMessages, setCachedMessages, clearCache } from '@/lib/dbCache';

export function useChat() {
  const { showAlert, showConfirm } = useGlobalModal();
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  
  const [contacts, setContacts] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [hasUnreadFeed, setHasUnreadFeed] = useState(false);
  const [appView, setAppView] = useState<'messages' | 'feed'>('messages');
  const [selectedFeedUserId, setSelectedFeedUserId] = useState<string | null>(null);

  const fetchFeedPosts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/feed', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setFeedPosts(data);
        if (data.some((p: any) => p.user_id !== user?.id && !p.is_viewed)) {
          setHasUnreadFeed(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch feed posts', error);
    }
  }, [token, user?.id]);

  useEffect(() => {
    if (token) fetchFeedPosts();
  }, [token, fetchFeedPosts]);

  useEffect(() => {
    if (!socket) return;
    
    // Listen for new posts
    const handleNewPost = (post: any) => {
      setFeedPosts(prev => {
        if (prev.find(p => p.id === post.id)) return prev;
        return [post, ...prev];
      });
      if (post.user_id !== user?.id && appView !== 'feed') {
        setHasUnreadFeed(true);
      }
    };
    
    const handleDeletePost = ({ postId }: { postId: string }) => {
      setFeedPosts(prev => prev.filter(p => p.id !== postId));
    };

    socket.on('feed:new_post', handleNewPost);
    socket.on('feed:post_deleted', handleDeletePost);
    
    return () => {
      socket.off('feed:new_post', handleNewPost);
      socket.off('feed:post_deleted', handleDeletePost);
    };
  }, [socket, user?.id, appView]);
  const [contactCircles, setContactCircles] = useState<any[]>([]);
  const [unlockedCircles, setUnlockedCircles] = useState<string[]>([]);
  const [activeContact, setActiveContact] = useState<User | null>(null);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [sidebarView, setSidebarView] = useState<'chats' | 'groups'>('chats');
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [messageSearchResults, setMessageSearchResults] = useState<{ chatId: string, message: Message, isGroup: boolean }[]>([]);
  const backgroundSearchRef = useRef<{ q: string; active: boolean }>({ q: '', active: false });

  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [isInChatSearching, setIsInChatSearching] = useState(false);
  const inChatSearchRef = useRef<{ q: string; chatId: string | null; active: boolean }>({ q: '', chatId: null, active: false });

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const handleMessageResultClick = (chatId: string, message: Message, isGroup: boolean) => {
    // 1. Switch chat
    if (isGroup) {
      const g = groups.find(x => x.id === chatId);
      if (g) {
        setActiveGroup(g);
        setActiveContact(null);
      }
    } else {
      const c = contacts.find(x => x.id === chatId);
      if (c) {
        setActiveContact(c);
        setActiveGroup(null);
      }
    }
    
    // 2. Highlight message
    setHighlightedMessageId(message.id);
    // 3. Clear global search
    setIsSearching(false);
    setSearchQuery('');
  };
  
  const modals = useChatModals();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [avatarToCrop, setAvatarToCrop] = useState<string | null>(null);
  const avatarTargetRef = useRef<{ type: 'user' | 'group', id?: string }>({ type: 'user' });
  const [typingUsers, setTypingUsers] = useState<Record<string, { userId: string, username: string }[]>>({});

  // Eagerly hydrate IndexedDB with private key for SW decryption
  useEffect(() => {
    if (typeof window !== 'undefined') {
      keyRing.getPrivateKey().catch(console.error);
    }
  }, []);

  // Automatic Key Generation for old users
  useEffect(() => {
    const checkAndGenerateKeys = async () => {
      if (user && token && !user.public_key) {
        console.log('[E2EE] User missing public key, attempting to generate...');
        // We need the password to encrypt the private key
        // During login we store it in session storage temporarily
        const password = safeLocalStorage.getItem('user_password') || safeSessionStorage.getItem('user_password'); 
        
        if (!password) {
          console.warn('[E2EE] Cannot generate keys: password not found in local storage. User must re-login.');
          return;
        }

        try {
          const keyPair = await generateRSAKeyPair();
          const publicKeyJwk = await exportKey(keyPair.publicKey);
          const encryptedPrivateKeyData = await encryptPrivateKeyWithPassword(keyPair.privateKey, password);
          
          const res = await fetch('/api/users/keys', {
            method: 'PUT',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
              publicKey: publicKeyJwk,
              encryptedPrivateKey: JSON.stringify(encryptedPrivateKeyData)
            })
          });

          if (res.ok) {
            console.log('[E2EE] Successfully generated and uploaded keys for user');
            const privateKeyJwk = await exportKey(keyPair.privateKey);
            safeLocalStorage.setItem('e2e_private_key', privateKeyJwk);
            
            // Update local user state
            const updatedUser = { 
              ...user, 
              public_key: publicKeyJwk, 
              encrypted_private_key: JSON.stringify(encryptedPrivateKeyData) 
            };
            setUser(updatedUser);
            safeLocalStorage.setItem('user', JSON.stringify(updatedUser));
          } else {
            console.error('[E2EE] Failed to upload generated keys', await res.text());
          }
        } catch (e) {
          console.error('[E2EE] Error during automatic key generation:', e);
        }
      }
    };

    checkAndGenerateKeys();
  }, [user, token]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  const activeContactIdRef = useRef<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);
  const contactsRef = useRef<User[]>([]);
  const groupsRef = useRef<Group[]>([]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const {
    reminders,
    pinnedMessages,
    fetchReminders,
    fetchPinnedMessages,
    handleSetReminder,
    handleDeleteReminder,
    handleEditReminder,
    handleSnoozeReminder,
    handleDismissReminder,
    handlePinMessage,
    handleUnpinMessage
  } = useChatData(token, user, groups, activeContact?.id, activeGroup?.id);

  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const scrollPositionsRef = useRef<Record<string, { scrollTop?: number; distanceFromBottom?: number; wasAtBottom: boolean }>>({});

  useEffect(() => {
    activeContactIdRef.current = activeContact?.id || null;
    activeGroupIdRef.current = activeGroup?.id || null;
  }, [activeContact, activeGroup]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  const initAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const contactCirclesRef = useRef(contactCircles);
  useEffect(() => { contactCirclesRef.current = contactCircles; }, [contactCircles]);

  useEffect(() => {
    // Check for shared files or text
    if (typeof window !== 'undefined' && window.location.search.includes('shared=true')) {
      const searchParams = new URLSearchParams(window.location.search);
      const text = searchParams.get('text');
      const title = searchParams.get('title');
      const urlParam = searchParams.get('url');
      
      let initialText = '';
      if (title) initialText += title + '\n';
      if (text) initialText += text + '\n';
      if (urlParam) initialText += urlParam;
      initialText = initialText.trim();
      
      let hasSharedContent = false;

      if (initialText) {
        if (modals.setSharedText) {
           modals.setSharedText(initialText);
        }
        hasSharedContent = true;
      }

      const checkSharedFiles = async () => {
        try {
          if (typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB) {
            const request = window.indexedDB.open('shared_files_db', 1);
            request.onsuccess = (e: any) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains('files')) {
                 if (hasSharedContent) modals.setShowShareModal(true);
                 return;
              }
              const tx = db.transaction('files', 'readwrite');
              const store = tx.objectStore('files');
              const getAllReq = store.getAll();
              getAllReq.onsuccess = () => {
                if (getAllReq.result && getAllReq.result.length > 0) {
                  modals.setSharedFiles(getAllReq.result);
                  modals.setShowShareModal(true);
                  // Clear the files after loading
                  store.clear();
                } else if (hasSharedContent) {
                  modals.setShowShareModal(true);
                }
              };
            };
          } else if (hasSharedContent) {
            modals.setShowShareModal(true);
          }
        } catch (err) {
          console.error("Failed to read shared files", err);
          if (hasSharedContent) modals.setShowShareModal(true);
        }
      };
      
      checkSharedFiles();
      // Optionally clean up URL - keep other important params if any
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const playMessageSound = useCallback((isIncoming: boolean) => {
    try {
      const ctx = initAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      if (isIncoming) {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.1);
      } else {
        osc.frequency.setValueAtTime(880.00, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(587.33, ctx.currentTime + 0.1);
      }
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.error('Failed to play message sound', e);
    }
  }, []);

  const { handleEditMessage, handleDeleteMessage, handleSendMessage, handleForward } = useChatActions(token, activeContact, activeGroup, messages, socket, user, groups, contacts, setMessages, playMessageSound, chatFileInputRef, replyingTo, setReplyingTo, setShowEmojiPicker, modals.forwardingMessage, modals.setShowForwardModal, modals.setForwardingMessage);

  const handleLogout = useCallback(async () => {
    console.log('Logging out...');
    
    // Attempt to unsubscribe from web push notifications before logging out
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          console.log('Unsubscribed from push notifications on logout');
        }
      } catch (e) {
        console.error('Failed to unsubscribe from push on logout', e);
      }
    }

    const storedToken = safeLocalStorage.getItem('token');
    if (storedToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${storedToken}` }
        });
      } catch (e) {
        console.error('Logout API failed', e);
      }
    }
    
    // Clear everything, including the E2E private key, from this device
    safeLocalStorage.clear();
    clearCache();
    
    // Force a full reload to the login screen to ensure all React state and WebSockets are completely destroyed
    window.location.href = '/login';
  }, []);

  const fetchContacts = useCallback(async (retryCount = 0) => {
    const storedToken = safeLocalStorage.getItem('token');
    if (!storedToken) return;
    try {
      const res = await fetch('/api/contacts', {
        headers: { 'Authorization': `Bearer ${storedToken}` }
      });
      if (res.ok) {
        const text = await res.text();
        setContacts(text ? JSON.parse(text) : []);
      } else {
        if (res.status === 401) {
          safeLocalStorage.clear();
          window.location.href = '/login?revoked=true';
          return;
        }
        console.error('Failed to fetch contacts, status:', res.status);
        if (retryCount < 3) {
          setTimeout(() => fetchContacts(retryCount + 1), 1000 * (retryCount + 1));
        }
      }
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      if (retryCount < 3) {
        setTimeout(() => fetchContacts(retryCount + 1), 1000 * (retryCount + 1));
      }
    }
  }, []);

  const fetchGroups = useCallback(async (retryCount = 0) => {
    const storedToken = safeLocalStorage.getItem('token');
    if (!storedToken) return;
    try {
      const res = await fetch('/api/groups', {
        headers: { 'Authorization': `Bearer ${storedToken}` }
      });
      if (res.ok) {
        const text = await res.text();
        const groupsData = text ? JSON.parse(text) : [];
        setGroups(groupsData);
      } else {
        if (res.status === 401) {
          safeLocalStorage.clear();
          window.location.href = '/login?revoked=true';
          return;
        }
        console.error('Failed to fetch groups, status:', res.status);
        if (retryCount < 3) {
          setTimeout(() => fetchGroups(retryCount + 1), 1000 * (retryCount + 1));
        }
      }
    } catch (err) {
      console.error('Failed to fetch groups:', err);
      if (retryCount < 3) {
        setTimeout(() => fetchGroups(retryCount + 1), 1000 * (retryCount + 1));
      }
    }
  }, []);

  const fetchContactCircles = useCallback(async (retryCount = 0) => {
    const storedToken = safeLocalStorage.getItem('token');
    if (!storedToken) return;
    try {
      const res = await fetch('/api/contact-circles', {
        headers: { 'Authorization': `Bearer ${storedToken}` }
      });
      if (res.ok) {
        const text = await res.text();
        setContactCircles(text ? JSON.parse(text) : []);
      } else {
        if (res.status === 401) {
          safeLocalStorage.clear();
          window.location.href = '/login?revoked=true';
          return;
        }
        if (retryCount < 3) {
          setTimeout(() => fetchContactCircles(retryCount + 1), 1000 * (retryCount + 1));
        }
      }
    } catch (err) {
      console.error('Failed to fetch contact circles:', err);
      if (retryCount < 3) {
        setTimeout(() => fetchContactCircles(retryCount + 1), 1000 * (retryCount + 1));
      }
    }
  }, []);





  useEffect(() => {
    const storedToken = safeLocalStorage.getItem('token');
    const storedUser = safeLocalStorage.getItem('user');
    
    if (!storedToken || storedToken === 'undefined' || !storedUser || storedUser === 'undefined') {
      safeLocalStorage.removeItem('token');
      safeLocalStorage.removeItem('user');
      safeLocalStorage.removeItem('e2e_private_key');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return;
    }

    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(e => console.warn('Notification permission error', e));
      }
    } catch (e) {
      console.warn('Notification API blocked', e);
    }
    
    setToken(storedToken);
    try {
      setUser(JSON.parse(storedUser));
    } catch (e) {
      safeLocalStorage.removeItem('token');
      safeLocalStorage.removeItem('user');
      window.location.replace('/login');
      return;
    }
    
    fetch('/api/users/me', {
      headers: { 'Authorization': `Bearer ${storedToken}` }
    })
    .then(async res => {
      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return null;
      }
      throw new Error('Failed to fetch user');
    })
    .then(data => {
      if (data && data.id) {
        setUser(data);
        safeLocalStorage.setItem('user', JSON.stringify(data));
      } else if (data === null) {
        handleLogout();
      }
    })
    .catch(err => {
      console.error('Failed to fetch user:', err);
      if (err.message.includes('401') || err.message.includes('403')) {
        handleLogout();
      }
    });
    
    fetchContacts();
    fetchGroups();
    fetchContactCircles();
    fetchReminders();

    const newSocket = io({
      auth: { token: storedToken }
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleLogout, fetchContacts, fetchGroups, fetchContactCircles, fetchReminders]);

  const appViewRef = useRef(appView);
  useEffect(() => { appViewRef.current = appView; }, [appView]);

  useEffect(() => {
    const handleContactsUpdated = () => {
      fetchContacts();
    };
    window.addEventListener('contacts-updated', handleContactsUpdated);
    return () => window.removeEventListener('contacts-updated', handleContactsUpdated);
  }, [fetchContacts]);

  useSocketEvents({
    socket,
    t,
    userRef,
    activeContactIdRef,
    activeGroupIdRef,
    groupsRef,
    contactsRef,
    contactCirclesRef,
    appViewRef,
    setHasUnreadFeed,
    typingTimeoutsRef,
    setMessages,
    setContacts,
    setGroups,
    setActiveGroup,
    setSearchResults,
    setActiveContact,
    setTypingUsers,
    fetchContacts,
    fetchGroups,
    playMessageSound,
    fetchPinnedMessages,
    fetchReminders
  });

  useEffect(() => {
    if (!activeContact && !activeGroup) {
      setMessages([]);
      return;
    }
    
    const id = activeContact?.id || activeGroup?.id;
    const isGroup = !!activeGroup;
    
    // Clear messages state is now handled by filtering in MessageList and key re-mount
    setHasMoreMessages(true);
    setIsLoadingMore(true);
    
    const controller = new AbortController();

    const asyncFetch = async () => {
      let cached: Message[] | null = null;
      let afterParam = '';
      
      if (id) {
        cached = await getCachedMessages(id);
        if (cached && cached.length > 0) {
          // Verify we are still looking at the same chat to avoid race conditions
          const currentId = activeContactIdRef.current || activeGroupIdRef.current;
          if (currentId === id) {
            setMessages(prev => {
              if (prev.length === 0) return cached!;
              return prev;
            });
            const latestCachedMessage = cached[cached.length - 1];
            afterParam = `&after=${encodeURIComponent(latestCachedMessage.created_at)}`;
          }
        }
      }
      
      const unreadCount = isGroup ? (activeGroup?.unread_count || 0) : (activeContact?.unread_count || 0);
      const limit = Math.min(100, Math.max(30, unreadCount + 10));
      const fetchUrl = afterParam 
        ? `/api/messages/${id}?isGroup=${isGroup}${afterParam}`
        : `/api/messages/${id}?isGroup=${isGroup}&limit=${limit}`;
        
      try {
        const res = await fetch(fetchUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });
        
        if (res.ok) {
          const text = await res.text();
          const rawData = text ? JSON.parse(text) : [];
          
          if (!afterParam && rawData.length < limit) {
             setHasMoreMessages(false);
          }
          
          if (rawData.length > 0 && id) {
            const decryptedBatch = await Promise.all(rawData.map((msg: Message) => decryptMessageIfNeeded(msg, userRef.current?.id, groupsRef.current)));
            fetchPinnedMessages(id);
            
            setMessages(prev => {
              const currentId = activeContactIdRef.current || activeGroupIdRef.current;
              if (currentId !== id) return prev;
              
              const allMap = new Map<string, Message>();
              prev.forEach(m => allMap.set(m.id, m));
              decryptedBatch.forEach(m => allMap.set(m.id, m));
              
              const merged = Array.from(allMap.values()).sort((a, b) => {
                const timeA = new Date(a.created_at.includes('T') ? a.created_at : a.created_at.replace(' ', 'T') + 'Z').getTime();
                const timeB = new Date(b.created_at.includes('T') ? b.created_at : b.created_at.replace(' ', 'T') + 'Z').getTime();
                return timeA - timeB;
              });
              setCachedMessages(id, merged);
              return merged;
            });
          } else if (cached && cached.length > 0 && id) {
            // No new messages, cache is still the best
          }
          
          setIsLoadingMore(false);
          
          if (!isGroup && activeContact) {
            if (socket) {
              socket.emit('contact:read', { contactId: activeContact.id });
            }
            setContacts(prev => prev.map(c => 
              c.id === activeContact.id ? { ...c, unread_count: 0 } : c
            ));
          } else if (isGroup && activeGroup) {
            if (socket) {
               socket.emit('group:read', { groupId: activeGroup.id });
            }
            setGroups(prev => prev.map(g => 
              g.id === activeGroup.id ? { ...g, unread_count: 0 } : g
            ));
          }
        } else {
           setIsLoadingMore(false);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch messages:', err);
        setIsLoadingMore(false);
      }
    };
    
    asyncFetch();
    
    return () => {
      controller.abort();
    };
  }, [activeContact?.id, activeGroup?.id, token, socket]);

  // Mark messages as read when returning to the tab
  useEffect(() => {
    if (!socket || (!activeContact && !activeGroup)) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (activeContact) {
          socket.emit('contact:read', { contactId: activeContact.id });
          setContacts(prev => prev.map(c => 
            c.id === activeContact.id ? { ...c, unread_count: 0 } : c
          ));
        } else if (activeGroup) {
          // If we have an active group, we check if it has unread count
          socket.emit('group:read', { groupId: activeGroup.id });
          setGroups(prev => prev.map(g => 
            g.id === activeGroup.id ? { ...g, unread_count: 0 } : g
          ));
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeContact, activeGroup, messages, socket, setContacts, setGroups]);

  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages || (!activeContact && !activeGroup)) return;
    
    setIsLoadingMore(true);
    const id = activeContact?.id || activeGroup?.id;
    const isGroup = !!activeGroup;
    const oldestMessage = messages[0];
    const before = oldestMessage ? oldestMessage.created_at : null;
    
    try {
      const res = await fetch(`/api/messages/${id}?isGroup=${isGroup}&limit=30${before ? `&before=${before}` : ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const text = await res.text();
        const data = text ? JSON.parse(text) : [];
        if (data.length < 30) {
          setHasMoreMessages(false);
        }
        if (data.length > 0) {
          const decryptedMessages = await Promise.all(data.map((msg: Message) => decryptMessageIfNeeded(msg, userRef.current?.id, groupsRef.current)));
          setMessages(prev => {
            const combined = [...decryptedMessages, ...prev];
            if (id) {
              setCachedMessages(id, combined);
            }
            return combined;
          });
        }
      }
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreMessages, activeContact, activeGroup, messages, token]);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (q.length > 1) {
      setIsSearching(true);
      backgroundSearchRef.current = { q, active: true };
      
      searchTimeoutRef.current = setTimeout(() => {
        // 1. Search users via API
        fetch(`/api/users/search?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(async res => {
          if (backgroundSearchRef.current.q !== q) return;
          if (res.ok) {
            const text = await res.text();
            setSearchResults(text ? JSON.parse(text) : []);
          } else {
            setSearchResults([]);
          }
        })
        .catch(err => console.error('Search API failure', err));

        // 2. Perform local message search and background fetching
        performMessageSearch(q);
      }, 300);
    } else {
      setIsSearching(false);
      setSearchResults([]);
      setMessageSearchResults([]);
      backgroundSearchRef.current = { q, active: false };
    }
  };

  const performMessageSearch = async (q: string) => {
    setMessageSearchResults([]);
    const results: { chatId: string, message: Message, isGroup: boolean }[] = [];
    
    // Search current messages in state
    if (messages.length > 0) {
      const activeId = activeContact?.id || activeGroup?.id;
      if (activeId) {
        messages.forEach(msg => {
          if (msg.content && msg.content.toLowerCase().includes(q.toLowerCase())) {
            results.push({ chatId: activeId, message: msg, isGroup: !!activeGroup });
          }
        });
      }
    }

    // Search in IndexedDB cache for ALL chats
    const allChatIds = [
      ...contacts.map(c => ({ id: c.id, isGroup: false })),
      ...groups.map(g => ({ id: g.id, isGroup: true }))
    ];

    for (const chat of allChatIds) {
      if (backgroundSearchRef.current.q !== q || !backgroundSearchRef.current.active) return;
      const cached = await getCachedMessages(chat.id);
      if (cached && backgroundSearchRef.current.q === q) {
        cached.forEach(msg => {
          if (msg.content && msg.content.toLowerCase().includes(q.toLowerCase())) {
            // Avoid duplicates
            if (!results.find(r => r.message.id === msg.id)) {
              results.push({ chatId: chat.id, message: msg, isGroup: chat.isGroup });
            }
          }
        });
        if (backgroundSearchRef.current.q === q) {
          setMessageSearchResults([...results]);
        }
      }
    }

    // 3. Background crawling for chats NOT in cache or with sparse history
    // We only do this if q is still the same
    for (const chat of allChatIds) {
      if (backgroundSearchRef.current.q !== q) break;
      
      // Skip if we already searched this chat in messages state recently
      // Or just fetch last 50 anyway to be sure
      try {
        const res = await fetch(`/api/messages/${chat.id}?isGroup=${chat.isGroup}&limit=50`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok && backgroundSearchRef.current.q === q) {
          const text = await res.text();
          const rawData = text ? JSON.parse(text) : [];
          
          if (rawData.length > 0) {
            const decrypted = await Promise.all(rawData.map((msg: Message) => 
              decryptMessageIfNeeded(msg, userRef.current?.id, groupsRef.current)
            ));
            
            // Cache them for future local search
            setCachedMessages(chat.id, decrypted);
            
            // Search in newly fetched messages
            decrypted.forEach(msg => {
              if (msg.content && msg.content.toLowerCase().includes(q.toLowerCase())) {
                if (!results.find(r => r.message.id === msg.id)) {
                  results.push({ chatId: chat.id, message: msg, isGroup: chat.isGroup });
                }
              }
            });
            
            if (backgroundSearchRef.current.q === q) {
              setMessageSearchResults([...results]);
            }
          }
        }
      } catch (err) {
        console.warn(`Background search failed for ${chat.id}`, err);
      }
      
      // Small delay between chat fetches to avoid hammering the server
      await new Promise(r => setTimeout(r, 100));
    }
  };

  const handleInChatSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInChatSearchQuery(q);
    
    const currentChatId = activeContact?.id || activeGroup?.id;
    if (!currentChatId) return;

    if (q.length > 1) {
      setIsInChatSearching(true);
      inChatSearchRef.current = { q, chatId: currentChatId, active: true };
      
      const crawlChat = async (searchQ: string, chatId: string, isGroupChat: boolean, initialBefore: string | null) => {
        let before = initialBefore;
        let foundCount = 0;
        let pageCount = 0;
        const maxPages = 10; 

        while (
          inChatSearchRef.current.active && 
          inChatSearchRef.current.q === searchQ && 
          inChatSearchRef.current.chatId === chatId && 
          pageCount < maxPages
        ) {
          // Re-fetch "before" from the latest state inside the loop if necessary, 
          // or just keep track of it.
          // Let's get the current oldest from a ref or just use state if we are careful.
          // Since we are adding to state, we should probably check what's the oldest message currently.
          
          // Simplified: first iteration uses current oldest, next ones use our current crawl cursor.
          
          try {
            // We need to know where current local messages start to go before them
            // If it's the first page, we start from currently loaded messages
            const fetchUrl: string = `/api/messages/${chatId}?isGroup=${isGroupChat}&limit=50${before ? `&before=${before}` : ''}`;
            const res = await fetch(fetchUrl, {
              headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) break;
            const text = await res.text();
            const data = text ? JSON.parse(text) : [];
            if (data.length === 0) break;
            
            const decrypted = await Promise.all(data.map((msg: Message) => 
              decryptMessageIfNeeded(msg, userRef.current?.id, groupsRef.current)
            ));

            if (decrypted.length > 0) {
              setMessages(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newMsgs = decrypted.filter(dm => !existingIds.has(dm.id));
                if (newMsgs.length === 0) return prev;
                const combined = [...newMsgs, ...prev];
                return combined.sort((a, b) => {
                  const timeA = new Date(a.created_at.includes('T') ? a.created_at : a.created_at.replace(' ', 'T') + 'Z').getTime();
                  const timeB = new Date(b.created_at.includes('T') ? b.created_at : b.created_at.replace(' ', 'T') + 'Z').getTime();
                  return timeA - timeB;
                });
              });

              before = decrypted[0].created_at;
              const matches = decrypted.filter(m => m.content && m.content.toLowerCase().includes(searchQ.toLowerCase()));
              foundCount += matches.length;
              pageCount++;

              if (foundCount >= 15 || data.length < 50) break;
            } else {
              break;
            }
            await new Promise(r => setTimeout(r, 300));
          } catch (err) {
            console.error('In-chat background search error', err);
            break;
          }
        }
        
        if (inChatSearchRef.current.q === searchQ) {
          setIsInChatSearching(false);
        }
      };

      // Find initial "before"
      const newestInState = messages.length > 0 ? messages[0].created_at : null;
      
      // Wait a tick for safety or just call
      setTimeout(() => {
        crawlChat(q, currentChatId, !!activeGroup, newestInState);
      }, 0);

    } else {
      setIsInChatSearching(false);
      inChatSearchRef.current = { q, chatId: currentChatId, active: false };
    }
  };

  const handleAddContact = async (contactId: string) => {
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ contactId })
      });
      
      const res = await fetch('/api/contacts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const text = await res.text();
        const updatedContacts = text ? JSON.parse(text) : [];
        setContacts(updatedContacts);
        
        const activatedContact = updatedContacts.find((c: any) => c.id === contactId);
        if (activatedContact) {
          setActiveContact(activatedContact);
          setActiveGroup(null);
          window.history.pushState({ chatOpen: true }, '', '#chat');
        }
      } else {
        const errorBody = await res.text();
        console.error(`Failed to refresh contacts: ${res.status} ${errorBody}`);
      }
      setSearchQuery('');
      setIsSearching(false);
    } catch (err) {
      console.error('Failed to add contact:', err);
    }
  };

  const handleBlockContact = async (contactId: string) => {
    try {
      // Find or create blacklist circle
      let blacklistCircle = contactCircles.find(c => c.is_blacklist === 1);
      
      if (!blacklistCircle) {
        const res = await fetch('/api/contact-circles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: 'Blacklist',
            do_not_disturb: true,
            is_hidden: false,
            is_blacklist: true
          })
        });
        if (res.ok) {
          blacklistCircle = await res.json();
          fetchContactCircles();
        }
      }

      if (blacklistCircle) {
        await fetch(`/api/contact-circles/${blacklistCircle.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ contactId })
        });
        fetchContactCircles();
        
        // Remove from contacts if present
        await fetch(`/api/contacts/${contactId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchContacts();
        
        // Close chat if active
        if (activeContact?.id === contactId) {
          setActiveContact(null);
          window.history.pushState({ chatOpen: false }, '', '#');
        }
      }
    } catch (err) {
      console.error('Failed to block contact:', err);
    }
  };

  const handleGenerateInvite = useCallback(async () => {
    console.log('Generating invite...');
    const storedToken = safeLocalStorage.getItem('token');
    if (!storedToken) {
      console.error('No token found for invite generation');
      return;
    }
    try {
      const res = await fetch('/api/invites/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${storedToken}` }
      });
      
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch(e) {}
      
      if (!res.ok) {
        console.error("INVITE ERROR RESPONSE FROM SERVER:", text);
        
        if (data.error === 'EMAIL_NOT_VERIFIED' || res.status === 400 || res.status === 403) {
           throw new Error(t.modals.emailNotVerified || 'Please verify your email to invite users.');
        }

        throw new Error(data.error || `Server Error ${res.status}: ${text}`);
      }
      
      if (data.code) {
        const link = `${window.location.origin}/register?invite=${data.code}`;
        console.log('Invite generated:', link);
        setInviteCode(link);
        setLinkCopied(false);
        modals.setShowInviteModal(true);
        try {
          await navigator.clipboard.writeText(link);
          setLinkCopied(true);
        } catch (err) {
          console.error('Failed to copy link', err);
          setLinkCopied(false);
        }
      }
    } catch (err: any) {
      console.error('Failed to generate invite:', err);
      showAlert(err.message || t.common.error || 'Failed to generate invite');
    }
  }, [token, showAlert, t.common.error, modals]);

  const handleAvatarClick = (typeOrEvent: any = 'user', id?: string) => {
    // If it's a React event or any non-string, default to 'user'
    // This happens when called as an onClick handler in the Sidebar
    const isEvent = typeOrEvent && (typeof typeOrEvent === 'object' && ('nativeEvent' in typeOrEvent || 'target' in typeOrEvent));
    const resolvedType = (typeof typeOrEvent === 'string' && !isEvent) ? typeOrEvent : 'user';
    const resolvedId = (typeof typeOrEvent === 'string' && !isEvent) ? id : undefined;

    avatarTargetRef.current = { type: resolvedType as 'user' | 'group', id: resolvedId };
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setAvatarToCrop(reader.result as string);
      };
      reader.readAsDataURL(file);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    try {
      const target = avatarTargetRef.current;
      const endpoint = target.type === 'group' && target.id 
        ? `/api/groups/${target.id}/avatar` 
        : `/api/users/avatar`;
      
      const formData = new FormData();
      formData.append('avatar', croppedBlob, 'avatar.jpg');
        
      const res = await fetch(endpoint, {
        method: target.type === 'group' ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (!res.ok) {
        let errMsg = `Upload failed: ${res.status}`;
        try {
          const errText = await res.text();
          errMsg += ` - ${errText}`;
        } catch (e) {}
        throw new Error(errMsg);
      }
      
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Server returned HTML instead of JSON. The server might be restarting. Please try again.');
      }
      
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        console.error('Failed to parse JSON response:', text);
        throw parseErr;
      }
      
      if (data.avatarUrl) {
        if (target.type === 'group' && target.id) {
          setGroups(prev => prev.map(g => g.id === target.id ? { ...g, avatar_url: data.avatarUrl } : g));
          if (activeGroup?.id === target.id) {
            setActiveGroup(prev => prev ? { ...prev, avatar_url: data.avatarUrl } : null);
          }
        } else {
          const updatedUser = { ...user!, avatar_url: data.avatarUrl };
          setUser(updatedUser);
          safeLocalStorage.setItem('user', JSON.stringify(updatedUser));
        }
        showAlert(t.common.success);
      }
      setAvatarToCrop(null);
    } catch (err: any) {
      console.error('Failed to upload avatar', err);
      showAlert(`Ошибка при загрузке аватара: ${err.message}`);
    }
  };

  const handleReaction = (emojiData: any, overrideId?: string) => {
    const targetId = overrideId || reactionMessageId;
    if (!targetId || !socket) return;
    
    socket.emit('message:react', {
      messageId: targetId,
      emoji: emojiData.emoji || emojiData
    });
    
    setReactionMessageId(null);
  };

  const handleUpdateProfile = async (data: { firstName: string; lastName: string; email: string; phone: string }) => {
    const res = await fetch('/api/users/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const text = await res.text();
      let error: any = {};
      try { error = text ? JSON.parse(text) : {}; } catch (e) {}
      throw new Error(error.error || 'Failed to update profile');
    }
    const updatedUser = { ...user!, first_name: data.firstName, last_name: data.lastName, email: data.email, phone: data.phone };
    setUser(updatedUser);
    safeLocalStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const handleChangePassword = async (data: { oldPassword: string; newPassword: string }) => {
    let encryptedPrivateKeyData = null;
    const privateKeyJwk = safeLocalStorage.getItem('e2e_private_key');
    
    if (privateKeyJwk) {
      try {
        const privateKey = await importKey(privateKeyJwk, 'private');
        encryptedPrivateKeyData = await encryptPrivateKeyWithPassword(privateKey, data.newPassword);
      } catch (e) {
        console.error('Failed to re-encrypt private key with new password', e);
        throw new Error('Failed to secure private key with new password');
      }
    }

    const payload = {
      ...data,
      encryptedPrivateKey: encryptedPrivateKeyData ? JSON.stringify(encryptedPrivateKeyData) : undefined
    };

    const res = await fetch('/api/users/password', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      let error: any = {};
      try { error = text ? JSON.parse(text) : {}; } catch (e) {}
      throw new Error(error.error || 'Failed to change password');
    }
  };

  const handleRemoveContact = useCallback(async (contactId: string) => {
    showConfirm({
      message: t('common.removeContactConfirm') || 'Are you sure you want to remove this contact?',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/contacts/${contactId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            fetchContacts();
            fetchContactCircles();
            if (activeContact?.id === contactId) {
              setActiveContact(null);
            }
          }
        } catch (err) {
          console.error('Failed to remove contact', err);
        }
      }
    });
  }, [token, fetchContacts, fetchContactCircles, activeContact, showConfirm, t]);

  const handleLeaveGroup = useCallback(async (groupId: string) => {
    showConfirm({
      message: 'Вы уверены, что хотите покинуть группу?',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/groups/${groupId}/leave`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            fetchGroups();
            if (activeGroup?.id === groupId) {
              setActiveGroup(null);
            }
            if (socket) {
              socket.emit('leaveRoom', `group_${groupId}`);
              socket.emit('roomEvent', { roomId: `group_${groupId}`, type: 'memberLeft' });
            }
          }
        } catch (err) {
          console.error('Failed to leave group:', err);
        }
      }
    });
  }, [token, fetchGroups, activeGroup, socket, showConfirm]);

  const handleClearChat = useCallback(async (contactId: string, isGroup: boolean = false) => {
    showConfirm({
      message: t('common.clearChatConfirm') || 'Are you sure you want to clear this chat?',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/messages/${contactId}/clear?isGroup=${isGroup}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            setMessages(prev => prev.filter(msg => 
              isGroup ? msg.group_id !== contactId : 
              (msg.sender_id !== contactId && msg.receiver_id !== contactId)
            ));
          }
        } catch (err) {
          console.error('Failed to clear chat:', err);
        }
      }
    });
  }, [token, showConfirm]);

  const handleMoveContactToCircle = async (contactId: string, toCircleType: 'normal' | 'dnd' | 'blacklist') => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/circle`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ circle_type: toCircleType })
      });
      if (res.ok) {
        fetchContacts();
      }
    } catch (error) {
      console.error('Error moving contact to circle type:', error);
    }
  };

  const handleAddUserToGroup = async (userId: string, groupId: string, targetUser?: User) => {
    try {
      const group = groups.find(g => g.id === groupId);
      if (group && group.encrypted_keys && targetUser && !targetUser.public_key) {
        alert('Cannot add user: they need to log in to generate encryption keys first.');
        return;
      }

      let encryptedKeysForNewUser: Record<string, string> | null = null;
      
      if (group && group.encrypted_keys && targetUser?.public_key) {
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

      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          userId,
          encrypted_keys: encryptedKeysForNewUser
        })
      });
      if (response.ok) {
        modals.setShowAddToGroupModal(false);
      } else {
        const data = await response.json();
        showAlert(data.error || 'Failed to add user to group');
      }
    } catch (err) {
      console.error('Error adding user to group:', err);
    }
  };

  const handleContactClick = (contact: User) => {
    if (appView === 'feed') setAppView('messages');
    if (activeContact?.id === contact.id) return; // Prevent re-opening the same chat
    if (!activeContact && !activeGroup) {
      window.history.pushState({ chatOpen: true }, '', '#chat');
    }
    setMessages([]); // Clear messages synchronously to prevent stale renders
    setActiveContact(contact);
    setActiveGroup(null);
    setReplyingTo(null);
  };

  const handleBackClick = () => {
    if (window.history.state?.chatOpen) {
      window.history.back();
    } else {
      setActiveContact(null);
      setActiveGroup(null);
    }
  };

  useEffect(() => {
    setActiveContact(prev => {
      if (!prev) return prev;
      const updatedContact = contacts.find(c => c.id === prev.id);
      if (updatedContact && JSON.stringify(updatedContact) !== JSON.stringify(prev)) {
        return updatedContact;
      }
      return prev;
    });
  }, [contacts]);

  useEffect(() => {
    const handlePopState = () => {
      if ((window as any).__ignoreChatPopstate) return;
      const hash = window.location.hash;
      if (hash.includes('chat') || hash.includes('viewer')) {
        return; // Retain chat view if history goes back to chat or viewer
      }
      setActiveContact(null);
      setActiveGroup(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return {
    user,
    token,
    socket,
    contacts,
    groups,
    contactCircles,
    feedPosts,
    setFeedPosts,
    fetchFeedPosts,
    hasUnreadFeed,
    setHasUnreadFeed,
    unlockedCircles,
    activeContact,
    activeGroup,
    messages,
    setMessages,
    replyingTo,
    editingMessage,
    searchQuery,
    searchResults,
    messageSearchResults,
    isSearching,
    isSearchOpen,
    setIsSearchOpen,
    highlightedMessageId,
    setHighlightedMessageId,
    handleMessageResultClick,
    inChatSearchQuery,
    isInChatSearching,
    inviteCode,
    ...modals,
    selectedMessageId,
    linkCopied,
    reactionMessageId,
    showEmojiPicker,
    avatarToCrop,
    typingUsers,
    messagesEndRef,
    avatarInputRef,
    chatFileInputRef,
    setContacts,
    setGroups,
    setContactCircles,
    setUnlockedCircles,
    setActiveContact,
    setActiveGroup,
    setReplyingTo,
    setEditingMessage,
    setSearchQuery,
    setSearchResults,
    setIsSearching,
    setInChatSearchQuery,
    setSelectedMessageId,
    setReactionMessageId,
    setShowEmojiPicker,
    setAvatarToCrop,
    handleSearch,
    handleInChatSearch,
    handleAddContact,
    handleBlockContact,
    handleSendMessage,
    handleEditMessage,
    handleDeleteMessage,
    handleForward,
    handleGenerateInvite,
    handleAvatarClick,
    handleAvatarChange,
    handleCropComplete,
    handleReaction,
    handleUpdateProfile,
    handleChangePassword,
    handleRemoveContact,
    handleLeaveGroup,
    handleClearChat,
    handleMoveContactToCircle,
    handleAddUserToGroup,
    handleContactClick,
    appView,
    setAppView,
    selectedFeedUserId,
    setSelectedFeedUserId,
    sidebarView,
    setSidebarView,
    handleBackClick,
    handleLogout,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMore,
    scrollPositionsRef,
    reminders,
    pinnedMessages,
    handleSetReminder,
    handleEditReminder,
    handleDeleteReminder,
    handleSnoozeReminder,
    handleDismissReminder,
    handlePinMessage,
    handleUnpinMessage
  };
}
