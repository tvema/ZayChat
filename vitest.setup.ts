import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Web Crypto API for tests
if (typeof crypto.subtle === 'undefined') {
  Object.defineProperty(window.crypto, 'subtle', {
    value: {
      generateKey: vi.fn(),
      exportKey: vi.fn(),
      importKey: vi.fn(),
      encrypt: vi.fn(),
      decrypt: vi.fn(),
    },
    writable: true,
  });
}
