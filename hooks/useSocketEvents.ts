import { safeLocalStorage } from '@/lib/safeStorage';
import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { User, Message, Group, Reaction } from '@/types/chat';
import { decryptMessageIfNeeded } from '@/lib/cryptoUtils';

interface UseSocketEventsProps {
  socket: Socket | null;
  t: (key: string) => any;
  userRef: React.MutableRefObject<User | null>;
  activeContactIdRef: React.MutableRefObject<string | null>;
  activeGroupIdRef: React.MutableRefObject<string | null>;
  groupsRef: React.MutableRefObject<Group[]>;
  contactsRef: React.MutableRefObject<User[]>;
  contactCirclesRef: React.MutableRefObject<any[]>;
  appViewRef: React.MutableRefObject<'messages' | 'feed'>;
  setHasUnreadFeed: React.Dispatch<React.SetStateAction<boolean>>;
  typingTimeoutsRef: React.MutableRefObject<Record<string, NodeJS.Timeout>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setContacts: React.Dispatch<React.SetStateAction<User[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setActiveGroup: React.Dispatch<React.SetStateAction<Group | null>>;
  setSearchResults: React.Dispatch<React.SetStateAction<User[]>>;
  setActiveContact: React.Dispatch<React.SetStateAction<User | null>>;
  setTypingUsers: React.Dispatch<React.SetStateAction<Record<string, { userId: string, username: string }[]>>>;
  fetchContacts: () => void;
  fetchGroups: () => void;
  playMessageSound: (isIncoming: boolean) => void;
  fetchPinnedMessages: (chatId: string) => void;
  fetchReminders: () => void;
}

export function useSocketEvents({
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
}: UseSocketEventsProps) {
  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => {
      fetchContacts();
      fetchGroups();
      fetchReminders?.();
      
      const currentCId = activeContactIdRef.current;
      const currentGId = activeGroupIdRef.current;
      if (currentCId || currentGId) {
        // Trigger a fetch for the active chat messages
        const id = currentCId || currentGId;
        const isGroup = !!currentGId;
        fetch(`/api/messages/${id}?isGroup=${isGroup}&limit=50`, {
          headers: { 'Authorization': `Bearer ${safeLocalStorage.getItem('token')}` }
        })
        .then(res => res.json())
        .then(async (data) => {
          if (data && data.length > 0) {
            const decryptedMessages = await Promise.all(data.map((msg: Message) => decryptMessageIfNeeded(msg, userRef.current?.id, groupsRef.current)));
            
            setMessages(prev => {
              const allMap = new Map<string, Message>();
              prev.forEach(m => allMap.set(m.id, m));
              decryptedMessages.forEach(m => allMap.set(m.id, m)); // overwrite stale/update statuses
              return Array.from(allMap.values()).sort((a, b) => {
                const timeA = new Date(a.created_at.includes('T') ? a.created_at : a.created_at.replace(' ', 'T') + 'Z').getTime();
                const timeB = new Date(b.created_at.includes('T') ? b.created_at : b.created_at.replace(' ', 'T') + 'Z').getTime();
                return timeA - timeB;
              });
            });
            
            if (document.visibilityState === 'visible') {
              if (currentCId) {
                socket.emit('contact:read', { contactId: currentCId });
                setContacts(prev => prev.map(c => c.id === currentCId ? { ...c, unread_count: 0 } : c));
              } else if (currentGId) {
                socket.emit('group:read', { groupId: currentGId });
                setGroups(prev => prev.map(g => g.id === currentGId ? { ...g, unread_count: 0 } : g));
              }
            }
          }
        })
        .catch(console.error);
      }
    });

    socket.on('auth:session_revoked', (data) => {
      const storedToken = safeLocalStorage.getItem('token');
      if (storedToken === data.token) {
        safeLocalStorage.clear();
        window.location.href = '/login?revoked=true';
      }
    });

    socket.on('pinned_updated', (data) => {
       const activeCId = activeContactIdRef.current;
       const activeGId = activeGroupIdRef.current;
       if (data.chatId === activeCId || data.chatId === activeGId) {
         fetchPinnedMessages?.(data.chatId);
       }
    });

