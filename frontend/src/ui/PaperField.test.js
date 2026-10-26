import { describe, it, expect } from 'vitest';
import { stampText } from './stampText.js';

describe('paper-strip stamp', () => {
  it('stamps exactly what was written', () => {
    expect(stampText('Ana Maria')).toBe('Ana Maria');
    expect(stampText('ana@example.com')).toBe('ana@example.com');
  });
  it('a hidden password is stamped as dots, one per character (emoji count once)', () => {
    expect(stampText('secret12', { password: true })).toBe('••••••••');
    expect(stampText('ab🎂', { password: true })).toBe('•••');
  });
  it('a shown password is stamped as it is', () => {
    expect(stampText('secret12', { password: true, show: true })).toBe('secret12');
  });
});
