import jwt from 'jsonwebtoken';
import db from './db';

export const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';

// Middleware for protected routes
export const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    
    // Check if session exists in db
    try {
      const session = db.prepare('SELECT id FROM sessions WHERE token = ?').get(token);
      if (!session) return res.sendStatus(401); // Session revoked or not found
      
      // Update last active
      db.prepare('UPDATE sessions SET last_active = CURRENT_TIMESTAMP WHERE token = ?').run(token);
    } catch (e) {
      console.error('Session check error', e);
    }

    req.user = user;
    req.token = token;
    next();
  });
};