    socket.on('reminders_updated', () => {
      fetchReminders?.();
    });

    socket.on('message:edited', async (data) => {
      const decryptedMsg = await decryptMessageIfNeeded({ id: data.messageId, content: data.content, encryption_data: data.encryption_data, group_id: data.groupId } as any, userRef.current?.id, groupsRef.current);
      setMessages(prev => prev.map(m => 
        m.id === data.messageId ? { ...m, content: decryptedMsg.content, is_edited: true, encryption_data: data.encryption_data } : m
      ));
    });

    socket.on('message:deleted', (data) => {
      setMessages(prev => prev.map(m => 
        m.id === data.messageId ? { ...m, content: 'сообщение удалено', is_deleted: true, encryption_data: null } : m
      ));
    });

    socket.on('message:new', async (message: Message) => {
      const currentUser = userRef.current;
      
      if (currentUser && message.sender_id !== currentUser.id) {
        const senderCircles = contactCirclesRef.current.filter(c => c.members.includes(message.sender_id));
        const isBlacklist = senderCircles.some(c => c.is_blacklist === 1);
        if (isBlacklist) {
          return;
        }
      }

      const decryptedMsg = await decryptMessageIfNeeded(message, currentUser?.id, groupsRef.current);

      const activeContactId = activeContactIdRef.current;
      const activeGroupId = activeGroupIdRef.current;

      const isCurrentDirectChat = activeContactId && !decryptedMsg.group_id && (decryptedMsg.sender_id === activeContactId || decryptedMsg.receiver_id === activeContactId);
      const isCurrentGroupChat = activeGroupId && decryptedMsg.group_id === activeGroupId;

      if (isCurrentDirectChat || isCurrentGroupChat) {
        setMessages(prev => {
          if (prev.find(m => m.id === decryptedMsg.id)) return prev;
          return [...prev, decryptedMsg];
        });
      }

      // Update contacts/groups last_message_timestamp and unread_count
      const targetId = decryptedMsg.group_id || (decryptedMsg.sender_id === currentUser?.id ? decryptedMsg.receiver_id : decryptedMsg.sender_id);
      
      if (targetId) {
        // Cache this new message so it's instantly available without waiting for fetch when user opens chat
        import('@/lib/dbCache').then(({ getCachedMessages, setCachedMessages }) => {
          getCachedMessages(targetId).then(cached => {
            if (cached) {
              if (!cached.find((m: Message) => m.id === decryptedMsg.id)) {
                // Determine order by checking existing cache. The cache stores oldest-first (newest at the end), 
                // just like UI renders it. So we append it.
                setCachedMessages(targetId, [...cached, decryptedMsg]);
              }
            } else {
              setCachedMessages(targetId, [decryptedMsg]);
            }
          });
        });
      }

      if (!decryptedMsg.group_id) {
        const targetId = decryptedMsg.sender_id === currentUser?.id ? decryptedMsg.receiver_id : decryptedMsg.sender_id;
        setContacts(prev => {
          const exists = prev.find(c => c.id === targetId);
          if (!exists) {
            // If the contact doesn't exist in our list, fetch contacts to get the new one
            setTimeout(() => fetchContacts(), 100);
            return prev;
          }
          return prev.map(c => 
            c.id === targetId ? { 
              ...c, 
              last_message_timestamp: decryptedMsg.created_at,
              unread_count: (!isCurrentDirectChat && decryptedMsg.sender_id !== currentUser?.id) ? (c.unread_count || 0) + 1 : c.unread_count
            } : c
          );
        });
        if (decryptedMsg.sender_id !== currentUser?.id) {
          socket.emit('message:delivered', { messageIds: [decryptedMsg.id], senderId: decryptedMsg.sender_id });
        }
      } else {
        setGroups(prev => prev.map(g => 
          g.id === decryptedMsg.group_id ? { 
            ...g, 
            last_message_timestamp: decryptedMsg.created_at,
            unread_count: (!isCurrentGroupChat && decryptedMsg.sender_id !== currentUser?.id) ? (g.unread_count || 0) + 1 : g.unread_count
          } : g
        ));
      }

      if (currentUser && decryptedMsg.sender_id !== currentUser.id) {
        const senderCircles = contactCirclesRef.current.filter(c => c.members.includes(decryptedMsg.sender_id));
        const isDoNotDisturb = senderCircles.some(c => c.do_not_disturb === 1);

        if (!isDoNotDisturb) {
          playMessageSound(true);
        }

        if (isCurrentDirectChat && !document.hidden) {
          socket.emit('message:read', { messageIds: [decryptedMsg.id], senderId: decryptedMsg.sender_id });
        } else if (isCurrentGroupChat && !document.hidden) {
          socket.emit('group:read', { groupId: decryptedMsg.group_id });
        }
      }
    });

