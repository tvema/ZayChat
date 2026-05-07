export const initDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    
    let idb: IDBFactory | undefined;
    try {
      if (!('indexedDB' in window)) {
        resolve(null);
        return;
      }
      idb = window.indexedDB;
    } catch (e) {
      console.warn('IndexedDB access blocked', e);
      resolve(null);
      return;
    }
    
    if (!idb) {
      resolve(null);
      return;
    }
    
    try {
      const request = idb.open('chat_files_db', 2); // bumped version
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('IndexedDB error', request.error);
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB init failed in this environment', e);
      resolve(null);
    }
  });
};

export const saveFile = async (id: string, blob: Blob) => {
  const db = await initDB();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    store.put({ id, blob });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

export const getFile = async (id: string): Promise<Blob | null> => {
  const db = await initDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
    request.onerror = () => reject(tx.error);
  });
};

export const clearAllFiles = async (): Promise<boolean> => {
  const db = await initDB();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(tx.error);
  });
};

export const saveKeyToIDB = async (id: string, value: string) => {
  const db = await initDB();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    const store = tx.objectStore('keys');
    store.put({ id, value });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

export const getKeyFromIDB = async (id: string): Promise<string | null> => {
  const db = await initDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readonly');
    const store = tx.objectStore('keys');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(tx.error);
  });
};
