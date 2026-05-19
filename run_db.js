const db = require('better-sqlite3')('chat.db');
const res = db.prepare(`SELECT substr(content, 1, 30) as c, is_media, encryption_data IS NOT NULL as enc FROM messages WHERE content LIKE '%type%file%' LIMIT 5`).all();
console.log(res);
