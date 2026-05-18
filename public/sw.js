/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

function base64ToArrayBufferSW(base64) {
  const binary_string = self.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

function getPrivateKeyFromIDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chat_files_db', 2);
    request.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('keys')) {
        resolve(null);
        return;
      }
      const tx = db.transaction('keys', 'readonly');
      const store = tx.objectStore('keys');
      const getReq = store.get('e2e_private_key');
      getReq.onsuccess = () => resolve(getReq.result ? getReq.result.value : null);
      getReq.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

async function handlePushEvent(event) {
  const data = event.data.json();
  
  if (data.type === 'cancel_call') {
    const notifications = await self.registration.getNotifications({ tag: 'incoming_call_' + data.userId });
    for (const n of notifications) {
      n.close();
    }
    return null;
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    data: { 
      url: data.url || '/',
      type: data.type || 'message',
      userId: data.userId || null
    },
    vibrate: data.requireInteraction ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
    tag: data.tag || undefined,
    actions: data.actions || []
  };

  try {
    if (data.encryptedContent && data.encryptedAesKey && data.iv) {
      const privateKeyJwkStr = await getPrivateKeyFromIDB();
      if (privateKeyJwkStr) {
        const jwk = JSON.parse(self.atob(privateKeyJwkStr));
        const rsaKey = await crypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['decrypt']
        );
        
        const encryptedAesKeyBuffer = base64ToArrayBufferSW(data.encryptedAesKey);
        const aesKeyBuffer = await crypto.subtle.decrypt(
          { name: 'RSA-OAEP' },
          rsaKey,
          encryptedAesKeyBuffer
        );
        
        const aesKey = await crypto.subtle.importKey(
          'raw',
          aesKeyBuffer,
          { name: 'AES-GCM' },
          true,
          ['decrypt']
        );
        
        const encryptedContentBuffer = base64ToArrayBufferSW(data.encryptedContent);
        
        let textIvBase64 = data.iv;
        if (data.textIv) { // check if specific textIv is passed
           textIvBase64 = data.textIv;
        }
        
        const ivBuffer = base64ToArrayBufferSW(textIvBase64);
        
        const decryptedContentBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
          aesKey,
          encryptedContentBuffer
        );
        
        const decoder = new TextDecoder();
        let decryptedText = decoder.decode(decryptedContentBuffer);
        
        // Try parsing as JSON in case it's a file metadata object
        try {
           const parsed = JSON.parse(decryptedText);
           if (parsed && typeof parsed === 'object') {
              if (parsed.type === 'file') {
                 decryptedText = parsed.text ? "🖼️ " + parsed.text : "Файл 📎";
              }
           }
        } catch(e) {
           // Ignore parse errors as it might be plain text
        }
        
        if (decryptedText.length > 50) {
           decryptedText = decryptedText.substring(0, 50) + '...';
        }
        options.body = decryptedText;
      } else {
        options.body = "ОШИБКА: Ключ в IDB не найден";
      }
    } else {
      console.log("No encrypted content payload present");
    }
  } catch (err) {
    console.error("SW decryption failed:", err);
    options.body = "SW FAIL: " + err.message + ' / ' + err.name;
  }

  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (let i = 0; i < clientList.length; i++) {
    const client = clientList[i];
    if (client.focused && client.visibilityState === 'visible') {
      return null;
    }
  }
  
  return self.registration.showNotification(data.title, options);
}

async function saveSharedFiles(files) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('shared_files_db', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { autoIncrement: true });
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      store.clear(); // Clear previous shared files
      for (const file of files) {
        store.add(file);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      let redirectUrl = '/?shared=true';
      try {
        const formData = await event.request.formData();
        const files = formData.getAll('files');
        const text = formData.get('text');
        const title = formData.get('title');
        const shareUrl = formData.get('url');
        
        let params = new URLSearchParams();
        if (text) params.append('text', text.toString());
        if (title) params.append('title', title.toString());
        if (shareUrl) params.append('url', shareUrl.toString());
        
        if (params.toString()) {
          redirectUrl += '&' + params.toString();
        }
        
        if (files && files.length > 0 && files[0].size > 0) {
          await saveSharedFiles(files);
        }
      } catch (err) {
        console.error('Error handling share target POST', err);
      }
      return Response.redirect(redirectUrl, 303);
    })());
  }
});

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      // Use waitUntil with our async handler
      event.waitUntil(handlePushEvent(event));
    } catch(err) {
      console.error('Error in push listener', err);
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification Clicked. Action:', event.action);
  event.notification.close();
  
  const action = (event.action || '').toLowerCase();
  const notificationData = event.notification.data || {};
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      const urlToOpen = new URL(notificationData.url || '/', self.location.origin).href;
      console.log('[SW] notificationclick: action="' + action + '", urlToOpen="' + urlToOpen + '"');
      
      // Separate action handling from default behavior
      if (action === 'reject') {
        console.log('[SW] Reject Action Detected.');
        return handleRejection(clientList, urlToOpen);
      } else {
        console.log('[SW] Default (Body Click or Answer Click) Detected.');
        return handleNavigation(clientList, urlToOpen);
      }
    })
  );
});

function handleNavigation(clientList, url) {
  const urlToOpen = new URL(url, self.location.origin).href;
  
  if (clientList.length > 0) {
    for (let i = 0; i < clientList.length; i++) {
      const client = clientList[i];
      if (client.url.startsWith(self.location.origin)) {
        console.log('[SW] Navigator: Posting PUSH_NAVIGATE to existing client:', client.id);
        client.postMessage({ type: 'PUSH_NAVIGATE', url: urlToOpen });
        if ('focus' in client) return client.focus();
        return;
      }
    }
  }
  
  if (clients.openWindow) {
    console.log('[SW] Navigator: Opening new window for URL:', urlToOpen);
    return clients.openWindow(urlToOpen);
  }
}

function handleRejection(clientList, url) {
  const urlToOpen = new URL(url, self.location.origin);
  const chatId = urlToOpen.searchParams.get('chat');
  
  if (clientList.length > 0) {
    for (let i = 0; i < clientList.length; i++) {
      const client = clientList[i];
      if (client.url.startsWith(self.location.origin)) {
        console.log('[SW] Rejector: Posting PUSH_REJECT_CALL to client:', client.id);
        client.postMessage({ type: 'PUSH_REJECT_CALL', targetId: chatId });
        if ('focus' in client) return client.focus();
        return;
      }
    }
  }
  
  // If no client, open in background with reject flag
  const finalRejectUrl = new URL(url, self.location.origin);
  finalRejectUrl.searchParams.set('reject_call', 'true');
  console.log('[SW] Rejector: Opening new window with reject_call=true');
  if (clients.openWindow) {
    return clients.openWindow(finalRejectUrl.href);
  }
}
