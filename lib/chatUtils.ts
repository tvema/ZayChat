import { CUSTOM_EMOJIS } from './chatComponents';

export const isOnlyEmojis = (text: string) => {
  if (!text) return false;
  let remainingText = text;
  
  for (const ce of CUSTOM_EMOJIS) {
    remainingText = remainingText.split(`:${ce}:`).join('');
  }
  
  remainingText = remainingText.replace(/\s/g, '');
  if (remainingText === '') return true;
  
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u;
  return emojiRegex.test(remainingText);
};

export const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: w, naturalHeight: h } = img;
      const MAX_DIM = 1920;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round(h * (MAX_DIM / w)); w = MAX_DIM; }
        else { w = Math.round(w * (MAX_DIM / h)); h = MAX_DIM; }
      } else {
        // Even if smaller, we might want to re-encode to WEBP to save space
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      
      canvas.toBlob((blob) => {
        if (!blob) return resolve(file);
        const newName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
        const newFile = new File([blob], newName, { type: 'image/webp', lastModified: Date.now() });
        // If the new file is somehow larger than the original, stick to the original
        if (newFile.size < file.size || w < img.naturalWidth) {
           resolve(newFile);
        } else {
           resolve(file);
        }
      }, 'image/webp', 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
};

export const generateImageMetadata = (file: File): Promise<{ width: number, height: number, thumbnail?: string }> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      const MAX_DIM = 400;
      let thumbW = width;
      let thumbH = height;
      if (thumbW > thumbH) {
        if (thumbW > MAX_DIM) {
          thumbH *= MAX_DIM / thumbW;
          thumbW = MAX_DIM;
        }
      } else {
        if (thumbH > MAX_DIM) {
          thumbW *= MAX_DIM / thumbH;
          thumbH = MAX_DIM;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = thumbW;
      canvas.height = thumbH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
         ctx.drawImage(img, 0, 0, thumbW, thumbH);
         // good compression webp for poster
         const thumbnail = canvas.toDataURL('image/webp', 0.5);
         resolve({ width, height, thumbnail });
      } else {
         resolve({ width, height });
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
};

export const generateVideoMetadata = (file: File): Promise<{ width: number, height: number, thumbnail?: string }> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('video/')) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ width: 0, height: 0 }); // Fallback on timeout
      }
    }, 5000); // 5 seconds max

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      // Seek to extract thumbnail
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };

    video.onseeked = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      const MAX_DIM = 400; // Make this a real poster frame
      let thumbW = width;
      let thumbH = height;
      if (thumbW > thumbH) {
        if (thumbW > MAX_DIM) {
          thumbH *= MAX_DIM / thumbW;
          thumbW = MAX_DIM;
        }
      } else {
        if (thumbH > MAX_DIM) {
          thumbW *= MAX_DIM / thumbH;
          thumbH = MAX_DIM;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, thumbW);
      canvas.height = Math.max(1, thumbH);
      const ctx = canvas.getContext('2d');
      if (ctx) {
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
         const thumbnail = canvas.toDataURL('image/webp', 0.5);
         cleanup();
         resolve({ width, height, thumbnail });
      } else {
         cleanup();
         resolve({ width, height });
      }
    };

    video.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        cleanup();
        resolve({ width: 0, height: 0 });
      }
    };

    video.src = url;
    video.load();
  });
};

export const renderMessageText = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts;
};

export const formatLastSeen = (lastSeen: string, t: any) => {
  if (!lastSeen) return t('common.notAvailable');
  
  // Handle SQLite's default CURRENT_TIMESTAMP format (YYYY-MM-DD HH:MM:SS)
  // by converting it to a format that Date() can parse reliably (YYYY-MM-DDTHH:MM:SSZ)
  let normalizedLastSeen = lastSeen;
  if (lastSeen.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
    normalizedLastSeen = lastSeen.replace(' ', 'T') + 'Z';
  }

  const date = new Date(normalizedLastSeen);
  if (isNaN(date.getTime())) return t('common.notAvailable');
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return t('chat.justNow');
  if (minutes < 60) return t('chat.minutesAgo', { count: minutes });
  if (hours < 24) return t('chat.hoursAgo', { count: hours });
  if (days < 7) return t('chat.daysAgo', { count: days });
  return date.toLocaleDateString();
};
