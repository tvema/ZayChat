import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Setup Database
const db = new Database('chat.db');
db.pragma('journal_mode = WAL');

console.log('Initializing database schema...');
// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    public_key TEXT,
    encrypted_private_key TEXT,
    invited_by TEXT,
    last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    email_verified INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    sender_id TEXT NOT NULL,
    is_used INTEGER DEFAULT 0,
    used_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    user_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, contact_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT,
    group_id TEXT,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    reply_to TEXT,
    forwarded_from TEXT,
    encryption_data TEXT,
    is_edited BOOLEAN DEFAULT 0,
    is_media BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    creator_id TEXT NOT NULL,
    current_key_version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    last_read_at TEXT DEFAULT CURRENT_TIMESTAMP,
    encrypted_keys TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS contact_circles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    do_not_disturb INTEGER DEFAULT 0,
    is_hidden INTEGER DEFAULT 0,
    is_blacklist INTEGER DEFAULT 0,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contact_circle_members (
    circle_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    PRIMARY KEY (circle_id, contact_id)
  );

  CREATE TABLE IF NOT EXISTS message_reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    remind_at DATETIME NOT NULL,
    is_pinned INTEGER DEFAULT 1,
    is_dismissed INTEGER DEFAULT 0,
    comment TEXT,
    recurrence TEXT DEFAULT 'none',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pinned_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    pinned_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, message_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS feed_posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT,
    media_url TEXT,
    media_type TEXT,
    media_width INTEGER,
    media_height INTEGER,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS feed_likes (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS feed_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS feed_views (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id)
  );
`);

console.log('Checking for migrations...');
// Helper to ensure a column exists in a table
function ensureColumnExists(tableName: string, columnName: string, columnDef: string) {
  try {
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    const exists = tableInfo.some(c => c.name === columnName);
    if (!exists) {
      console.log(`Migration: Adding ${columnName} column to ${tableName} table...`);
      const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`;
      console.log(`Executing: ${sql}`);
      db.prepare(sql).run();
      console.log(`Migration: Successfully added ${columnName} to ${tableName}`);
    }
  } catch (e: any) {
    console.error(`Migration: Failed to add ${columnName} column to ${tableName}:`, e.message);
  }
}

