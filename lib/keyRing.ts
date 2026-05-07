import { safeLocalStorage } from '@/lib/safeStorage';
import { importKey, decryptAESKeyWithRSA } from '@/lib/crypto';

class KeyRing {
  private rsaPrivateKey: CryptoKey | null = null;
  private rsaPrivateKeyPromise: Promise<CryptoKey> | null = null;
  
  // Cache key: raw encrypted AES key (base64) -> CryptoKey
  private aesKeyCache: Map<string, CryptoKey> = new Map();
  private aesKeyPromises: Map<string, Promise<CryptoKey>> = new Map();

  /**
   * Returns the user's RSA private key.
   * Parses the key from safeLocalStorage only once and caches it in memory.
   */
  async getPrivateKey(): Promise<CryptoKey | null> {
    if (this.rsaPrivateKey) return this.rsaPrivateKey;
    if (this.rsaPrivateKeyPromise) return this.rsaPrivateKeyPromise;

    if (typeof window === 'undefined') return null;
    
    const privateKeyJwk = safeLocalStorage.getItem('e2e_private_key');
    if (!privateKeyJwk) return null;

    this.rsaPrivateKeyPromise = importKey(privateKeyJwk, 'private').then(async key => {
      this.rsaPrivateKey = key;
      // Sync to IndexedDB for Service Worker access
      try {
        const { saveKeyToIDB } = await import('@/lib/db');
        await saveKeyToIDB('e2e_private_key', privateKeyJwk);
      } catch (e) {
        console.error("Failed to sync private key to IDB", e);
      }
      return key;
    }).catch(err => {
      console.error("Failed to parse RSA private key", err);
      this.rsaPrivateKeyPromise = null;
      throw err;
    });

    return this.rsaPrivateKeyPromise;
  }

  /**
   * Returns the decrypted AES key.
   * Memoizes the RSA decryption process so an identical AES key
   * is only decrypted once.
   */
  async getAesKey(encryptedAesKeyBase64: string): Promise<CryptoKey | null> {
    if (this.aesKeyCache.has(encryptedAesKeyBase64)) {
      return this.aesKeyCache.get(encryptedAesKeyBase64)!;
    }
    
    if (this.aesKeyPromises.has(encryptedAesKeyBase64)) {
      return this.aesKeyPromises.get(encryptedAesKeyBase64)!;
    }

    const promise = (async () => {
      const privateKey = await this.getPrivateKey();
      if (!privateKey) throw new Error("Private key not found");
      const aesKey = await decryptAESKeyWithRSA(encryptedAesKeyBase64, privateKey);
      this.aesKeyCache.set(encryptedAesKeyBase64, aesKey);
      return aesKey;
    })();

    this.aesKeyPromises.set(encryptedAesKeyBase64, promise);
    
    try {
      return await promise;
    } finally {
      this.aesKeyPromises.delete(encryptedAesKeyBase64);
    }
  }

  clear() {
    this.rsaPrivateKey = null;
    this.rsaPrivateKeyPromise = null;
    this.aesKeyCache.clear();
    this.aesKeyPromises.clear();
  }
}

export const keyRing = new KeyRing();
