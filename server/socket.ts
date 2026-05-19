import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import db from './db';
import { JWT_SECRET } from './auth';
import { sendPushNotification } from './push';

const activeCalls = new Map<string, { requesterId: string, audioOnly: boolean, startedAt: number }>();
const userVisibility = new Map<string, Set<string>>(); // userId -> Set of socketIds that are visible

export function setupSocket(io: SocketIOServer, connectedUsers: Map<string, Set<string>>) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) return next(new Error('Authentication error'));
      socket.data.userId = decoded.userId;
      next();
    });
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId)!.add(socket.id);
    
    // Join personal room for user-specific events
    socket.join(`user:${userId}`);
    
    // Join group rooms
    try {
      const userGroups = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId) as any[];
      userGroups.forEach(g => {
        socket.join(`group:${g.group_id}`);
      });
    } catch (e) {
      console.error('Error joining group rooms', e);
    }
    
    // Broadcast online status
    io.emit('user:online', { userId });

    socket.on('user:visibility', (data: { visible: boolean }) => {
      if (data.visible) {
        if (!userVisibility.has(userId)) userVisibility.set(userId, new Set());
        userVisibility.get(userId)!.add(socket.id);
      } else {
        userVisibility.get(userId)?.delete(socket.id);
        if (userVisibility.get(userId)?.size === 0) userVisibility.delete(userId);
      }
    });

    socket.on('webrtc:ready', () => {
      // Check if user is TARGET of an active call
      const inboundCall = activeCalls.get(userId);
      if (inboundCall) {
        // Only deliver if it's recent (e.g. 60 seconds)
        if (Date.now() - inboundCall.startedAt < 60000) {
          socket.emit('webrtc:call_request', { 
            requesterId: inboundCall.requesterId, 
            audioOnly: inboundCall.audioOnly 
          });
        } else {
          activeCalls.delete(userId);
          socket.emit('webrtc:call_idle');
        }
      } else {
        // Check if user is REQUESTER of an active call (restore for caller)
        let foundOutbound = false;
        for (const [targetId, call] of activeCalls.entries()) {
          if (call.requesterId === userId && (Date.now() - call.startedAt < 60000)) {
            socket.emit('webrtc:call_restored_requester', { targetId, audioOnly: call.audioOnly });
            foundOutbound = true;
            break;
          }
        }
        if (!foundOutbound) {
          socket.emit('webrtc:call_idle');
        }
      }
    });

    // Mark pending messages as delivered
    try {
      // (Call request logic moved to webrtc:ready handler)
      
      const pendingMessages = db.prepare(`SELECT id, sender_id FROM messages WHERE receiver_id = ? AND status = 'sent'`).all(userId);
      if (pendingMessages.length > 0) {
        const bySender: Record<string, string[]> = {};
        pendingMessages.forEach((m: any) => {
          if (!bySender[m.sender_id]) bySender[m.sender_id] = [];
          bySender[m.sender_id].push(m.id);
        });
        
        for (const senderId in bySender) {
          const ids = bySender[senderId];
          const placeholders = ids.map(() => '?').join(',');
          const updated = db.prepare(`UPDATE messages SET status = 'delivered' WHERE id IN (${placeholders}) AND status = 'sent' RETURNING id`).all(...ids) as { id: string }[];
          
          if (updated.length > 0) {
            const updatedIds = updated.map(u => u.id);
            const senderSockets = connectedUsers.get(senderId);
            if (senderSockets) {
              senderSockets.forEach(socketId => io.to(socketId).emit('message:status_update', { messageIds: updatedIds, status: 'delivered' }));
            }
          }
        }
      }
    } catch (e) {
      console.error('Error marking pending messages as delivered', e);
    }

    socket.on('message:send', (data) => {
      const { receiverId, groupId, content, replyTo, forwardedFrom, encryptionData, isMedia } = data;
      const messageId = uuidv4();
      
      try {
        let isBlacklisted = false;
        let isDnd = false;
        if (receiverId) {
          const contactStatus = db.prepare(`
            SELECT circle_type FROM contacts 
            WHERE user_id = ? AND contact_id = ?
          `).get(receiverId, userId) as any;
          if (contactStatus) {
            if (contactStatus.circle_type === 'blacklist') isBlacklisted = true;
            if (contactStatus.circle_type === 'dnd') isDnd = true;
          }
        }

        if (isBlacklisted) {
          socket.emit('error', { message: 'BLACKLISTED', reason: 'You are in the blacklist' });
          return; // Do not insert message
        }

        db.prepare('INSERT INTO messages (id, sender_id, receiver_id, group_id, content, reply_to, forwarded_from, encryption_data, is_media) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          messageId, userId, receiverId || null, groupId || null, content, replyTo || null, forwardedFrom || null, encryptionData ? JSON.stringify(encryptionData) : null, isMedia ? 1 : 0
        );

        const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
        const forwardedFromUser = forwardedFrom ? db.prepare('SELECT username FROM users WHERE id = ?').get(forwardedFrom) as any : null;
        
        const message = {
          id: messageId,
          sender_id: userId,
          sender_username: sender?.username || 'Unknown',
          receiver_id: receiverId || null,
          group_id: groupId || null,
          content,
          status: 'sent',
          reply_to: replyTo || null,
          forwarded_from: forwardedFrom || null,
          forwarded_from_username: forwardedFromUser?.username || null,
          encryption_data: encryptionData || null,
          created_at: new Date().toISOString(),
          reactions: []
        };

        if (groupId) {
          // Send to group room
          io.to(`group:${groupId}`).emit('message:new', message);
          
          // Trigger push to offline group members
          const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId) as any[];
          const group = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId) as any;
          members.forEach((m) => {
             if (m.user_id !== userId) {
                 let userAesKey = null;
                 if (encryptionData && encryptionData.encrypted_keys) {
                     userAesKey = encryptionData.encrypted_keys[m.user_id];
                 } else if (encryptionData && encryptionData.keys) {
                     userAesKey = encryptionData.keys[m.user_id];
                 }
                 const isSmallContent = content && content.length < 3000;

                 sendPushNotification(m.user_id, {
                   title: `${group?.name || 'Групповой'}: ${sender?.username}`,
                   body: encryptionData ? 'Новое зашифрованное сообщение 🔒' : (content.length > 50 ? content.substring(0, 50) + '...' : content),
                   url: `/?group=${groupId}`,
                   encryptedContent: (encryptionData && isSmallContent) ? content : undefined,
                   encryptedAesKey: userAesKey,
                   iv: encryptionData ? (encryptionData.iv || encryptionData.fileIv) : undefined,
                   textIv: encryptionData ? (encryptionData.textIv) : undefined
                 });
             }
          });
          
        } else if (receiverId) {
          // Send to receiver if not blacklisted
          if (!isBlacklisted) {
            const receiverSockets = connectedUsers.get(receiverId);
            if (receiverSockets && receiverSockets.size > 0) {
              receiverSockets.forEach(socketId => io.to(socketId).emit('message:new', message));
            }
            
            // Send push notification regardless of socket presence
            // because browser might be open in background (socket connected)
            // but user is not looking at it
            let userAesKey = null;
            if (encryptionData && encryptionData.keys) {
                userAesKey = encryptionData.keys[receiverId];
            }
            const isSmallContent = content && content.length < 3000;

            if (receiverId !== userId && !isDnd) {
              sendPushNotification(receiverId, {
                title: sender?.username || 'Скрытый контакт',
                body: encryptionData ? 'Новое зашифрованное сообщение 🔒' : (content.length > 50 ? content.substring(0, 50) + '...' : content),
                url: `/?chat=${userId}`,
                encryptedContent: (encryptionData && isSmallContent) ? content : undefined,
                encryptedAesKey: userAesKey,
                iv: encryptionData ? (encryptionData.iv || encryptionData.fileIv) : undefined,
                textIv: encryptionData ? (encryptionData.textIv) : undefined
              });
            }
          }
          
          // Send back to all sender sockets
          if (receiverId !== userId) {
            const senderSockets = connectedUsers.get(userId);
            if (senderSockets) {
              senderSockets.forEach(socketId => io.to(socketId).emit('message:new', message));
            }
          }
        }
      } catch (error) {
        console.error('Failed to insert message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('message:edit', (data) => {
      const { messageId, content, encryptionData, chatId, groupId } = data;
      try {
        const msg = db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(messageId) as any;
        if (msg && msg.sender_id === userId) {
          if (encryptionData) {
            db.prepare('UPDATE messages SET content = ?, encryption_data = ?, is_edited = 1 WHERE id = ?').run(content, JSON.stringify(encryptionData), messageId);
          } else {
            db.prepare('UPDATE messages SET content = ?, is_edited = 1 WHERE id = ?').run(content, messageId);
          }
          
          const updateData = { messageId, content, encryption_data: encryptionData || null, is_edited: true, chatId, groupId };
          
          if (groupId) {
            io.to(`group:${groupId}`).emit('message:edited', updateData);
          } else if (chatId) {
            const receiverSockets = connectedUsers.get(chatId);
            if (receiverSockets) {
              receiverSockets.forEach(socketId => io.to(socketId).emit('message:edited', updateData));
            }
            const senderSockets = connectedUsers.get(userId);
            if (senderSockets) {
              senderSockets.forEach(socketId => io.to(socketId).emit('message:edited', updateData));
            }
          }
        }
      } catch (e) {
        console.error('Failed to edit message:', e);
      }
    });

    socket.on('message:delete', (data) => {
      const { messageId, chatId, groupId } = data;
      try {
        const msg = db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(messageId) as any;
        if (msg && msg.sender_id === userId) {
          db.prepare("UPDATE messages SET is_deleted = 1, content = 'message_deleted', encryption_data = NULL WHERE id = ?").run(messageId);
          db.prepare('DELETE FROM reactions WHERE message_id = ?').run(messageId);
          
          const deleteData = { messageId, chatId, groupId };
          
          if (groupId) {
            io.to(`group:${groupId}`).emit('message:deleted', deleteData);
          } else if (chatId) {
            const receiverSockets = connectedUsers.get(chatId);
            if (receiverSockets) {
              receiverSockets.forEach(socketId => io.to(socketId).emit('message:deleted', deleteData));
            }
            const senderSockets = connectedUsers.get(userId);
            if (senderSockets) {
              senderSockets.forEach(socketId => io.to(socketId).emit('message:deleted', deleteData));
            }
          }
        }
      } catch (e) {
        console.error('Failed to delete message:', e);
      }
    });

    socket.on('message:delivered', (data) => {
      const { messageIds, senderId } = data;
      if (!messageIds || !messageIds.length) return;
      
      try {
        const placeholders = messageIds.map(() => '?').join(',');
        const updated = db.prepare(`UPDATE messages SET status = 'delivered' WHERE id IN (${placeholders}) AND status = 'sent' RETURNING id`).all(...messageIds) as { id: string }[];
        
        if (updated.length > 0) {
          const updatedIds = updated.map(u => u.id);
          const senderSockets = connectedUsers.get(senderId);
          if (senderSockets) {
            senderSockets.forEach(socketId => io.to(socketId).emit('message:status_update', { messageIds: updatedIds, status: 'delivered' }));
          }
        }
      } catch (e) {
        console.error('Error updating delivered status', e);
      }
    });

    socket.on('message:read', (data) => {
      const { messageIds, senderId } = data;
      if (!messageIds || !messageIds.length) return;
      
      try {
        const placeholders = messageIds.map(() => '?').join(',');
        const updated = db.prepare(`UPDATE messages SET status = 'read' WHERE id IN (${placeholders}) AND status != 'read' RETURNING id`).all(...messageIds) as { id: string }[];
        
        if (updated.length > 0) {
          const updatedIds = updated.map(u => u.id);
          const senderSockets = connectedUsers.get(senderId);
          if (senderSockets) {
            senderSockets.forEach(socketId => io.to(socketId).emit('message:status_update', { messageIds: updatedIds, status: 'read' }));
          }
        }
      } catch (e) {
        console.error('Error updating read status', e);
      }
    });

    socket.on('contact:read', (data) => {
      const { contactId } = data;
      if (!contactId) return;
      try {
        const updated = db.prepare(`UPDATE messages SET status = 'read' WHERE sender_id = ? AND receiver_id = ? AND status != 'read' RETURNING id`).all(contactId, userId) as { id: string }[];
        if (updated.length > 0) {
          const updatedIds = updated.map(u => u.id);
          const senderSockets = connectedUsers.get(contactId);
          if (senderSockets) {
            senderSockets.forEach(socketId => io.to(socketId).emit('message:status_update', { messageIds: updatedIds, status: 'read' }));
          }
        }
      } catch (e) {
        console.error('Error updating all messages read status', e);
      }
    });

    socket.on('group:read', (data) => {
      const { groupId } = data;
      if (!groupId) return;
      try {
        db.prepare('UPDATE group_members SET last_read_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ?')
          .run(groupId, userId);
      } catch (e) {
        console.error('Error updating group last_read_at', e);
      }
    });

    socket.on('typing:start', (data) => {
      const { receiverId, groupId } = data;
      try {
        const sender = db.prepare('SELECT username, first_name FROM users WHERE id = ?').get(userId) as any;
        const name = sender?.first_name || sender?.username || 'Unknown';
        
        if (groupId) {
          socket.to(`group:${groupId}`).emit('typing:start', { userId, username: name, chatId: groupId });
        } else if (receiverId) {
          const receiverSockets = connectedUsers.get(receiverId);
          if (receiverSockets) {
            receiverSockets.forEach(socketId => io.to(socketId).emit('typing:start', { userId, username: name, chatId: userId }));
          }
        }
      } catch (e) {
        console.error('Error handling typing:start', e);
      }
    });

    socket.on('typing:stop', (data) => {
      const { receiverId, groupId } = data;
      try {
        if (groupId) {
          socket.to(`group:${groupId}`).emit('typing:stop', { userId, chatId: groupId });
        } else if (receiverId) {
          const receiverSockets = connectedUsers.get(receiverId);
          if (receiverSockets) {
            receiverSockets.forEach(socketId => io.to(socketId).emit('typing:stop', { userId, chatId: userId }));
          }
        }
      } catch (e) {
        console.error('Error handling typing:stop', e);
      }
    });

    socket.on('group:join', (data) => {
      const { groupId } = data;
      if (groupId) {
        socket.join(`group:${groupId}`);
      }
    });

    socket.on('message:react', (data) => {
      const { messageId, emoji } = data;
      
      try {
        // Check if reaction already exists (toggle behavior)
        const existing = db.prepare('SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(messageId, userId, emoji) as any;
        
        if (existing) {
          db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
          
          const msg = db.prepare('SELECT sender_id, receiver_id, group_id FROM messages WHERE id = ?').get(messageId) as any;
          if (msg) {
            const update = { message_id: messageId, user_id: userId, emoji, removed: true };
            if (msg.group_id) {
              io.to(`group:${msg.group_id}`).emit('reaction:update', update);
            } else {
              const s1 = connectedUsers.get(msg.sender_id);
              const s2 = connectedUsers.get(msg.receiver_id);
              if (s1) s1.forEach(socketId => io.to(socketId).emit('reaction:update', update));
              if (s2 && s2 !== s1) s2.forEach(socketId => io.to(socketId).emit('reaction:update', update));
            }
          }
        } else {
          const reactionId = uuidv4();
          db.prepare('INSERT INTO reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)').run(
            reactionId, messageId, userId, emoji
          );
          
          const reaction = { id: reactionId, message_id: messageId, user_id: userId, emoji };
          
          const msg = db.prepare('SELECT sender_id, receiver_id, group_id FROM messages WHERE id = ?').get(messageId) as any;
          if (msg) {
            if (msg.group_id) {
              io.to(`group:${msg.group_id}`).emit('reaction:new', reaction);
            } else {
              const s1 = connectedUsers.get(msg.sender_id);
              const s2 = connectedUsers.get(msg.receiver_id);
              if (s1) s1.forEach(socketId => io.to(socketId).emit('reaction:new', reaction));
              if (s2 && s2 !== s1) s2.forEach(socketId => io.to(socketId).emit('reaction:new', reaction));
            }
          }
        }
      } catch (error) {
        console.error('Failed to process reaction:', error);
      }
    });

    socket.on('webrtc:signal', (data) => {
      const { targetId, signal } = data;
      const targetSockets = connectedUsers.get(targetId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:signal', {
          senderId: userId,
          signal
        }));
      }
    });

    socket.on('webrtc:request_file', (data) => {
      const { targetId, fileId } = data;
      const targetSockets = connectedUsers.get(targetId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:request_file', {
          requesterId: userId,
          fileId
        }));
      }
    });

    socket.on('webrtc:call_request', (data) => {
      try {
        const contactStatus = db.prepare(`
          SELECT circle_type FROM contacts 
          WHERE user_id = ? AND contact_id = ?
        `).get(data.targetId, userId) as any;

        if (contactStatus) {
          if (contactStatus.circle_type === 'blacklist') {
            socket.emit('webrtc:call_reject', { rejecterId: data.targetId, reason: 'unreachable' });
            return;
          }
          if (contactStatus.circle_type === 'dnd') {
            socket.emit('webrtc:call_reject', { rejecterId: data.targetId, reason: 'busy' });
            return;
          }
        }
      } catch (e) {
        console.error('Failed to check contact status for call:', e);
      }

      activeCalls.set(data.targetId, { 
        requesterId: userId, 
        audioOnly: data.audioOnly,
        startedAt: Date.now()
      });

      const targetSockets = connectedUsers.get(data.targetId);
      if (targetSockets && targetSockets.size > 0) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:call_request', { requesterId: userId, audioOnly: data.audioOnly }));
      }
      
      try {
        if (data.targetId !== userId) {
          const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
          sendPushNotification(data.targetId, {
            title: 'Входящий звонок 📞',
            body: `Звонит ${sender?.username || 'Скрытый контакт'}`,
            url: `/?chat=${userId}&call=true`,
            requireInteraction: true,
            renotify: true,
            tag: 'incoming_call_' + userId,
            actions: [
              { action: 'reject', title: 'Отклонить', icon: '/icons/phone-off.png' }
            ]
          });
        }
      } catch (e) {
        console.error('Failed to send call push notification:', e);
      }
    });

    socket.on('webrtc:call_accept', (data) => {
      activeCalls.delete(userId);
      const targetSockets = connectedUsers.get(data.targetId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:call_accept', { accepterId: userId }));
      }
      
      const ownSockets = connectedUsers.get(userId);
      if (ownSockets) {
        ownSockets.forEach(sId => {
          if (sId !== socket.id) io.to(sId).emit('webrtc:call_handled_elsewhere', { targetId: data.targetId });
        });
      }
      
      try {
        sendPushNotification(userId, {
          type: 'cancel_call',
          userId: data.targetId
        });
      } catch (e) {
        console.error('Failed to send cancel push:', e);
      }
    });

    socket.on('webrtc:call_reject', (data) => {
      activeCalls.delete(userId);
      const targetSockets = connectedUsers.get(data.targetId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:call_reject', { rejecterId: userId }));
      }
      
      const ownSockets = connectedUsers.get(userId);
      if (ownSockets) {
        ownSockets.forEach(sId => {
          if (sId !== socket.id) io.to(sId).emit('webrtc:call_handled_elsewhere', { targetId: data.targetId });
        });
      }

      try {
        sendPushNotification(userId, {
          type: 'cancel_call',
          userId: data.targetId
        });
      } catch (e) {
        console.error('Failed to send cancel push:', e);
      }
    });

    socket.on('webrtc:call_end', (data) => {
      activeCalls.delete(userId);
      activeCalls.delete(data.targetId);
      const targetSockets = connectedUsers.get(data.targetId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:call_end', { enderId: userId }));
      }
      try {
        sendPushNotification(data.targetId, {
          type: 'cancel_call',
          userId: userId
        });
      } catch (e) {
        console.error('Failed to send cancel push:', e);
      }
    });

    socket.on('webrtc:call_signal', (data) => {
      const targetSockets = connectedUsers.get(data.targetId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:call_signal', { senderId: userId, signal: data.signal }));
      }
    });

    socket.on('webrtc:media_active', (data) => {
      const targetSockets = connectedUsers.get(data.targetId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:media_active', { senderId: userId }));
      }
    });

    socket.on('webrtc:media_status', (data) => {
      const targetSockets = connectedUsers.get(data.targetId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('webrtc:media_status', { senderId: userId, status: data.status }));
      }
    });

    socket.on('disconnect', () => {
      userVisibility.get(userId)?.delete(socket.id);
      if (userVisibility.get(userId)?.size === 0) userVisibility.delete(userId);

      const userSockets = connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(userId);

          // Grace period for active calls (5 seconds)
          setTimeout(() => {
            if (connectedUsers.has(userId)) {
              console.log(`[Socket] userId ${userId} reconnected within grace period, keeping active calls.`);
              return;
            }

            // Cleanup active calls initiated by this user
            let cleanedCount = 0;
            for (const [targetId, call] of activeCalls.entries()) {
              if (call.requesterId === userId) {
                activeCalls.delete(targetId);
                cleanedCount++;
                const targetSockets = connectedUsers.get(targetId);
                if (targetSockets) {
                  targetSockets.forEach(sId => io.to(sId).emit('webrtc:call_end', { enderId: userId }));
                }
              }
            }

            // Also check if this user was being called (target)
            const inboundCall = activeCalls.get(userId);
            if (inboundCall) {
               activeCalls.delete(userId);
               cleanedCount++;
               const requesterSockets = connectedUsers.get(inboundCall.requesterId);
               if (requesterSockets) {
                 requesterSockets.forEach(sId => io.to(sId).emit('webrtc:call_reject', { rejecterId: userId }));
               }
            }

            if (cleanedCount > 0) {
              console.log(`[Socket] Cleaned up ${cleanedCount} active calls relating to disconnected user ${userId}`);
            }
          }, 60000); // 60 seconds grace period for calls

          const lastSeen = new Date().toISOString();
          try {
            db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(lastSeen, userId);
          } catch (e: any) {
            if (e.message.includes('no such column: last_seen')) {
              // Ignore if column doesn't exist yet
            } else {
              console.error('Error updating last_seen on disconnect', e);
            }
          }
          io.emit('user:offline', { userId, lastSeen });
        }
      }
    });
  });
}
