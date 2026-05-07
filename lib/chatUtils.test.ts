import { describe, it, expect } from 'vitest';
import { isOnlyEmojis } from './chatUtils';

describe('chatUtils', () => {
  describe('isOnlyEmojis', () => {
    it('returns true for a single emoji', () => {
      expect(isOnlyEmojis('😀')).toBe(true);
    });

    it('returns true for multiple emojis with spaces', () => {
      expect(isOnlyEmojis('😀 😃 😄')).toBe(true);
    });

    it('returns false for mixed text and emojis', () => {
      expect(isOnlyEmojis('Hello 😀')).toBe(false);
    });

    it('returns false for plain text', () => {
      expect(isOnlyEmojis('Hello world')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isOnlyEmojis('')).toBe(false); // Depends on implementation, wait \p{Emoji_Presentation} with + means at least one.
    });
  });
});
