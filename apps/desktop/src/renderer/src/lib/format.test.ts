import { describe, expect, it } from 'vitest';
import { formatDuration, formatTime, relativeDate } from './format';

describe('format', () => {
  it('formats timecodes and durations', () => {
    expect(formatTime(65_500)).toBe('1:05');
    expect(formatTime(1500, true, 30)).toBe('0:01:15');
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(3_725_000)).toBe('1h 2m');
    expect(relativeDate(new Date(0).toISOString(), 30_000)).toBe('just now');
  });
});
