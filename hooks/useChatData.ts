import { safeLocalStorage } from '@/lib/safeStorage';
import { useState, useCallback, useRef } from 'react';
import { Reminder, PinnedMessage, Group, Message } from '@/types/chat';
import { decryptMessageIfNeeded } from '@/lib/cryptoUtils';

export function useChatData(
  token: string | null,
  user: any,
  groups: Group[],
  activeContactId: string | undefined,
  activeGroupId: string | undefined
) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const userRef = useRef(user);
  const groupsRef = useRef(groups);

  userRef.current = user;
  groupsRef.current = groups;

  const fetchReminders = useCallback(async (retryCount = 0) => {
    if (!token) return;
    try {
      const res = await fetch('/api/reminders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const text = await res.text();
        const data = text ? JSON.parse(text) : [];
        const decryptedReminders = await Promise.all(data.map(async (r: any) => {
          if (r.message) {
            r.message = await decryptMessageIfNeeded(r.message, userRef.current?.id, groupsRef.current);
          }
          return r;
        }));
        setReminders(decryptedReminders);
      } else {
        if (res.status === 401) {
          safeLocalStorage.clear();
          window.location.href = '/login?revoked=true';
          return;
        }
        if (retryCount < 3) {
          setTimeout(() => fetchReminders(retryCount + 1), 1000 * (retryCount + 1));
        }
      }
    } catch (err) {
      console.error('Failed to fetch reminders:', err);
      if (retryCount < 3) {
        setTimeout(() => fetchReminders(retryCount + 1), 1000 * (retryCount + 1));
      }
    }
  }, [token]);

  const fetchPinnedMessages = useCallback(async (chatId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/chats/${chatId}/pinned`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const text = await res.text();
        const data = text ? JSON.parse(text) : [];
        const decryptedPinned = await Promise.all(data.map(async (msg: any) => {
          if (msg.message) {
            msg.message = await decryptMessageIfNeeded(msg.message, userRef.current?.id, groupsRef.current);
          }
          return msg;
        }));
        setPinnedMessages(decryptedPinned as any);
      }
    } catch (err) {
      console.error('Failed to fetch pinned messages:', err);
    }
  }, [token]);

  const handleSetReminder = async (messageId: string | null, remindAt: string, comment?: string, recurrence?: string, targetUserIds?: string[]) => {
    if (!token) return;
    try {
      const chatId = activeGroupId || activeContactId;
      if (!chatId) return;

      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          remind_at: remindAt,
          comment,
          recurrence,
          target_user_ids: targetUserIds
        })
      });

      if (res.ok) {
        const newReminder = await res.json();
        if (newReminder.message) {
          newReminder.message = await decryptMessageIfNeeded(newReminder.message, userRef.current?.id, groupsRef.current);
        }
        setReminders(prev => [...prev, newReminder]);
      }
    } catch (err) {
      console.error('Failed to set reminder:', err);
    }
  };

  const handleDeleteReminder = async (reminderId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/reminders/${reminderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setReminders(prev => prev.filter(r => r.id !== reminderId));
      }
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    }
  };

  const handleEditReminder = async (reminderId: string, remindAt: string, comment?: string, recurrence?: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/reminders/${reminderId}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ remind_at: remindAt, comment, recurrence })
      });

      if (res.ok) {
        const updatedReminder = await res.json();
        if (updatedReminder.message) {
          updatedReminder.message = await decryptMessageIfNeeded(updatedReminder.message, userRef.current?.id, groupsRef.current);
        }
        setReminders(prev => prev.map(r => r.id === reminderId ? updatedReminder : r));
      }
    } catch (err) {
      console.error('Failed to edit reminder:', err);
    }
  };

  const handleSnoozeReminder = async (reminderId: string, minutes: number) => {
    if (!token) return;
    try {
      const d = new Date();
      d.setMinutes(d.getMinutes() + minutes);
      const remindAt = d.toISOString();

      const res = await fetch(`/api/reminders/${reminderId}/snooze`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ remind_at: remindAt })
      });

      if (res.ok) {
        setReminders(prev => prev.map(r => 
          r.id === reminderId ? { ...r, remind_at: remindAt, is_dismissed: false } : r
        ));
      }
    } catch (err) {
      console.error('Failed to snooze reminder:', err);
    }
  };

  const handleDismissReminder = async (reminderId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/reminders/${reminderId}/dismiss`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setReminders(prev => prev.map(r => 
          r.id === reminderId ? { ...r, is_dismissed: true } : r
        ));
      }
    } catch (err) {
      console.error('Failed to dismiss reminder:', err);
    }
  };

  const handlePinMessage = async (messageId: string, snippet?: string) => {
    if (!token) return;
    try {
      const chatId = activeGroupId || activeContactId;
      if (!chatId) return;

      const res = await fetch(`/api/chats/${chatId}/pinned`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message_id: messageId, snippet })
      });

      if (res.ok) {
        fetchPinnedMessages(chatId);
      }
    } catch (err) {
      console.error('Failed to pin message:', err);
    }
  };

  const handleUnpinMessage = async (messageId: string, snippet?: string) => {
    if (!token) return;
    try {
      const chatId = activeGroupId || activeContactId;
      if (!chatId) return;

      const res = await fetch(`/api/chats/${chatId}/pinned/${messageId}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ snippet })
      });

      if (res.ok) {
        setPinnedMessages(prev => prev.filter(p => p.message_id !== messageId));
      }
    } catch (err) {
      console.error('Failed to unpin message:', err);
    }
  };

  return {
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
  };
}
