import { describe, expect, it } from 'vitest';
import { nextDelayMs } from '../src/sidepanel/monitorTiming';

describe('nextDelayMs', () => {
  it('keeps start-to-start spacing and never less than 1 s after a slow cycle', () => {
    expect(nextDelayMs(10, 3000, 0)).toBe(7000);
    expect(nextDelayMs(10, 15_000, 0)).toBe(1000); // model slower than the interval: slow down, no overlap
  });

  it('doubles after consecutive failures, capped at 60 s', () => {
    expect(nextDelayMs(5, 0, 1)).toBe(10_000);
    expect(nextDelayMs(5, 0, 2)).toBe(20_000);
    expect(nextDelayMs(5, 0, 10)).toBe(60_000);
    expect(nextDelayMs(60, 0, 3)).toBe(60_000);
  });
});
