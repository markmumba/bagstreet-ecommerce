import { describe, expect, test } from 'bun:test';
import { formatDate, formatMoney, nairobiDay } from './format';

const plain = (s: string) => s.replace(/\s/g, ' ');

describe('admin formatting', () => {
  test('money is always KES with thousands separators', () => {
    expect(plain(formatMoney(8900))).toBe('KES 8,900.00');
    expect(plain(formatMoney(8900, { whole: true }))).toBe('KES 8,900');
  });
  test('dates are Kenyan style', () => {
    expect(formatDate('2026-10-17T09:00:00Z')).toBe('17 Oct 2026');
  });
  test('just after midnight in Nairobi is already the next day', () => {
    // 21:30 UTC on the 16th is 00:30 on the 17th in Nairobi.
    expect(nairobiDay('2026-10-16T21:30:00Z')).toBe('2026-10-17');
  });
});
