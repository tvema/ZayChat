// lib/crypto.ts

// Helper to convert ArrayBuffer to Base64 string
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 string to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive an AES-GCM key from a password using PBKDF2
export async function deriveKeyFromPassword(password: string, salt: Uint8Array | BufferSource): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Generate an RSA-OAEP key pair for E2EE
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
}

// Export a CryptoKey to a Base64 string (JWK format)
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('jwk', key);
  return btoa(JSON.stringify(exported));
}

// Import a Base64 string (JWK format) to a CryptoKey
export async function importKey(keyStr: string, type: 'public' | 'private'): Promise<CryptoKey> {
  const jwk = JSON.parse(atob(keyStr));
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    type === 'public' ? ['encrypt'] : ['decrypt']
  );
}

// Encrypt the private key with the user's password-derived AES key
export async function encryptPrivateKeyWithPassword(privateKey: CryptoKey, password: string): Promise<{ encrypted: string, iv: string, salt: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const passwordKey = await deriveKeyFromPassword(password, salt);
  
  const exportedPrivate = await window.crypto.subtle.exportKey('pkcs8', privateKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    passwordKey,
    exportedPrivate
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
    salt: arrayBufferToBase64(salt.buffer)
  };
}

// Decrypt the private key using the password
export async function decryptPrivateKeyWithPassword(encryptedData: { encrypted: string, iv: string, salt: string }, password: string): Promise<CryptoKey> {
  const salt = base64ToArrayBuffer(encryptedData.salt);
  const iv = base64ToArrayBuffer(encryptedData.iv);
  const encryptedBytes = base64ToArrayBuffer(encryptedData.encrypted);
  
  const passwordKey = await deriveKeyFromPassword(password, new Uint8Array(salt));
  
  const decryptedBytes = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv)
    },
    passwordKey,
    encryptedBytes
  );

  return window.crypto.subtle.importKey(
    'pkcs8',
    decryptedBytes,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  );
}

// Encrypt a string with an AES-GCM key
export async function encryptText(text: string, aesKey: CryptoKey, iv: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource
    },
    aesKey,
    enc.encode(text)
  );
  return arrayBufferToBase64(encryptedBuffer);
}

// Decrypt a string with an AES-GCM key
export async function decryptText(encryptedTextBase64: string, aesKey: CryptoKey, iv: Uint8Array): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedTextBase64);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource
    },
    aesKey,
    encryptedBuffer
  );
  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}

// Encrypt a file (ArrayBuffer) with a random or provided AES-GCM key
export async function encryptFile(fileBuffer: ArrayBuffer, providedAesKey?: CryptoKey, providedIv?: Uint8Array): Promise<{ encryptedFile: Blob, aesKey: CryptoKey, iv: Uint8Array }> {
  const aesKey = providedAesKey || await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = providedIv || window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource
    },
    aesKey,
    fileBuffer
  );

  return {
    encryptedFile: new Blob([encryptedBuffer]),
    aesKey,
    iv
  };
}

// Decrypt a file (ArrayBuffer) with an AES-GCM key
export async function decryptFile(encryptedBuffer: ArrayBuffer, aesKey: CryptoKey, iv: Uint8Array): Promise<Blob> {
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource
    },
    aesKey,
    encryptedBuffer
  );

  return new Blob([decryptedBuffer]);
}

// Encrypt the AES key with the recipient's RSA public key
export async function encryptAESKeyWithRSA(aesKey: CryptoKey, rsaPublicKey: CryptoKey): Promise<string> {
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP'
    },
    rsaPublicKey,
    rawAesKey
  );
  return arrayBufferToBase64(encryptedKey);
}

// Decrypt the AES key with our RSA private key
export async function decryptAESKeyWithRSA(encryptedAesKeyBase64: string, rsaPrivateKey: CryptoKey): Promise<CryptoKey> {
  const encryptedBytes = base64ToArrayBuffer(encryptedAesKeyBase64);
  const rawAesKey = await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP'
    },
    rsaPrivateKey,
    encryptedBytes
  );
  
  return window.crypto.subtle.importKey(
    'raw',
    rawAesKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}
