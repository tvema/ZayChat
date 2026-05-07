import webpush from 'web-push';
import db from './db';

// This uses the global webpush instance configured in routes.ts
export async function sendPushNotification(userId: string, payload: any) {
  try {
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId) as any[];
    if (!subs || subs.length === 0) return;

    const promises = subs.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, JSON.stringify(payload), {
          // Tell FCM/APNs to show this immediately (wake up phone) and store it for up to 24h if offline
          TTL: 86400,
          urgency: 'high'
        });
      } catch (error: any) {
        if (error.statusCode === 404 || error.statusCode === 410 || error.statusCode === 403) {
          // Subscription has expired, is no longer valid, or VAPID keys mismatch
          console.log(`Subscription ${sub.id} is no longer valid (status ${error.statusCode}), deleting:`, error.message);
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        } else {
          console.error('Error sending push notification:', error);
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('General push error:', error);
  }
}
