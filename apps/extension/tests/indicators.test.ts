import { describe, expect, it } from 'vitest';
import { ema, macd, rsi } from '../src/signals/indicators';

// Reference values below were worked out by hand (fractions shown) and are not taken from this code.

describe('ema', () => {
  it('seeds with the SMA, then applies k = 2 / (period + 1)', () => {
    // period 3, k = 1/2: seed (1+2+3)/3 = 2; then (4+2)/2 = 3, (5+3)/2 = 4, (6+4)/2 = 5
    expect(ema([1, 2, 3, 4, 5, 6], 3)).toEqual([null, null, 2, 3, 4, 5]);
  });

  it('skips leading nulls before seeding', () => {
    expect(ema([null, null, 2, 4, 6], 2)).toEqual([null, null, null, 3, 5]); // k = 2/3: 6*2/3 + 3/3 = 5
  });

  it('returns all nulls when there are fewer values than the period', () => {
    expect(ema([1, 2], 3)).toEqual([null, null]);
  });
});

describe('rsi (Wilder)', () => {
  it('matches a hand-computed period-3 series', () => {
    // changes +1 +1 -1 +1 +1
    // seed: gain 2/3, loss 1/3 -> RS 2 -> 66.667
    // next: gain (2/3*2+1)/3 = 7/9, loss (1/3*2)/3 = 2/9 -> RS 3.5 -> 77.778
    // next: gain (7/9*2+1)/3 = 23/27, loss (2/9*2)/3 = 4/27 -> RS 5.75 -> 85.185
    const out = rsi([1, 2, 3, 2, 3, 4], 3);
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    expect(out[3]).toBeCloseTo(200 / 3, 10);
    expect(out[4]).toBeCloseTo(100 - 100 / 4.5, 10);
    expect(out[5]).toBeCloseTo(100 - 100 / 6.75, 10);
  });

  it('is 100 with only gains and 50 on a flat series', () => {
    expect(rsi([1, 2, 3, 4], 3)[3]).toBe(100);
    expect(rsi([5, 5, 5, 5], 3)[3]).toBe(50);
  });
});

describe('macd', () => {
  it('matches a hand-computed (2, 3, 2) series', () => {
    // closes 10 12 11 15 14 18
    // EMA2: -, 11, 11, 41/3, 125/9, 449/27      EMA3: -, -, 11, 13, 13.5, 15.75
    // MACD: -, -, 0, 2/3, 7/18, 95/108
    // signal EMA2 of MACD: -, -, -, 1/3, 10/27, 115/162
    // histogram: -, -, -, 1/3, 1/54, 55/324
    const { macd: line, signal, histogram } = macd([10, 12, 11, 15, 14, 18], 2, 3, 2);
    const expectClose = (actual: (number | null)[], expected: (number | null)[]) =>
      expected.forEach((e, i) => (e === null ? expect(actual[i]).toBeNull() : expect(actual[i]).toBeCloseTo(e, 10)));
    expectClose(line, [null, null, 0, 2 / 3, 7 / 18, 95 / 108]);
    expectClose(signal, [null, null, null, 1 / 3, 10 / 27, 115 / 162]);
    expectClose(histogram, [null, null, null, 1 / 3, 1 / 54, 55 / 324]);
  });
});
