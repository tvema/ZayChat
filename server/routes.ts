import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from './db';
import { upload } from './upload';
import { authenticateToken, JWT_SECRET } from './auth';
import { GoogleGenAI } from '@google/genai';
import Groq, { toFile } from 'groq-sdk';
import nodeFetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { sendEmail } from './mailer';

let vapidKeys = { publicKey: process.env.VAPID_PUBLIC_KEY || '', privateKey: process.env.VAPID_PRIVATE_KEY || '' };
const vapidPath = path.join(process.cwd(), 'vapid_keys.json');

try {
  if (vapidKeys.publicKey && vapidKeys.privateKey) {
    // Already set via env
  } else if (fs.existsSync(vapidPath)) {
    vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys));
  }
  webpush.setVapidDetails('mailto:admin@zstate.ru', vapidKeys.publicKey, vapidKeys.privateKey);
} catch (e) {
  console.error("Failed to initialize VAPID keys", e);
}

export function setupRoutes(server: express.Express, io: any, connectedUsers: Map<string, Set<string>>) {
  const notifyContactUpdated = (userId1: string, userId2: string) => {
    [userId1, userId2].forEach(userId => {
      if (!userId) return;
      const targetSockets = connectedUsers.get(userId);
      if (targetSockets) {
        targetSockets.forEach(socketId => io.to(socketId).emit('contact:updated'));
      }
    });
  };

  // 1. Check Invite Code
  server.get('/api/invites/check/:code', (req, res) => {
    const { code } = req.params;
    const invite = db.prepare('SELECT * FROM invites WHERE code = ? AND is_used = 0').get(code);
    if (invite) {
      res.json({ valid: true, invite });
    } else {
      res.status(400).json({ valid: false, message: 'Invalid or used invite code' });
    }
  });

  // 2. Register
  server.post('/api/auth/register', upload.single('avatar'), async (req, res) => {
    try {
      const { inviteCode, username, firstName, lastName, email, phone, password, publicKey, encryptedPrivateKey } = req.body;
      
      const invite = db.prepare('SELECT * FROM invites WHERE code = ? AND is_used = 0').get(inviteCode) as any;
      if (!invite) {
        return res.status(400).json({ error: 'Invalid invite code' });
      }

      const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
      if (existingUser) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userId = uuidv4();
      const avatarUrl = req.file ? `/uploads/${req.file.filename}` : null;

      let insertColumns = 'id, username, first_name, last_name, email, phone, password_hash, avatar_url, public_key, encrypted_private_key, invited_by';
      let insertValues = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
      const insertParams: any[] = [userId, username, firstName, lastName, email, phone, passwordHash, avatarUrl, publicKey || null, encryptedPrivateKey || null, invite.sender_id];

      db.prepare(`
        INSERT INTO users (${insertColumns})
        VALUES (${insertValues})
      `).run(...insertParams);

      db.prepare('UPDATE invites SET is_used = 1, used_by = ? WHERE id = ?').run(userId, invite.id);

      // Add inviter to contacts automatically (if not system)
      if (invite.sender_id !== 'system') {
        db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(userId, invite.sender_id);
        db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(invite.sender_id, userId);
        
        // Notify inviter about new contact
        const inviterSockets = connectedUsers.get(invite.sender_id);
        if (inviterSockets) {
          const newUser = db.prepare('SELECT id, username, first_name, last_name, email, phone, avatar_url, public_key FROM users WHERE id = ?').get(userId);
          inviterSockets.forEach(socketId => {
            io.to(socketId).emit('contact:new', newUser);
          });
        }
      }

      const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
      
      // Create session
      const sessionId = uuidv4();
      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      const ipAddress = req.ip || (req.socket ? req.socket.remoteAddress : null) || 'Unknown IP';
      db.prepare('INSERT INTO sessions (id, user_id, token, device_info, ip_address) VALUES (?, ?, ?, ?, ?)')
        .run(sessionId, userId, token, userAgent, ipAddress);

      res.json({ 
        token, 
        user: { 
          id: userId, 
          username, 
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          avatar_url: avatarUrl,
          public_key: publicKey || null
        } 
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Login
  server.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username) as any;
      
      if (!user) {
        return res.status(401).json({ error: 'Пользователь не найден (User not found)' });
      }
      
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Неверный пароль (Invalid password)' });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      
      // Create session
      const sessionId = uuidv4();
      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      const ipAddress = req.ip || (req.socket ? req.socket.remoteAddress : null) || 'Unknown IP';
      
      try {
        db.prepare('INSERT INTO sessions (id, user_id, token, device_info, ip_address) VALUES (?, ?, ?, ?, ?)')
          .run(sessionId, user.id, token, userAgent, ipAddress);
      } catch (sessionErr: any) {
        console.error(`[AUTH] Failed to create session: ${sessionErr.message}`);
        // Continue anyway if database write failed? No, we need session
        throw new Error('Failed to create session');
      }

      res.json({ 
        token, 
        user: { 
          id: user.id, 
          username: user.username, 
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          avatar_url: user.avatar_url,
          public_key: user.public_key,
          encrypted_private_key: user.encrypted_private_key,
          email_verified: !!user.email_verified
        } 
      });
    } catch (err: any) {
      console.error(`[AUTH] Login error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // 3.0.1 Forgot Password
  server.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      const normalizedEmail = (email || '').trim().toLowerCase();
      
      console.log(`Password reset requested for: "${normalizedEmail}"`);
      
      // Let's do a case-insensitive lookup just to be safe
      const user = db.prepare('SELECT id, first_name FROM users WHERE LOWER(email) = ?').get(normalizedEmail) as any;
      if (!user) {
        console.warn(`User not found for email: "${normalizedEmail}"`);
        throw new Error('Пользователь с таким email не найден в базе данных.');
      }

      console.log(`User found (${user.id}), writing reset token to DB...`);
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

      db.prepare('INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(uuidv4(), user.id, token, expiresAt);

      const resetLink = `https://${process.env.APP_URL || req.get('host')}/reset-password?token=${token}`;
      console.log(`Reset link generated: ${resetLink}`);
      
      const emailHtml = `
        <h3>Здравствуйте, ${user.first_name}!</h3>
        <p>Вы запросили сброс пароля для вашего аккаунта в ZState Chat.</p>
        <p>Для создания нового пароля и ключей шифрования (старая история сообщений будет сброшена) перейдите по ссылке:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Если вы не запрашивали сброс, просто проигнорируйте это письмо.</p>
        <p>Ссылка действительна 1 час.</p>
      `;

      console.log(`Sending email to ${normalizedEmail} using SMTP User: ${process.env.SMTP_USER}`);
      await sendEmail({
        to: normalizedEmail,
        subject: 'Сброс пароля ZState Chat',
        html: emailHtml
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error('FORGOT PASSWORD ERROR:', err.message);
      res.status(500).json({ error: err.message || 'Ошибка обработки запроса' });
    }
  });

  // 3.0.2 Rest Password
  server.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword, publicKey, encryptedPrivateKey } = req.body;

      const resetRecord = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token) as any;
      
      if (!resetRecord) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }

      const now = new Date().toISOString();
      if (resetRecord.expires_at < now) {
        db.prepare('DELETE FROM password_resets WHERE id = ?').run(resetRecord.id);
        return res.status(400).json({ error: 'Token has expired' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      const updateStmt = db.prepare(`
        UPDATE users 
        SET password_hash = ?, public_key = ?, encrypted_private_key = ? 
        WHERE id = ?
      `);
      
      updateStmt.run(passwordHash, publicKey, encryptedPrivateKey, resetRecord.user_id);
      
      // Delete token after successful use
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(resetRecord.user_id);

      // Optionally, kill all existing sessions for this user
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(resetRecord.user_id);

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // 3.0.3 Request Email Verification
  server.post('/api/auth/send-verification-email', authenticateToken, async (req: any, res) => {
    try {
      const user = db.prepare('SELECT id, email, first_name, email_verified FROM users WHERE id = ?').get(req.user.userId) as any;
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user.email_verified) {
        return res.status(400).json({ error: 'Email already verified' });
      }

      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 86400000).toISOString(); // 24 hours

      db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(user.id);
      db.prepare('INSERT INTO email_verifications (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(uuidv4(), user.id, token, expiresAt);

      const verifyLink = `https://${process.env.APP_URL || req.get('host')}/verify-email?token=${token}`;
      
      const emailHtml = `
        <h3>Здравствуйте, ${user.first_name}!</h3>
        <p>Для подтверждения вашего email адреса в ZState Chat, пожалуйста, перейдите по ссылке ниже:</p>
        <p><a href="${verifyLink}">${verifyLink}</a></p>
        <p>Ссылка действительна 24 часа. Подтвержденный email необходим для отправки приглашений новым пользователям.</p>
        <p>Если вы не регистрировались, просто проигнорируйте это письмо.</p>
      `;

      await sendEmail({
        to: user.email,
        subject: 'Подтверждение Email - ZState Chat',
        html: emailHtml
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error('VERIFY EMAIL ERROR:', err.message);
      res.status(500).json({ error: err.message || 'Failed to send verification email' });
    }
  });

  // 3.0.4 Verify Email
  server.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = req.body;
      const verifyRecord = db.prepare('SELECT * FROM email_verifications WHERE token = ?').get(token) as any;
      
      if (!verifyRecord) {
        return res.status(400).json({ error: 'Неверный или просроченный токен' });
      }

      const now = new Date().toISOString();
      if (verifyRecord.expires_at < now) {
        db.prepare('DELETE FROM email_verifications WHERE id = ?').run(verifyRecord.id);
        return res.status(400).json({ error: 'Срок действия ссылки истёк' });
      }

      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(verifyRecord.user_id);
      db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(verifyRecord.user_id);

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Failed to verify email' });
    }
  });

  // 3.1 Get Active Sessions
  server.get('/api/sessions', authenticateToken, (req: any, res) => {
    try {
      const sessions = db.prepare('SELECT id, device_info, ip_address, last_active, created_at, token FROM sessions WHERE user_id = ? ORDER BY last_active DESC').all(req.user.userId);
      // Mark current session
      const sessionsWithCurrent = sessions.map((s: any) => ({
        ...s,
        is_current: s.token === req.token
      }));
      // Remove token from response for security
      sessionsWithCurrent.forEach((s: any) => delete s.token);
      res.json(sessionsWithCurrent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3.2 Terminate Session
  server.delete('/api/sessions/:id', authenticateToken, (req: any, res) => {
    try {
      const sessionId = req.params.id;
      const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.userId) as any;
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

      // Tell the specific socket to logout if it's connected
      // We need a way to find the socket by token. We'll broadcast a specific event that clients check against their token
      // Or we can just emit to the user's room with the token to revoke
      io.to(`user:${req.user.userId}`).emit('auth:session_revoked', { token: session.token });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3.3 Logout
  server.post('/api/auth/logout', authenticateToken, (req: any, res) => {
    try {
      // Find the session matching the current token
      const session = db.prepare('SELECT id FROM sessions WHERE token = ? AND user_id = ?').get(req.token, req.user.userId) as any;
      
      if (session) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
      }
      
      // We don't need to emit session_revoked here because the client is already logging out
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload file endpoint
  server.post('/api/upload', authenticateToken, upload.single('file'), (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const fileUrl = `/uploads/${req.file.filename}`;
      
      // Fix for multer/busboy latin1 encoding issue with utf8 filenames
      let originalName = req.file.originalname;
      try {
        originalName = decodeURIComponent(originalName);
      } catch(e) {
        try {
          originalName = Buffer.from(originalName, 'latin1').toString('utf8');
        } catch (e2) {}
      }
      
      res.json({ url: fileUrl, name: originalName, size: req.file.size, mime: req.file.mimetype });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download file endpoint
  server.get('/api/download', async (req: any, res) => {
    try {
      const fileUrl = req.query.url;
      const filename = req.query.filename || 'download';
      
      if (!fileUrl || typeof fileUrl !== 'string') {
        return res.status(400).send('Missing url parameter');
      }

      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      
      if (fileUrl.startsWith('/uploads/') || fileUrl.includes('/uploads/')) {
         // handle both absolute and relative URLs
         const match = fileUrl.match(/\/uploads\/(.+)$/);
         if (match && match[1]) {
           let theFile = match[1];
           if (theFile.includes('?')) {
               theFile = theFile.split('?')[0];
           }
           const filepath = path.join(uploadDir, theFile);
           if (fs.existsSync(filepath)) {
              return res.download(filepath, filename);
           }
         }
      }
      
      // If it's an external URL, proxy it to force download headers
      if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
        try {
          const response = await fetch(fileUrl);
          if (response.ok && response.body) {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
            
            // @ts-ignore
            const { Readable } = require('stream');
            const readable = Readable.fromWeb(response.body);
            readable.pipe(res);
            return;
          }
        } catch (fetchErr) {
          console.error("Proxy download failed:", fetchErr);
        }
      }

      // Fallback
      res.redirect(fileUrl);
    } catch(err) {
      res.status(500).send('Download failed');
    }
  });

  // 4. Get Profile
  server.get('/api/users/me', authenticateToken, (req: any, res) => {
    try {
      let user: any;
      try {
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
        if (!user) {
          console.warn(`[AUTH] Profile check failed: User ${req.user.userId} not found`);
          return res.status(404).json({ error: 'User not found' });
        }
      } catch (e: any) {
        console.error(`[AUTH] Profile DB error: ${e.message}`);
        throw e;
      }
      res.json(user);
    } catch (err: any) {
      console.error('Error in /api/users/me:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4.1 Update Avatar
  server.post('/api/users/avatar', authenticateToken, upload.single('avatar'), (req: any, res) => {
    try {
      if (!req.file) {
        console.warn(`[AVATAR] No file uploaded for user ${req.user.userId}`);
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const avatarUrl = `/uploads/${req.file.filename}`;
      console.log(`[AVATAR] Updating user ${req.user.userId} avatar to ${avatarUrl}`);
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.userId);
      res.json({ avatarUrl });
    } catch (err: any) {
      console.error('[AVATAR] Error updating user avatar:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4.1.1 Update Group Avatar
  server.put('/api/groups/:groupId/avatar', authenticateToken, upload.single('avatar'), (req: any, res) => {
    try {
      const { groupId } = req.params;
      
      const group = db.prepare('SELECT id, creator_id FROM groups WHERE id = ?').get(groupId) as any;
      if (!group) {
        console.warn(`[AVATAR] Group ${groupId} not found`);
        return res.status(404).json({ error: 'Group not found' });
      }
      
      const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.user.userId) as any;
      if (!member || (member.role !== 'admin' && group.creator_id !== req.user.userId)) {
        console.warn(`[AVATAR] User ${req.user.userId} unauthorized to update group ${groupId} avatar`);
        return res.status(403).json({ error: 'Only admins can change group avatar' });
      }

      if (!req.file) {
        console.warn(`[AVATAR] No file uploaded for group ${groupId}`);
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const avatarUrl = `/uploads/${req.file.filename}`;
      console.log(`[AVATAR] Updating group ${groupId} avatar to ${avatarUrl}`);
      db.prepare('UPDATE groups SET avatar_url = ? WHERE id = ?').run(avatarUrl, groupId);

      // Notify members via websocket
      const messageId = uuidv4();
      const content = `Группа обновила фото профиля`;
      db.prepare('INSERT INTO messages (id, sender_id, receiver_id, group_id, content, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        messageId, 'system', null, groupId, content, 'sent'
      );

      // Real-time notification for group info update
      io.to(`group:${groupId}`).emit('group:updated', groupId);
      
      // Emit the system message too
      io.to(`group:${groupId}`).emit('message', {
        id: messageId,
        sender_id: 'system',
        group_id: groupId,
        content: content,
        created_at: new Date().toISOString(),
        status: 'sent'
      });

      res.json({ avatarUrl });
    } catch (err: any) {
      console.error('[AVATAR] Error updating group avatar:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4.2 Update Profile
  server.put('/api/users/profile', authenticateToken, (req: any, res) => {
    try {
      const { firstName, lastName, email, phone } = req.body;
      db.prepare('UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE id = ?')
        .run(firstName, lastName, email, phone, req.user.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4.3 Change Password
  server.put('/api/users/password', authenticateToken, async (req: any, res) => {
    try {
      const { oldPassword, newPassword, encryptedPrivateKey } = req.body;
      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.userId) as any;
      
      if (!user || !(await bcrypt.compare(oldPassword, user.password_hash))) {
        return res.status(401).json({ error: 'Invalid old password' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      
      if (encryptedPrivateKey) {
        db.prepare('UPDATE users SET password_hash = ?, encrypted_private_key = ? WHERE id = ?').run(passwordHash, encryptedPrivateKey, req.user.userId);
      } else {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.user.userId);
      }
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4.4 Update Keys (for old users)
  server.put('/api/users/keys', authenticateToken, (req: any, res) => {
    try {
      const { publicKey, encryptedPrivateKey } = req.body;
      if (!publicKey || !encryptedPrivateKey) {
        return res.status(400).json({ error: 'Missing keys' });
      }
      
      const user = db.prepare('SELECT public_key FROM users WHERE id = ?').get(req.user.userId) as any;
      if (user && user.public_key) {
        return res.status(400).json({ error: 'User already has keys' });
      }

      db.prepare('UPDATE users SET public_key = ?, encrypted_private_key = ? WHERE id = ?').run(publicKey, encryptedPrivateKey, req.user.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Generate Invite
  server.post('/api/invites/generate', authenticateToken, (req: any, res) => {
    try {
      const user = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(req.user.userId) as any;
      if (!user || user.email_verified !== 1) {
        return res.status(400).json({ error: 'EMAIL_NOT_VERIFIED' });
      }

      const code = uuidv4().split('-')[0].toUpperCase();
      const id = uuidv4();
      db.prepare('INSERT INTO invites (id, code, sender_id) VALUES (?, ?, ?)').run(id, code, req.user.userId);
      res.json({ code });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Search Users
  server.get('/api/users/search', authenticateToken, (req: any, res) => {
    try {
      const { q } = req.query;
      
      let users: any[];
      try {
        if (q) {
          users = db.prepare(`
            SELECT u.*,
                   (SELECT MAX(created_at) FROM messages 
                    WHERE (sender_id = ? AND receiver_id = u.id) 
                       OR (sender_id = u.id AND receiver_id = ?)) as last_message_timestamp
            FROM users u
            WHERE (u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ?)
            AND u.id != ? AND u.id != 'system'
            LIMIT 20
          `).all(req.user.userId, req.user.userId, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, req.user.userId);
        } else {
          users = db.prepare(`
            SELECT u.*,
                   (SELECT MAX(created_at) FROM messages 
                    WHERE (sender_id = ? AND receiver_id = u.id) 
                       OR (sender_id = u.id AND receiver_id = ?)) as last_message_timestamp
            FROM users u
            WHERE u.id != ? AND u.id != 'system'
            LIMIT 50
          `).all(req.user.userId, req.user.userId, req.user.userId);
        }
      } catch (e: any) {
        throw e;
      }
      
      const usersWithOnlineStatus = users.map((u: any) => ({
        ...u,
        is_online: connectedUsers.has(u.id) && (connectedUsers.get(u.id)?.size || 0) > 0
      }));
      
      res.json(usersWithOnlineStatus);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Add Contact
  server.post('/api/contacts', authenticateToken, (req: any, res) => {
    const { contactId } = req.body;
    try {
      db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(req.user.userId, contactId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7.05 Bulk Add Contacts
  server.post('/api/contacts/bulk', authenticateToken, (req: any, res) => {
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds)) {
      return res.status(400).json({ error: 'contactIds must be an array' });
    }
    try {
      const stmt = db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)');
      let added = 0;
      db.transaction(() => {
        for (const cid of contactIds) {
          if (cid && cid !== req.user.userId) {
            const info = stmt.run(req.user.userId, cid);
            if (info.changes > 0) added++;
          }
        }
      })();
      res.json({ success: true, added });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7.1 Remove Contact
  server.delete('/api/contacts/:contactId', authenticateToken, (req: any, res) => {
    const { contactId } = req.params;
    try {
      db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?').run(req.user.userId, contactId);
      notifyContactUpdated(req.user.userId, contactId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7.1.1 Change Contact Circle
  server.put('/api/contacts/:contactId/circle', authenticateToken, (req: any, res) => {
    const { contactId } = req.params;
    const { circle_type } = req.body;
    if (!['normal', 'dnd', 'blacklist'].includes(circle_type)) {
      return res.status(400).json({ error: 'Invalid circle type' });
    }
    try {
      db.prepare('UPDATE contacts SET circle_type = ? WHERE user_id = ? AND contact_id = ?').run(circle_type, req.user.userId, contactId);
      notifyContactUpdated(req.user.userId, contactId);
      res.json({ success: true, circle_type });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7.2 Clear Chat
  server.delete('/api/messages/:contactId/clear', authenticateToken, (req: any, res) => {
    const { contactId } = req.params;
    const isGroup = req.query.isGroup === 'true';
    try {
      if (isGroup) {
        const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(contactId, req.user.userId);
        if (!member) return res.status(403).json({ error: 'Not a member of this group' });
        db.prepare('DELETE FROM messages WHERE group_id = ?').run(contactId);
      } else {
        db.prepare('DELETE FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)')
          .run(req.user.userId, contactId, contactId, req.user.userId);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Get Contacts
  server.get('/api/contacts', authenticateToken, (req: any, res) => {
    try {
      let contacts: any[];
      try {
        contacts = db.prepare(`
          SELECT u.*, 
                 COALESCE(c.is_pinned, 0) as is_pinned,
                 COALESCE(c.circle_type, 'normal') as circle_type,
                 (SELECT CASE WHEN circle_type = 'blacklist' THEN 1 ELSE 0 END FROM contacts WHERE user_id = u.id AND contact_id = ?) as is_blacklisted_by,
                 CASE WHEN c.contact_id IS NOT NULL THEN 1 ELSE 0 END as is_contact,
                 (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.receiver_id = ? AND m.status != 'read') as unread_count,
                 (SELECT MAX(created_at) FROM messages m WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)) as last_message_timestamp
          FROM users u
          LEFT JOIN contacts c ON u.id = c.contact_id AND c.user_id = ?
          WHERE (c.contact_id IS NOT NULL 
             OR u.id IN (
                 SELECT sender_id FROM messages WHERE receiver_id = ?
                 UNION
                 SELECT receiver_id FROM messages WHERE sender_id = ?
             ))
          AND u.id != 'system'
        `).all(req.user.userId, req.user.userId, req.user.userId, req.user.userId, req.user.userId, req.user.userId, req.user.userId);
        
        // Filter out the current user from the results
        contacts = contacts.filter((c: any) => c.id !== req.user.userId);
      } catch (e: any) {
        throw e;
      }
      
      const contactsWithOnlineStatus = contacts.map((c: any) => ({
        ...c,
        is_online: connectedUsers.has(c.id) && (connectedUsers.get(c.id)?.size || 0) > 0
      }));
      
      res.json(contactsWithOnlineStatus);
    } catch (err: any) {
      console.error('Error in /api/contacts:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Request unblock
  server.post('/api/contacts/:contactId/request_unblock', authenticateToken, (req: any, res) => {
    try {
      const { contactId } = req.params;
      const messageId = uuidv4();
      const content = "[[SYSTEM_REQUEST_UNBLOCK]]";
      
      // We insert a system message from me to the person who blacklisted me
      db.prepare('INSERT INTO messages (id, sender_id, receiver_id, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        messageId, req.user.userId, contactId, content, 'sent', new Date().toISOString()
      );
      
      // Also emit via socket
      const targetSockets = connectedUsers.get(contactId);
      if (targetSockets && targetSockets.size > 0) {
        const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.userId) as any;
        targetSockets.forEach(socketId => io.to(socketId).emit('message:new', {
          id: messageId,
          sender_id: req.user.userId,
          sender_username: sender?.username || 'Unknown',
          receiver_id: contactId,
          content,
          status: 'sent',
          created_at: new Date().toISOString(),
          reactions: []
        }));
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8.2 Contact Circles
  server.get('/api/contact-circles', authenticateToken, (req: any, res) => {
    try {
      const circles = db.prepare('SELECT * FROM contact_circles WHERE user_id = ?').all(req.user.userId);
      const circlesWithMembers = circles.map((circle: any) => {
        const members = db.prepare('SELECT contact_id FROM contact_circle_members WHERE circle_id = ?').all(circle.id);
        return { ...circle, members: members.map((m: any) => m.contact_id) };
      });
      res.json(circlesWithMembers);
    } catch (err: any) {
      console.error('Error in GET /api/contact-circles:', err);
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/contact-circles', authenticateToken, (req: any, res) => {
    const { name, do_not_disturb, is_hidden, is_blacklist, password } = req.body;
    const id = uuidv4();
    let password_hash = null;
    if (password) {
      password_hash = bcrypt.hashSync(password, 10);
    }
    try {
      db.prepare(`
        INSERT INTO contact_circles (id, user_id, name, do_not_disturb, is_hidden, is_blacklist, password_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.user.userId, name, do_not_disturb ? 1 : 0, is_hidden ? 1 : 0, is_blacklist ? 1 : 0, password_hash);
      res.json({ id, name, do_not_disturb: do_not_disturb ? 1 : 0, is_hidden: is_hidden ? 1 : 0, is_blacklist: is_blacklist ? 1 : 0, members: [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.put('/api/contact-circles/:id', authenticateToken, (req: any, res) => {
    const { name, do_not_disturb, is_hidden, is_blacklist, password } = req.body;
    let password_hash = undefined;
    if (password !== undefined) {
      password_hash = password ? bcrypt.hashSync(password, 10) : null;
    }
    
    try {
      const circle = db.prepare('SELECT * FROM contact_circles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
      if (!circle) return res.status(404).json({ error: 'Circle not found' });

      if (password_hash !== undefined) {
        db.prepare(`
          UPDATE contact_circles SET name = ?, do_not_disturb = ?, is_hidden = ?, is_blacklist = ?, password_hash = ? WHERE id = ?
        `).run(name, do_not_disturb ? 1 : 0, is_hidden ? 1 : 0, is_blacklist ? 1 : 0, password_hash, req.params.id);
      } else {
        db.prepare(`
          UPDATE contact_circles SET name = ?, do_not_disturb = ?, is_hidden = ?, is_blacklist = ? WHERE id = ?
        `).run(name, do_not_disturb ? 1 : 0, is_hidden ? 1 : 0, is_blacklist ? 1 : 0, req.params.id);
      }
      res.json({ id: req.params.id, name, do_not_disturb: do_not_disturb ? 1 : 0, is_hidden: is_hidden ? 1 : 0, is_blacklist: is_blacklist ? 1 : 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.delete('/api/contact-circles/:id', authenticateToken, (req: any, res) => {
    try {
      db.prepare('DELETE FROM contact_circle_members WHERE circle_id = ?').run(req.params.id);
      db.prepare('DELETE FROM contact_circles WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/contact-circles/:id/members', authenticateToken, (req: any, res) => {
    const { contactId } = req.body;
    try {
      const circle = db.prepare('SELECT * FROM contact_circles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
      if (!circle) return res.status(404).json({ error: 'Circle not found' });
      
      db.prepare('INSERT OR IGNORE INTO contact_circle_members (circle_id, contact_id) VALUES (?, ?)').run(req.params.id, contactId);
      notifyContactUpdated(req.user.userId, contactId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.delete('/api/contact-circles/:id/members/:contactId', authenticateToken, (req: any, res) => {
    try {
      const circle = db.prepare('SELECT * FROM contact_circles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
      if (!circle) return res.status(404).json({ error: 'Circle not found' });

      db.prepare('DELETE FROM contact_circle_members WHERE circle_id = ? AND contact_id = ?').run(req.params.id, req.params.contactId);
      notifyContactUpdated(req.user.userId, req.params.contactId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/contact-circles/:id/unlock', authenticateToken, (req: any, res) => {
    const { password } = req.body;
    try {
      const circle = db.prepare('SELECT * FROM contact_circles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId) as any;
      if (!circle) return res.status(404).json({ error: 'Circle not found' });
      
      if (!circle.password_hash) return res.json({ success: true });
      
      if (bcrypt.compareSync(password, circle.password_hash)) {
        res.json({ success: true });
      } else {
        res.status(401).json({ error: 'Invalid password' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/contact-circles/move', authenticateToken, (req: any, res) => {
    const { contactId, fromCircleId, toCircleId } = req.body;
    try {
      db.transaction(() => {
        if (fromCircleId) {
          db.prepare('DELETE FROM contact_circle_members WHERE circle_id = ? AND contact_id = ?').run(fromCircleId, contactId);
        }
        if (toCircleId) {
          db.prepare('INSERT OR IGNORE INTO contact_circle_members (circle_id, contact_id) VALUES (?, ?)').run(toCircleId, contactId);
        }
      })();
      notifyContactUpdated(req.user.userId, contactId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8.3 Get Groups
  server.get('/api/groups', authenticateToken, (req: any, res) => {
    try {
      const groups = db.prepare(`
        SELECT g.*, 
               gm.role,
               gm.encrypted_keys,
               (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as member_count,
               (SELECT COUNT(*) FROM messages m WHERE m.group_id = g.id AND m.created_at > gm.last_read_at AND m.sender_id != ?) as unread_count,
               (SELECT MAX(created_at) FROM messages m WHERE m.group_id = g.id) as last_message_timestamp
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
      `).all(req.user.userId, req.user.userId);
      res.json(groups);
    } catch (err: any) {
      console.error('Error fetching groups:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8.2 Create Group
  server.post('/api/groups', authenticateToken, upload.single('avatar'), (req: any, res) => {
    try {
      const { name, description, encrypted_keys } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Название группы обязательно' });
      }

      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Пользователь не авторизован' });
      }

      const groupId = uuidv4();
      const avatarUrl = req.file ? `/uploads/${req.file.filename}` : null;
      
      // Use a transaction for atomic group creation
      const createGroupTransaction = db.transaction(() => {
        db.prepare('INSERT INTO groups (id, name, description, avatar_url, creator_id, current_key_version) VALUES (?, ?, ?, ?, ?, 1)')
          .run(groupId, name, description || '', avatarUrl, req.user.userId);
        
        db.prepare('INSERT INTO group_members (group_id, user_id, role, encrypted_keys) VALUES (?, ?, ?, ?)')
          .run(groupId, req.user.userId, 'admin', encrypted_keys || null);
      });

      createGroupTransaction();
      
      // Make the creator's socket join the group room
      try {
        const creatorSockets = connectedUsers.get(req.user.userId);
        if (creatorSockets) {
          creatorSockets.forEach(socketId => {
            io.in(socketId).socketsJoin(`group:${groupId}`);
          });
        }
      } catch (socketErr) {
        console.error('Error joining socket to group room:', socketErr);
        // Don't fail the whole request if socket join fails
      }
      
      res.json({ 
        id: groupId, 
        name, 
        description: description || '', 
        avatar_url: avatarUrl, 
        creator_id: req.user.userId,
        member_count: 1,
        created_at: new Date().toISOString(),
        role: 'admin',
        encrypted_keys: encrypted_keys || null,
        current_key_version: 1
      });
    } catch (err: any) {
      console.error('CRITICAL: Error creating group:', err);
      res.status(500).json({ error: `Ошибка сервера: ${err.message}` });
    }
  });

  // 8.3 Add Group Member
  server.post('/api/groups/:groupId/members', authenticateToken, (req: any, res) => {
    try {
      const { groupId } = req.params;
      const { userId, encrypted_keys } = req.body;
      
      // Check if current user is admin
      const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.user.userId) as any;
      if (!member || member.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can add members' });
      }

      // Check if the user being added has blacklisted the admin, or if admin has blacklisted the user.
      const isBlacklisted = db.prepare('SELECT 1 FROM contacts WHERE ((user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)) AND circle_type = ?').get(userId, req.user.userId, req.user.userId, userId, 'blacklist');
      if (isBlacklisted) {
        return res.status(403).json({ error: 'Пользователь ограничил возможность добавления в группы' });
      }
      
      let encryptedKeysJson = null;
      if (encrypted_keys) {
        encryptedKeysJson = JSON.stringify(encrypted_keys);
      }

      db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, encrypted_keys) VALUES (?, ?, ?)').run(groupId, userId, encryptedKeysJson);
      
      // Notify the added user via socket if online
      const targetSockets = connectedUsers.get(userId);
      if (targetSockets) {
        const group = db.prepare(`
          SELECT g.*, 
                 gm.role,
                 gm.encrypted_keys,
                 (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as member_count,
                 0 as unread_count,
                 (SELECT MAX(created_at) FROM messages m WHERE m.group_id = g.id) as last_message_timestamp
          FROM groups g
          JOIN group_members gm ON g.id = gm.group_id
          WHERE g.id = ? AND gm.user_id = ?
        `).get(groupId, userId);
        
        targetSockets.forEach(socketId => {
          io.to(socketId).emit('group:new', group);
          // Make the added user's socket join the group room
          io.in(socketId).socketsJoin(`group:${groupId}`);
        });
      }
      
      // Notify existing members
      io.to(`group:${groupId}`).emit('group:updated', groupId);
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8.4 Leave Group
  server.post('/api/groups/:groupId/leave', authenticateToken, (req: any, res) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.userId;

      // Check if user is in group
      const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
      if (!member) {
        return res.status(404).json({ error: 'Вы не состоите в этой группе' });
      }

      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);

      // Notify others in the group that the user left
      io.to(`group:${groupId}`).emit('group:updated', groupId);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8.5 Get Group Members
  server.get('/api/groups/:groupId/members', authenticateToken, (req: any, res) => {
    try {
      const { groupId } = req.params;
      const members = db.prepare(`
        SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, u.public_key, gm.role
        FROM users u
        JOIN group_members gm ON u.id = gm.user_id
        WHERE gm.group_id = ? AND u.id != 'system'
      `).all(groupId);
      res.json(members);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8.5 Remove Group Member
  server.delete('/api/groups/:groupId/members/:userId', authenticateToken, (req: any, res) => {
    try {
      const { groupId, userId } = req.params;
      const { encrypted_keys, key_version } = req.body;
      
      // Check if current user is admin
      const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.user.userId) as any;
      if (!member || member.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can remove members' });
      }
      
      db.transaction(() => {
        db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
        
        if (encrypted_keys && key_version) {
          db.prepare('UPDATE groups SET current_key_version = ? WHERE id = ?').run(key_version, groupId);
          
          for (const [memberId, encryptedKey] of Object.entries(encrypted_keys)) {
            const currentMember = db.prepare('SELECT encrypted_keys FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, memberId) as any;
            if (currentMember) {
              let keysObj: Record<string, string> = {};
              if (currentMember.encrypted_keys) {
                try {
                  keysObj = JSON.parse(currentMember.encrypted_keys);
                } catch (e) {
                  keysObj = { "1": currentMember.encrypted_keys };
                }
              }
              keysObj[key_version.toString()] = encryptedKey as string;
              db.prepare('UPDATE group_members SET encrypted_keys = ? WHERE group_id = ? AND user_id = ?').run(JSON.stringify(keysObj), groupId, memberId);
            }
          }
        }
      })();
      
      // Notify the removed user via socket if online
      const targetSockets = connectedUsers.get(userId);
      if (targetSockets) {
        targetSockets.forEach(socketId => {
          io.in(socketId).socketsLeave(`group:${groupId}`);
          io.to(socketId).emit('group:removed', groupId);
        });
      }

      // Notify remaining members
      io.to(`group:${groupId}`).emit('group:updated', groupId);
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8.6 Update Group Member Role
  server.put('/api/groups/:groupId/members/:userId', authenticateToken, (req: any, res) => {
    try {
      const { groupId, userId } = req.params;
      const { role } = req.body;
      
      // Check if current user is admin
      const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.user.userId) as any;
      if (!member || member.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can update roles' });
      }
      
      db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, userId);
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8.7 Delete Group
  server.delete('/api/groups/:groupId', authenticateToken, (req: any, res) => {
    try {
      const { groupId } = req.params;
      
      // Check if current user is admin
      const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.user.userId) as any;
      if (!member || member.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete groups' });
      }
      
      db.transaction(() => {
        db.prepare('DELETE FROM messages WHERE group_id = ?').run(groupId);
        db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
        db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
      })();
      
      // Notify all members
      io.to(`group:${groupId}`).emit('group:deleted', groupId);
      io.in(`group:${groupId}`).socketsLeave(`group:${groupId}`);
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Get Messages
  server.get('/api/messages/:contactId', authenticateToken, (req: any, res) => {
    try {
      const { contactId } = req.params;
      const isGroup = req.query.isGroup === 'true';
      const limit = parseInt(req.query.limit as string) || 30;
      const before = req.query.before as string;
      
      let messages;
      if (isGroup) {
        let query = `
          SELECT m.*, 
                 u.username as sender_username, u.first_name as sender_first_name, u.last_name as sender_last_name, u.avatar_url as sender_avatar_url,
                 u2.username as forwarded_from_username,
                 (SELECT json_group_array(json_object('id', r.id, 'emoji', r.emoji, 'user_id', r.user_id))
                  FROM reactions r WHERE r.message_id = m.id) as reactions
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          LEFT JOIN users u2 ON m.forwarded_from = u2.id
          WHERE m.group_id = ?
        `;
        const params: any[] = [contactId];
        
        if (before) {
          query += ` AND m.created_at < ?`;
          params.push(before);
        }
        
        query += ` ORDER BY m.created_at DESC LIMIT ?`;
        params.push(limit);
        
        messages = db.prepare(query).all(...params);
        
        // Update last_read_at for group member
        db.prepare('UPDATE group_members SET last_read_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ?')
          .run(contactId, req.user.userId);
      } else {
        let query = `
          SELECT m.*, 
                 u.username as sender_username, u.first_name as sender_first_name, u.last_name as sender_last_name, u.avatar_url as sender_avatar_url,
                 u2.username as forwarded_from_username,
                 (SELECT json_group_array(json_object('id', r.id, 'emoji', r.emoji, 'user_id', r.user_id))
                  FROM reactions r WHERE r.message_id = m.id) as reactions
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          LEFT JOIN users u2 ON m.forwarded_from = u2.id
          WHERE ((m.sender_id = ? AND m.receiver_id = ?)
             OR (m.sender_id = ? AND m.receiver_id = ?))
        `;
        const params: any[] = [req.user.userId, contactId, contactId, req.user.userId];
        
        if (before) {
          query += ` AND m.created_at < ?`;
          params.push(before);
        }
        
        query += ` ORDER BY m.created_at DESC LIMIT ?`;
        params.push(limit);
        
        messages = db.prepare(query).all(...params);
      }
      
      // Parse JSON reactions and encryption_data, and reverse to get ASC order
      const parsedMessages = messages.map((m: any) => ({
        ...m,
        reactions: JSON.parse(m.reactions || '[]'),
        encryption_data: m.encryption_data ? JSON.parse(m.encryption_data) : null
      })).reverse();
      
      res.json(parsedMessages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.get('/api/messages/:contactId/media', authenticateToken, (req: any, res) => {
    try {
      const { contactId } = req.params;
      const isGroup = req.query.isGroup === 'true';
      const limit = parseInt(req.query.limit as string) || 50;
      const before = req.query.before as string;
      
      let messages;
      if (isGroup) {
        let query = `
          SELECT m.*
          FROM messages m
          WHERE m.group_id = ? 
          AND (m.content LIKE '%"type":"file"%' OR m.content LIKE '%"type":"link"%' OR m.content LIKE '%http%' OR m.is_media = 1)
        `;
        const params: any[] = [contactId];
        
        if (before) {
          query += ` AND m.created_at < ?`;
          params.push(before);
        }
        
        query += ` ORDER BY m.created_at DESC LIMIT ?`;
        params.push(limit);
        
        messages = db.prepare(query).all(...params);
      } else {
        let query = `
          SELECT m.*
          FROM messages m
          WHERE ((m.sender_id = ? AND m.receiver_id = ?)
             OR (m.sender_id = ? AND m.receiver_id = ?))
          AND (m.content LIKE '%"type":"file"%' OR m.content LIKE '%"type":"link"%' OR m.content LIKE '%http%' OR m.is_media = 1)
        `;
        const params: any[] = [req.user.userId, contactId, contactId, req.user.userId];
        
        if (before) {
          query += ` AND m.created_at < ?`;
          params.push(before);
        }
        
        query += ` ORDER BY m.created_at DESC LIMIT ?`;
        params.push(limit);
        
        messages = db.prepare(query).all(...params);
      }
      
      const parsedMessages = messages.map((m: any) => ({
        ...m,
        encryption_data: m.encryption_data ? JSON.parse(m.encryption_data) : null
      }));
      
      res.json(parsedMessages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reminders
  server.get('/api/reminders', authenticateToken, (req: any, res) => {
    try {
      const reminders = db.prepare(`
        SELECT r.*, 
               CASE WHEN m.id IS NOT NULL THEN json_object(
                 'id', m.id, 'content', m.content, 'sender_id', m.sender_id, 'created_at', m.created_at,
                 'sender_username', u.username, 'sender_first_name', u.first_name, 'sender_last_name', u.last_name,
                 'encryption_data', m.encryption_data, 'group_id', m.group_id
               ) ELSE NULL END as message
        FROM message_reminders r
        LEFT JOIN messages m ON r.message_id = m.id
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE r.user_id = ?
        ORDER BY r.remind_at ASC
      `).all(req.user.userId);

      const parsedReminders = reminders.map((r: any) => ({
        ...r,
        is_pinned: Boolean(r.is_pinned),
        is_dismissed: Boolean(r.is_dismissed),
        message: r.message ? JSON.parse(r.message) : undefined
      }));

      res.json(parsedReminders);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/reminders', authenticateToken, (req: any, res) => {
    try {
      const { chat_id, message_id, remind_at, is_pinned, comment, recurrence, target_user_ids } = req.body;
      
      let targetUserIds = [req.user.userId];
      if (Array.isArray(target_user_ids) && target_user_ids.length > 0) {
        targetUserIds = target_user_ids;
      }
      
      const addedReminders: { id: string, userId: string }[] = [];
      const stmt = db.prepare(`
        INSERT INTO message_reminders (id, user_id, chat_id, message_id, remind_at, is_pinned, comment, recurrence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (const targetUserId of targetUserIds) {
          const id = uuidv4();
          stmt.run(id, targetUserId, chat_id, message_id || '', remind_at, is_pinned ? 1 : 0, comment || null, recurrence || 'none');
          addedReminders.push({ id, userId: targetUserId });
        }
      })();

      let newReminder = null;
      const myReminderObj = addedReminders.find(r => r.userId === req.user.userId);
      
      if (myReminderObj) {
        newReminder = db.prepare(`
          SELECT r.*, 
                 CASE WHEN m.id IS NOT NULL THEN json_object(
                   'id', m.id, 'content', m.content, 'sender_id', m.sender_id, 'created_at', m.created_at,
                   'sender_username', u.username, 'sender_first_name', u.first_name, 'sender_last_name', u.last_name,
                   'encryption_data', m.encryption_data, 'group_id', m.group_id
                 ) ELSE NULL END as message
          FROM message_reminders r
          LEFT JOIN messages m ON r.message_id = m.id
          LEFT JOIN users u ON m.sender_id = u.id
          WHERE r.id = ?
        `).get(myReminderObj.id) as any;

        newReminder.is_pinned = Boolean(newReminder.is_pinned);
        newReminder.is_dismissed = Boolean(newReminder.is_dismissed);
        if (newReminder.message) newReminder.message = JSON.parse(newReminder.message);
      }

      // Notify targeted users to refresh reminders
      for (const targetUserId of targetUserIds) {
        if (targetUserId !== req.user.userId) { // Current user will rely on REST response
          const sockets = connectedUsers.get(targetUserId);
          if (sockets) {
            sockets.forEach(socketId => io.to(socketId).emit('reminders_updated'));
          }
        }
      }

      res.json(newReminder || { success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.delete('/api/reminders/:id', authenticateToken, (req: any, res) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM message_reminders WHERE id = ? AND user_id = ?').run(id, req.user.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.put('/api/reminders/:id', authenticateToken, (req: any, res) => {
    try {
      const { id } = req.params;
      const { remind_at, comment, recurrence } = req.body;
      db.prepare(`
        UPDATE message_reminders 
        SET remind_at = ?, comment = ?, recurrence = ?, is_dismissed = 0 
        WHERE id = ? AND user_id = ?
      `).run(remind_at, comment || null, recurrence || 'none', id, req.user.userId);
      
      const updatedReminder = db.prepare(`
        SELECT r.*, 
               CASE WHEN m.id IS NOT NULL THEN json_object(
                 'id', m.id, 'content', m.content, 'sender_id', m.sender_id, 'created_at', m.created_at,
                 'sender_username', u.username, 'sender_first_name', u.first_name, 'sender_last_name', u.last_name,
                 'encryption_data', m.encryption_data, 'group_id', m.group_id
               ) ELSE NULL END as message
        FROM message_reminders r
        LEFT JOIN messages m ON r.message_id = m.id
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE r.id = ?
      `).get(id) as any;

      if (updatedReminder) {
        updatedReminder.is_pinned = Boolean(updatedReminder.is_pinned);
        updatedReminder.is_dismissed = Boolean(updatedReminder.is_dismissed);
        if (updatedReminder.message) updatedReminder.message = JSON.parse(updatedReminder.message);
      }

      res.json(updatedReminder);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.put('/api/reminders/:id/snooze', authenticateToken, (req: any, res) => {
    try {
      const { id } = req.params;
      const { remind_at } = req.body;
      db.prepare('UPDATE message_reminders SET remind_at = ?, is_dismissed = 0 WHERE id = ? AND user_id = ?').run(remind_at, id, req.user.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.put('/api/reminders/:id/dismiss', authenticateToken, (req: any, res) => {
    try {
      const { id } = req.params;
      const reminder = db.prepare('SELECT * FROM message_reminders WHERE id = ? AND user_id = ?').get(id, req.user.userId) as any;
      
      if (!reminder) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      if (reminder.recurrence && reminder.recurrence !== 'none') {
        const d = new Date(reminder.remind_at);
        if (reminder.recurrence === 'daily') d.setDate(d.getDate() + 1);
        if (reminder.recurrence === 'weekly') d.setDate(d.getDate() + 7);
        if (reminder.recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
        if (reminder.recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);

        db.prepare('UPDATE message_reminders SET remind_at = ?, is_dismissed = 0 WHERE id = ? AND user_id = ?').run(d.toISOString(), id, req.user.userId);
      } else {
        db.prepare('UPDATE message_reminders SET is_dismissed = 1 WHERE id = ? AND user_id = ?').run(id, req.user.userId);
      }
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helper for symmetric chat IDs in private chats
  const getSymmetricChatId = (userId: string, requestedChatId: string) => {
    const isGroup = db.prepare('SELECT id FROM groups WHERE id = ?').get(requestedChatId);
    if (isGroup) return requestedChatId;
    return [userId, requestedChatId].sort().join('_');
  };

  // Pinned Messages
  server.get('/api/chats/:chatId/pinned', authenticateToken, (req: any, res) => {
    try {
      const { chatId } = req.params;
      const actualChatId = getSymmetricChatId(req.user.userId, chatId);
      
      const pinned = db.prepare(`
        SELECT p.*, 
               json_object(
                 'id', m.id, 'content', m.content, 'sender_id', m.sender_id, 'created_at', m.created_at,
                 'sender_username', u.username, 'sender_first_name', u.first_name, 'sender_last_name', u.last_name,
                 'encryption_data', m.encryption_data, 'group_id', m.group_id
               ) as message
        FROM pinned_messages p
        JOIN messages m ON p.message_id = m.id
        JOIN users u ON m.sender_id = u.id
        WHERE p.chat_id = ?
        ORDER BY p.created_at ASC
      `).all(actualChatId);

      const parsedPinned = pinned.map((p: any) => ({
        ...p,
        message: JSON.parse(p.message)
      }));

      res.json(parsedPinned);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/chats/:chatId/pinned', authenticateToken, (req: any, res) => {
    try {
      const { chatId } = req.params;
      const { message_id, snippet } = req.body;
      const id = uuidv4();
      const actualChatId = getSymmetricChatId(req.user.userId, chatId);
      
      db.prepare(`
        INSERT OR IGNORE INTO pinned_messages (id, chat_id, message_id, pinned_by)
        VALUES (?, ?, ?, ?)
      `).run(id, actualChatId, message_id, req.user.userId);

      const isGroup = db.prepare('SELECT id FROM groups WHERE id = ?').get(chatId);
      if (isGroup) {
         const sysMsgId = uuidv4();
         const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.userId) as any;
         
         let contentText = `Пользователь ${user.username} закрепил сообщение`;
         if (snippet) {
           contentText += `: «${snippet}»`;
         }
         
         db.prepare('INSERT INTO messages (id, sender_id, receiver_id, group_id, content, status, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
           sysMsgId, 'system', null, actualChatId, contentText, 'sent', message_id
         );
         const newMsg = {
           id: sysMsgId,
           sender_id: 'system',
           receiver_id: null,
           group_id: actualChatId,
           content: contentText,
           status: 'sent',
           reply_to: message_id,
           encryption_data: null,
           is_edited: false,
           created_at: new Date().toISOString(),
           sender_username: 'System',
           sender_first_name: 'Система',
           sender_last_name: ''
         };
         io.to(`group:${actualChatId}`).emit('message:new', newMsg);
         io.to(`group:${actualChatId}`).emit('pinned_updated', { chatId: actualChatId });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.delete('/api/chats/:chatId/pinned/:messageId', authenticateToken, (req: any, res) => {
    try {
      const { chatId, messageId } = req.params;
      const { snippet } = req.body || {};
      const actualChatId = getSymmetricChatId(req.user.userId, chatId);
      
      db.prepare('DELETE FROM pinned_messages WHERE chat_id = ? AND message_id = ?').run(actualChatId, messageId);

      const isGroup = db.prepare('SELECT id FROM groups WHERE id = ?').get(chatId);
      if (isGroup) {
         const sysMsgId = uuidv4();
         const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.userId) as any;
         
         let contentText = `Пользователь ${user.username} открепил сообщение`;
         if (snippet) {
           contentText += `: «${snippet}»`;
         }
         
         db.prepare('INSERT INTO messages (id, sender_id, receiver_id, group_id, content, status, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
           sysMsgId, 'system', null, actualChatId, contentText, 'sent', messageId
         );
         const newMsg = {
           id: sysMsgId,
           sender_id: 'system',
           receiver_id: null,
           group_id: actualChatId,
           content: contentText,
           status: 'sent',
           reply_to: messageId,
           encryption_data: null,
           is_edited: false,
           created_at: new Date().toISOString(),
           sender_username: 'System',
           sender_first_name: 'Система',
           sender_last_name: ''
         };
         io.to(`group:${actualChatId}`).emit('message:new', newMsg);
         io.to(`group:${actualChatId}`).emit('pinned_updated', { chatId: actualChatId });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/transcribe', authenticateToken, async (req: any, res) => {
    try {
      const { base64Audio, mimeType } = req.body;
      
      const groqApiKey = process.env.GROQ_API_KEY;
      if (groqApiKey) {
        // Use Groq Whisper API (much faster and avoids Gemini regional locks)
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
        
        let customFetch: any;
        if (proxyUrl) {
           let agent;
           if (proxyUrl.startsWith('socks')) {
             agent = new SocksProxyAgent(proxyUrl);
           } else {
             agent = new HttpsProxyAgent(proxyUrl);
           }
           customFetch = (url: any, init: any) => nodeFetch(url as any, { ...init, agent } as any);
        }

        const groq = new Groq({ 
          apiKey: groqApiKey,
          baseURL: process.env.GROQ_BASE_URL,
          fetch: customFetch
        });
        
        const buffer = Buffer.from(base64Audio, 'base64');
        
        let fileObj;
        try {
           fileObj = await toFile(buffer, 'audio.webm', { type: mimeType || 'audio/webm' });
        } catch(e) {
           // Fallback to File constructor if available globally
           fileObj = new File([buffer], 'audio.webm', { type: mimeType || 'audio/webm' });
        }

        const transcription = await groq.audio.transcriptions.create({
          file: fileObj,
          model: "whisper-large-v3",
          prompt: "Please transcribe this audio exactly as spoken.",
          response_format: "json",
          language: "ru", // Hint for Russian
          temperature: 0.0
        });
        
        console.log('Groq transcription response:', transcription.text);
        return res.json({ transcription: transcription.text });
      }

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
         return res.status(500).json({ error: 'Server is missing Gemini API key.' });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Prevent WebM from being treated as video by Gemini which causes "0 Frames found" error
      let safeMimeType = (mimeType || "").split(';')[0];
      if (safeMimeType === 'audio/webm' || safeMimeType === 'video/webm') {
        safeMimeType = 'audio/mp4'; // Send as mp4 to bypass strict video frame checks; ffmpeg backend will probe file format correctly
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { text: "Transcript this audio perfectly in the language it is spoken. Provide only the transcript text." },
            {
              inlineData: {
                data: base64Audio,
                mimeType: safeMimeType
              }
            }
          ]
        }
      });
      
      console.log('Gemini transcription response:', response.text);
      res.json({ transcription: response.text });
    } catch (err: any) {
      console.error('Server transcription error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  server.get('/api/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  server.post('/api/push/subscribe', authenticateToken, (req: any, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    
    try {
      db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
      db.prepare(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) 
        VALUES (?, ?, ?, ?, ?)
      `).run(
        uuidv4(), 
        req.user.userId, 
        endpoint, 
        keys.p256dh, 
        keys.auth
      );
      res.status(201).json({ success: true });
    } catch(err) {
      console.error('Subscription error:', err);
      res.status(500).json({ error: 'Failed to subscribe' });
    }
  });

  server.get('/api/feed', authenticateToken, (req: any, res) => {
    try {
      // Auto-delete expired posts
      db.prepare(`
        DELETE FROM feed_posts 
        WHERE (expires_at IS NOT NULL AND expires_at < datetime('now'))
        OR (expires_at IS NULL AND created_at < datetime('now', '-1 day'))
      `).run();

      const posts = db.prepare(`
        SELECT p.*, u.username, u.first_name, u.last_name, u.avatar_url,
          (SELECT COUNT(*) FROM feed_likes WHERE post_id = p.id) as likes_count,
          (SELECT COUNT(*) FROM feed_comments WHERE post_id = p.id) as comments_count,
          EXISTS(SELECT 1 FROM feed_likes WHERE post_id = p.id AND user_id = ?) as is_liked,
          EXISTS(SELECT 1 FROM feed_views WHERE post_id = p.id AND user_id = ?) as is_viewed
        FROM feed_posts p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
        LIMIT 200
      `).all(req.user.userId, req.user.userId);
      res.json(posts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/feed/:postId/view', authenticateToken, (req: any, res) => {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO feed_views (post_id, user_id) VALUES (?, ?)
      `).run(req.params.postId, req.user.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/feed', authenticateToken, (req: any, res) => {
    try {
      const { content, media_url, media_type, media_width, media_height, duration_hours = 24 } = req.body;
      const id = uuidv4();
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + Number(duration_hours));

      db.prepare(`
        INSERT INTO feed_posts (id, user_id, content, media_url, media_type, media_width, media_height, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.user.userId, content || '', media_url || null, media_type || null, media_width || null, media_height || null, expiresAt.toISOString());
      
      const post = db.prepare(`
        SELECT p.*, u.username, u.first_name, u.last_name, u.avatar_url,
          0 as likes_count, 0 as comments_count, 0 as is_liked
        FROM feed_posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `).get(id);
      
      io.emit('feed:new_post', post);
      res.json(post);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.delete('/api/feed/:id', authenticateToken, (req: any, res) => {
    const postId = req.params.id;
    try {
      const post: any = db.prepare('SELECT user_id FROM feed_posts WHERE id = ?').get(postId);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      if (post.user_id !== req.user.userId) {
        return res.status(403).json({ error: 'Unauthorized to delete this post' });
      }
      db.prepare('DELETE FROM feed_posts WHERE id = ?').run(postId);
      io.emit('feed:post_deleted', { postId });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  });

  server.post('/api/feed/:id/like', authenticateToken, (req: any, res) => {
    try {
      const postId = req.params.id;
      const existing = db.prepare('SELECT 1 FROM feed_likes WHERE post_id = ? AND user_id = ?').get(postId, req.user.userId);
      
      if (existing) {
        db.prepare('DELETE FROM feed_likes WHERE post_id = ? AND user_id = ?').run(postId, req.user.userId);
      } else {
        db.prepare('INSERT INTO feed_likes (post_id, user_id) VALUES (?, ?)').run(postId, req.user.userId);
      }
      io.emit('feed:like_update', { postId, userId: req.user.userId, isLiked: !existing });
      res.json({ liked: !existing });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.get('/api/feed/:id/comments', authenticateToken, (req: any, res) => {
    try {
      const comments = db.prepare(`
        SELECT c.*, u.username, u.first_name, u.last_name, u.avatar_url
        FROM feed_comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
      `).all(req.params.id);
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  server.post('/api/feed/:id/comments', authenticateToken, (req: any, res) => {
    try {
      const { content } = req.body;
      const postId = req.params.id;
      const id = uuidv4();
      
      db.prepare(`
        INSERT INTO feed_comments (id, post_id, user_id, content)
        VALUES (?, ?, ?, ?)
      `).run(id, postId, req.user.userId, content);
      
      const comment = db.prepare(`
        SELECT c.*, u.username, u.first_name, u.last_name, u.avatar_url
        FROM feed_comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `).get(id);
      
      io.emit('feed:new_comment', { postId, comment });
      res.json(comment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

 // Fallback for Share Target if Service Worker is not active or hasn't intercepted the POST
  server.post('/share-target', upload.any(), (req, res) => {
    let redirectUrl = '/?shared=true';
    const params = new URLSearchParams();
    if (req.body.text) params.append('text', req.body.text);
    if (req.body.title) params.append('title', req.body.title);
    if (req.body.url) params.append('url', req.body.url);
    if (params.toString()) {
      redirectUrl += '&' + params.toString();
    }
    res.redirect(redirectUrl);
  });

}
