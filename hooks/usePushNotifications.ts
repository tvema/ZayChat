import { useEffect, useState, useCallback } from 'react';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export function usePushNotifications(token: string | null) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }
      
      // Check current subscription status
      const checkSubscription = async () => {
        try {
          if ('serviceWorker' in navigator && 'PushManager' in window) {
            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();
            
            if (subscription && token) {
              // Verify if the subscription key matches server's current key
              try {
                const res = await fetch('/api/push/vapid-public-key');
                if (res.ok) {
                  const { publicKey } = await res.json();
                  const serverKey = urlBase64ToUint8Array(publicKey);
                  const subKey = new Uint8Array(subscription.options.applicationServerKey!);
                  
                  const mismatch = serverKey.length !== subKey.length || serverKey.some((v, i) => v !== subKey[i]);
                  
                  if (mismatch) {
                    console.warn('VAPID key mismatch detected on load. Re-subscribing...');
                    await subscription.unsubscribe();
                    subscription = await registration.pushManager.subscribe({
                      userVisibleOnly: true,
                      applicationServerKey: serverKey
                    });
                  }
                  // ALWAYS update on server so if user changed (logout/login), it's linked correctly
                  await fetch('/api/push/subscribe', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(subscription)
                  });
                }
              } catch (err) {
                console.error('Failed to verify push subscription key:', err);
              }
            }
            
            setIsSubscribed(!!subscription);
          }
        } catch (e) {
          console.warn('Failed to check push subscription:', e);
        }
      };
      
      checkSubscription();
    }
  }, [token]);

  const subscribeToPush = useCallback(async (requestIfDefault = false) => {
    if (!token) return;
    
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications are not supported by the browser.');
      return;
    }

    try {
      let currentPermission = Notification.permission;
      
      if (currentPermission === 'default' && !requestIfDefault) {
         return; // Don't annoy the user automatically unless specified
      }

      // We only request permission if it's default
      if (currentPermission === 'default') {
        const permissionResult = await Notification.requestPermission();
        currentPermission = permissionResult;
        setPermission(permissionResult);
      }

      // Even if permission is 'denied', let's not throw immediately so we can show a nice error in UI
      if (currentPermission !== 'granted') {
        throw new Error('Notification permission not granted. Please check your browser settings.');
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Get VAPID public key from backend
      const res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) throw new Error('Failed to fetch VAPID key');
      const { publicKey } = await res.json();

      let subscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      } catch (err: any) {
        if (err.name === 'InvalidStateError' || err.message?.includes('different application server key')) {
          console.warn('Subscription key mismatch detected. Unsubscribing and retrying...');
          const existingSub = await registration.pushManager.getSubscription();
          if (existingSub) {
            await existingSub.unsubscribe();
          }
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });
        } else {
          throw err;
        }
      }

      // Send to backend
      const subscribeRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(subscription)
      });

      if (!subscribeRes.ok) throw new Error('Failed to subscribe on server');

      setIsSubscribed(true);
      console.log('Successfully subscribed to push notifications');
    } catch (error: any) {
      console.error('Error subscribing to push notifications:', error);
      throw error; // Let the caller handle the UI response
    }
  }, [token]);

  const unsubscribeFromPush = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        // Unsubscribe from browser
        const successful = await subscription.unsubscribe();
        if (successful) {
          setIsSubscribed(false);
          console.log('Successfully unsubscribed from push notifications');
          
          // Note: The backend should ideally expose an endpoint to remove the subscription,
          // but if we just stop sending from the client side, push notifications will stop working
          // on this specific device, so it fits our requirement.
        }
      }
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
    }
  }, []);

  return { isSubscribed, permission, subscribeToPush, unsubscribeFromPush };
}
