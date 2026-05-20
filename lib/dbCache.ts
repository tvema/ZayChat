import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Message } from '@/types/chat';

interface ChatDBSchema extends DBSchema {
  chat_cache: {
    key: string;
    value: {
      chatId: string;
      messages: Message[];
      updatedAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<ChatDBSchema>> | null = null;

function getDb() {
  if (typeof window === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB<ChatDBSchema>('zstate-chat-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('chat_cache')) {
          db.createObjectStore('chat_cache', { keyPath: 'chatId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedMessages(chatId: string): Promise<Message[] | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const data = await db.get('chat_cache', chatId);
    return data ? data.messages : null;
  } catch (error) {
    console.error('Failed to get cached messages:', error);
    return null;
  }
}

export async function setCachedMessages(chatId: string, messages: Message[]) {
  try {
    const db = await getDb();
    if (!db) return;
    
    // Cache the encrypted versions so plaintext is not kept in IndexedDB
    const encryptedMessagesToCache = messages.map(msg => {
      if (msg.encrypted_content) {
        return {
          ...msg,
          content: msg.encrypted_content
        };
      }
      return msg;
    });

    await db.put('chat_cache', {
      chatId,
      messages: encryptedMessagesToCache,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error('Failed to cache messages:', error);
  }
}

export async function clearCache() {
  try {
    const db = await getDb();
    if (!db) return;
    await db.clear('chat_cache');
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}
