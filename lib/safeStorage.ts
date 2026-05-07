class SafeStorage {
  private memoryStorage = new Map<string, string>();
  private type: 'localStorage' | 'sessionStorage';
  private isAvailable: boolean | null = null;

  constructor(type: 'localStorage' | 'sessionStorage') {
    this.type = type;
  }

  private checkAvailability(): boolean {
    if (this.isAvailable !== null) return this.isAvailable;
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const storage = window[this.type];
      const x = '__storage_test__';
      storage.setItem(x, x);
      storage.removeItem(x);
      this.isAvailable = true;
      return true;
    } catch (e) {
      this.isAvailable = false;
      return false;
    }
  }

  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    if (this.checkAvailability()) {
      try { return window[this.type].getItem(key); } catch(e) { return this.memoryStorage.get(key) || null; }
    }
    return this.memoryStorage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    this.memoryStorage.set(key, value);
    if (this.checkAvailability()) {
      try { window[this.type].setItem(key, value); } catch(e) {}
    }
  }

  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    this.memoryStorage.delete(key);
    if (this.checkAvailability()) {
      try { window[this.type].removeItem(key); } catch(e) {}
    }
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    this.memoryStorage.clear();
    if (this.checkAvailability()) {
      try { window[this.type].clear(); } catch(e) {}
    }
  }
}

export const safeLocalStorage = new SafeStorage('localStorage');
export const safeSessionStorage = new SafeStorage('sessionStorage');
