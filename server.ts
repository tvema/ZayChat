import { parse } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import next from 'next';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// 1. Manually load env files because this is a custom server entry point
// and we want variables available immediately for our Node backend
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}
if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

import { setupRoutes } from './server/routes';
import { setupSocket } from './server/socket';
import { uploadDir } from './server/upload';
import './server/db'; // Ensure DB is initialized

console.log('Starting server.ts...');
console.log('Node version:', process.version);
console.log('NODE_ENV:', process.env.NODE_ENV);

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = 3000;

console.log('Preparing Next.js app...');
app.prepare().then(() => {
  console.log('Next.js app prepared successfully.');
  const server = express();
  const httpServer = createServer(server);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  console.log('Setting up Express middleware...');
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ limit: '50mb', extended: true }));
  // Serve static files from public folder (sw.js, manifest.json, etc.)
  server.use(express.static(path.join(process.cwd(), 'public')));
  server.use('/uploads', express.static(uploadDir));

  const connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  console.log('Setting up routes and socket...');
  // Setup Routes
  setupRoutes(server, io, connectedUsers);

  console.log('Setting up socket.io handlers...');
  // Setup Socket.io
  setupSocket(io, connectedUsers);

  // API Global Error Handler to always send JSON instead of HTML
  server.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Express API Error:', err);
    res.status(500).json({ error: `Внутренняя ошибка сервера: ${err.message}` });
  });

  console.log('Setting up Next.js catch-all route...');
  // Next.js request handling
  server.all(/.*/, (req, res) => {
    handle(req, res);
  });

  console.log(`Starting HTTP server on port ${port}...`);
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
}).catch(err => {
  console.error('CRITICAL: Next.js failed to prepare', err);
  process.exit(1);
});