    socket.on('message:status_update', (data: { messageIds: string[], status: 'delivered' | 'read' }) => {
      setMessages(prev => prev.map(msg => {
        if (data.messageIds.includes(msg.id)) {
          // Do not downgrade from read to delivered
          if (msg.status === 'read' && data.status === 'delivered') {
            return msg;
          }
          return { ...msg, status: data.status };
        }
        return msg;
      }));
    });

    socket.on('reaction:new', (reaction: Reaction & { message_id: string }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === reaction.message_id) {
          if (msg.reactions.find(r => r.user_id === reaction.user_id && r.emoji === reaction.emoji)) {
            return msg;
          }
          return { ...msg, reactions: [...msg.reactions, reaction] };
        }
        return msg;
      }));
    });

    socket.on('reaction:update', (data: { message_id: string, user_id: string, emoji: string, removed: boolean }) => {
      if (data.removed) {
        setMessages(prev => prev.map(msg => {
          if (msg.id === data.message_id) {
            return {
              ...msg,
              reactions: msg.reactions.filter(r => !(r.user_id === data.user_id && r.emoji === data.emoji))
            };
          }
          return msg;
        }));
      }
    });

    socket.on('contact:new', (newContact: User) => {
      setContacts(prev => {
        if (prev.find(c => c.id === newContact.id)) return prev;
        return [...prev, { ...newContact, is_online: true }];
      });
      fetchContacts();
    });

    socket.on('contact:updated', () => {
      fetchContacts();
    });

    socket.on('group:new', (newGroup: Group) => {
      setGroups(prev => {
        if (prev.find(g => g.id === newGroup.id)) return prev;
        return [...prev, newGroup];
      });
      socket.emit('group:join', { groupId: newGroup.id });
    });

    socket.on('group:removed', (groupId: string) => {
      setGroups(prev => prev.filter(g => g.id !== groupId));
      setActiveGroup(prev => {
        if (prev?.id === groupId) {
          window.history.pushState({ chatOpen: false }, '', '#');
          return null;
        }
        return prev;
      });
    });

    socket.on('group:updated', (groupId: string) => {
      fetchGroups();
    });

    socket.on('group:deleted', (groupId: string) => {
      setGroups(prev => prev.filter(g => g.id !== groupId));
      setActiveGroup(prev => {
        if (prev?.id === groupId) {
          window.history.pushState({ chatOpen: false }, '', '#');
          return null;
        }
        return prev;
      });
    });

    socket.on('user:online', (data: { userId: string }) => {
      setContacts(prev => prev.map(c => 
        c.id === data.userId ? { ...c, is_online: true } : c
      ));
      setSearchResults(prev => prev.map(c => 
        c.id === data.userId ? { ...c, is_online: true } : c
      ));
      setActiveContact(prev => {
        if (prev?.id === data.userId) {
          return { ...prev, is_online: true };
        }
        return prev;
      });
    });

    socket.on('user:offline', (data: { userId: string, lastSeen: string }) => {
      setContacts(prev => prev.map(c => 
        c.id === data.userId ? { ...c, is_online: false, last_seen: data.lastSeen } : c
      ));
      setSearchResults(prev => prev.map(c => 
        c.id === data.userId ? { ...c, is_online: false, last_seen: data.lastSeen } : c
      ));
      setActiveContact(prev => {
        if (prev?.id === data.userId) {
          return { ...prev, is_online: false, last_seen: data.lastSeen };
        }
        return prev;
      });
    });

    socket.on('typing:start', (data: { userId: string, username: string, chatId: string }) => {
      setTypingUsers(prev => {
        const currentTyping = prev[data.chatId] || [];
        if (!currentTyping.find(u => u.userId === data.userId)) {
          return {
            ...prev,
            [data.chatId]: [...currentTyping, { userId: data.userId, username: data.username }]
          };
        }
        return prev;
      });

      const timeoutKey = `${data.chatId}-${data.userId}`;
      if (typingTimeoutsRef.current[timeoutKey]) {
        clearTimeout(typingTimeoutsRef.current[timeoutKey]);
      }
      typingTimeoutsRef.current[timeoutKey] = setTimeout(() => {
        setTypingUsers(prev => {
          const currentTyping = prev[data.chatId] || [];
          const newTyping = currentTyping.filter(u => u.userId !== data.userId);
          if (newTyping.length === currentTyping.length) return prev;
          return {
            ...prev,
            [data.chatId]: newTyping
          };
        });
        delete typingTimeoutsRef.current[timeoutKey];
      }, 3000);
    });

    socket.on('typing:stop', (data: { userId: string, chatId: string }) => {
      const timeoutKey = `${data.chatId}-${data.userId}`;
      if (typingTimeoutsRef.current[timeoutKey]) {
        clearTimeout(typingTimeoutsRef.current[timeoutKey]);
        delete typingTimeoutsRef.current[timeoutKey];
      }
      
      setTypingUsers(prev => {
        const currentTyping = prev[data.chatId] || [];
        const newTyping = currentTyping.filter(u => u.userId !== data.userId);
        if (newTyping.length === currentTyping.length) return prev;
        return {
          ...prev,
          [data.chatId]: newTyping
        };
      });
    });

    socket.on('feed:new_post', (post: any) => {
      if (post.user_id !== userRef.current?.id) {
        if (appViewRef.current !== 'feed') {
          setHasUnreadFeed(true);
        }
      }
    });

    socket.on('webrtc:call_request', (data: { requesterId: string, audioOnly?: boolean }) => {
      // Call requests are handled by the server-side push notification if the user is not visible,
      // and by the CallOverlay UI if the user is currently in the app.
      // No need for redundant local notifications here.
    });

    socket.on('webrtc:call_end', (data) => {
      // Clear call notification if any
      if ('serviceWorker' in navigator && (navigator as any).serviceWorker.ready) {
        (navigator as any).serviceWorker.ready.then((reg: ServiceWorkerRegistration) => {
          reg.getNotifications({ tag: 'incoming_call_' + data.enderId }).then(notifications => {
            notifications.forEach(n => n.close());
          });
        });
      }
    });

    return () => {
      socket.off('auth:session_revoked');
      socket.off('message:edited');
      socket.off('message:deleted');
      socket.off('message:new');
      socket.off('message:status_update');
      socket.off('reaction:new');
      socket.off('reaction:update');
      socket.off('contact:new');
      socket.off('contact:updated');
      socket.off('group:new');
      socket.off('group:removed');
      socket.off('group:updated');
      socket.off('group:deleted');
      socket.off('user:online');
      socket.off('user:offline');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('feed:new_post');
      
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
    };
  }, [
    socket,
    playMessageSound,
    activeContactIdRef,
    activeGroupIdRef,
    contactCirclesRef,
    contactsRef,
    fetchContacts,
    fetchGroups,
    groupsRef,
    setActiveContact,
    setActiveGroup,
    setContacts,
    setGroups,
    setMessages,
    setSearchResults,
    setTypingUsers,
    typingTimeoutsRef,
    userRef,
    t
  ]);

  useEffect(() => {
    if (!socket) return;

    const handleVisibilityChange = () => {
      socket.emit('user:visibility', { visible: document.visibilityState === 'visible' });
    };

    // Initial report
    handleVisibilityChange();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket]);
}