// Define the expected schema for all tables
const expectedSchema: Record<string, Record<string, string>> = {
  users: {
    id: 'TEXT PRIMARY KEY',
    username: 'TEXT UNIQUE NOT NULL',
    first_name: 'TEXT NOT NULL',
    last_name: 'TEXT NOT NULL',
    email: 'TEXT UNIQUE NOT NULL',
    phone: 'TEXT NOT NULL',
    password_hash: 'TEXT NOT NULL',
    avatar_url: 'TEXT',
    public_key: 'TEXT',
    encrypted_private_key: 'TEXT',
    invited_by: 'TEXT',
    last_seen: 'TEXT',
    created_at: 'TEXT DEFAULT CURRENT_TIMESTAMP',
    bio: 'TEXT',
    email_verified: 'INTEGER DEFAULT 0'
  },
  invites: {
    id: 'TEXT PRIMARY KEY',
    code: 'TEXT UNIQUE NOT NULL',
    sender_id: 'TEXT NOT NULL',
    is_used: 'INTEGER DEFAULT 0',
    used_by: 'TEXT',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  contacts: {
    user_id: 'TEXT NOT NULL',
    contact_id: 'TEXT NOT NULL',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
    is_pinned: 'INTEGER DEFAULT 0',
    circle_type: 'TEXT DEFAULT "normal"'
  },
  messages: {
    id: 'TEXT PRIMARY KEY',
    sender_id: 'TEXT NOT NULL',
    receiver_id: 'TEXT',
    group_id: 'TEXT',
    content: 'TEXT NOT NULL',
    status: 'TEXT DEFAULT "sent"',
    reply_to: 'TEXT',
    forwarded_from: 'TEXT',
    encryption_data: 'TEXT',
    is_edited: 'BOOLEAN DEFAULT 0',
    is_deleted: 'BOOLEAN DEFAULT 0',
    is_media: 'BOOLEAN DEFAULT 0',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  groups: {
    id: 'TEXT PRIMARY KEY',
    name: 'TEXT NOT NULL',
    description: 'TEXT',
    avatar_url: 'TEXT',
    creator_id: 'TEXT NOT NULL DEFAULT "system"',
    current_key_version: 'INTEGER DEFAULT 1',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  group_members: {
    group_id: 'TEXT NOT NULL',
    user_id: 'TEXT NOT NULL',
    role: 'TEXT DEFAULT "member"',
    last_read_at: 'TEXT DEFAULT CURRENT_TIMESTAMP',
    encrypted_keys: 'TEXT',
    joined_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  reactions: {
    id: 'TEXT PRIMARY KEY',
    message_id: 'TEXT NOT NULL',
    user_id: 'TEXT NOT NULL',
    emoji: 'TEXT NOT NULL',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  contact_circles: {
    id: 'TEXT PRIMARY KEY',
    user_id: 'TEXT NOT NULL',
    name: 'TEXT NOT NULL',
    do_not_disturb: 'INTEGER DEFAULT 0',
    is_hidden: 'INTEGER DEFAULT 0',
    is_blacklist: 'INTEGER DEFAULT 0',
    password_hash: 'TEXT',
    color: 'TEXT',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  contact_circle_members: {
    circle_id: 'TEXT NOT NULL',
    contact_id: 'TEXT NOT NULL'
  },
  message_reminders: {
    id: 'TEXT PRIMARY KEY',
    user_id: 'TEXT NOT NULL',
    chat_id: 'TEXT NOT NULL',
    message_id: 'TEXT NOT NULL',
    remind_at: 'DATETIME NOT NULL',
    is_pinned: 'INTEGER DEFAULT 1',
    is_dismissed: 'INTEGER DEFAULT 0',
    comment: 'TEXT',
    recurrence: "TEXT DEFAULT 'none'",
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  pinned_messages: {
    id: 'TEXT PRIMARY KEY',
    chat_id: 'TEXT NOT NULL',
    message_id: 'TEXT NOT NULL',
    pinned_by: 'TEXT NOT NULL',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  sessions: {
    id: 'TEXT PRIMARY KEY',
    user_id: 'TEXT NOT NULL',
    token: 'TEXT NOT NULL',
    device_info: 'TEXT',
    ip_address: 'TEXT',
    last_active: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  push_subscriptions: {
    id: 'TEXT PRIMARY KEY',
    user_id: 'TEXT NOT NULL',
    endpoint: 'TEXT NOT NULL',
    p256dh: 'TEXT NOT NULL',
    auth: 'TEXT NOT NULL',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  feed_posts: {
    id: 'TEXT PRIMARY KEY',
    user_id: 'TEXT NOT NULL',
    content: 'TEXT',
    media_url: 'TEXT',
    media_type: 'TEXT',
    media_width: 'INTEGER',
    media_height: 'INTEGER',
    expires_at: 'DATETIME',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  feed_likes: {
    post_id: 'TEXT NOT NULL',
    user_id: 'TEXT NOT NULL',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  feed_comments: {
    id: 'TEXT PRIMARY KEY',
    post_id: 'TEXT NOT NULL',
    user_id: 'TEXT NOT NULL',
    content: 'TEXT NOT NULL',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  },
  feed_views: {
    post_id: 'TEXT NOT NULL',
    user_id: 'TEXT NOT NULL',
    created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
  }
};

// Migration: Fix messages table if receiver_id is NOT NULL
try {
  const tableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
  const receiverIdCol = tableInfo.find(c => c.name === 'receiver_id');
  if (receiverIdCol && receiverIdCol.notnull === 1) {
    console.log('Migrating messages table to make receiver_id nullable...');
    db.transaction(() => {
      // 1. Create new table with correct schema
      db.exec(`
        CREATE TABLE messages_new (
          id TEXT PRIMARY KEY,
          sender_id TEXT NOT NULL,
          receiver_id TEXT,
          group_id TEXT,
          content TEXT NOT NULL,
          status TEXT DEFAULT 'sent',
          reply_to TEXT,
          forwarded_from TEXT,
          is_edited BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Copy data
      const existingColumnNames = tableInfo.map(c => c.name);
      const targetColumns = ['id', 'sender_id', 'receiver_id', 'group_id', 'content', 'status', 'reply_to', 'forwarded_from', 'is_edited', 'created_at'];
      const commonColumns = targetColumns.filter(c => existingColumnNames.includes(c));
      const colList = commonColumns.join(', ');
      
      db.exec(`INSERT INTO messages_new (${colList}) SELECT ${colList} FROM messages;`);

      // 3. Replace old table
      db.exec(`DROP TABLE messages;`);
      db.exec(`ALTER TABLE messages_new RENAME TO messages;`);
    })();
    console.log('Migration successful: messages.receiver_id is now nullable.');
  }
} catch (err) {
  console.error('Migration failed:', err);
}

// Automatically check and add missing columns for all tables
console.log('Verifying database schema and adding missing columns...');
for (const [tableName, columns] of Object.entries(expectedSchema)) {
  for (const [columnName, columnDef] of Object.entries(columns)) {
    // Skip primary keys as they are created with the table
    if (columnDef.includes('PRIMARY KEY') && !columnDef.includes('TEXT PRIMARY KEY')) continue;
    ensureColumnExists(tableName, columnName, columnDef);
  }
}

// Create initial invite if no invites exist
const inviteCount = db.prepare('SELECT COUNT(*) as count FROM invites').get() as { count: number };
if (inviteCount.count === 0) {
  const initialCode = 'WELCOME2026';
  db.prepare('INSERT INTO invites (id, code, sender_id) VALUES (?, ?, ?)').run(uuidv4(), initialCode, 'system');
  console.log(`Initial invite code created: ${initialCode}`);
}

// Create initial user if not exists
const rootUsername = process.env.ROOT_USERNAME || 'zaqc';
const adminUser = db.prepare('SELECT * FROM users WHERE username = ?').get(rootUsername);
if (!adminUser) {
  const passwordHash = bcrypt.hashSync(process.env.ROOT_PASSWORD || 'zaqc123', 10);
  const firstName = process.env.ROOT_FIRST_NAME || 'Admin';
  const lastName = process.env.ROOT_LAST_NAME || 'User';
  const email = process.env.ROOT_EMAIL || 'admin@zstate.ru';
  const phone = process.env.ROOT_PHONE || '+1234567890';
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, username, first_name, last_name, email, phone, password_hash, invited_by, email_verified, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), rootUsername, firstName, lastName, email, phone, passwordHash, 'system', 1, now, now);
  console.log(`Initial root user ${rootUsername} created.`);
}

// Ensure 'system' user exists for system messages
const sysUser = db.prepare('SELECT id FROM users WHERE id = ?').get('system');
if (!sysUser) {
  db.prepare(`
    INSERT INTO users (id, username, first_name, last_name, email, phone, password_hash, invited_by, email_verified)
    VALUES ('system', 'System', 'Система', '', 'system@local.system', '000000000', '', 'system', 1)
  `).run();
}

console.log('Database initialization complete.');
export default db;
