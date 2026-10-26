import { describe, it, expect } from 'vitest';
import { daysInMonth, pageCount, pageDays, pageOfDay, toIso, fromIso, isFuture, longDate, WEEKDAYS } from './dateLogic.js';

describe('tear-off calendar date picker', () => {
  it('knows the length of every month, leap years too', () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2023, 1)).toBe(28);
    expect(daysInMonth(1900, 1)).toBe(28); // not a leap year
    expect(daysInMonth(2000, 1)).toBe(29);
    expect(daysInMonth(2024, 2)).toBe(31);
  });
  it('shows 7 days per page, each day of the week exactly once', () => {
    for (let p = 0; p < 4; p++) {
      const days = pageDays(2024, 2, p);
      expect(days).toHaveLength(7);
      expect(new Set(days.map((d) => d.weekday)).size).toBe(7);
    }
    expect(pageDays(2024, 2, 4).map((d) => d.day)).toEqual([29, 30, 31]);
    expect(pageCount(2024, 2)).toBe(5);
    expect(pageCount(2023, 1)).toBe(4);
    expect(pageOfDay(25)).toBe(3);
  });
  it('gets the weekday right (25 March 2024 was a Monday, like in the picture)', () => {
    expect(WEEKDAYS[pageDays(2024, 2, 3).find((d) => d.day === 25).weekday]).toBe('MO');
    expect(longDate(2024, 2, 25)).toBe('Monday, 25 March 2024');
  });
  it('turns dates into YYYY-MM-DD and back, refusing impossible dates', () => {
    expect(toIso(2010, 0, 5)).toBe('2010-01-05');
    expect(fromIso('2010-01-05')).toEqual({ year: 2010, month: 0, day: 5 });
    expect(fromIso('2023-02-29')).toBeNull();
    expect(fromIso('hello')).toBeNull();
  });
  it('a birth date cannot be in the future', () => {
    const today = new Date(2026, 9, 26);
    expect(isFuture(2026, 9, 27, today)).toBe(true);
    expect(isFuture(2026, 9, 26, today)).toBe(false);
    expect(isFuture(2010, 5, 1, today)).toBe(false);
  });
});
