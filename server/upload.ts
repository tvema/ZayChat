import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Multer setup for avatars and files
export const uploadDir = path.join(process.cwd(), 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    let originalName = file.originalname;
    try {
      originalName = decodeURIComponent(originalName);
    } catch(e) {
      try {
        originalName = Buffer.from(originalName, 'latin1').toString('utf8');
      } catch (e2) {}
    }
    cb(null, 'file-' + uniqueSuffix + path.extname(originalName));
  }
});

export const upload = multer({ storage: storage });
