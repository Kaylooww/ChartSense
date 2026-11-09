import { describe, expect, it } from 'vitest';
import { parseOhlc } from '../src/signals/parseOhlc';
import { validateBars } from '../src/signals/validateBars';

const NOW = new Date('2026-02-01T00:00:00Z');
const t = (i: number) => new Date(Date.parse('2026-01-05T00:00:00Z') + i * 60_000).toISOString();
const bar = (i: number, o = 10) => ({ time: t(i), open: o, high: o + 1, low: o - 1, close: o + 0.5 });
const good = (n: number) => Array.from({ length: n }, (_, i) => bar(i));
const codes = (rows: unknown[], min = 3) => {
  const r = validateBars(rows, 60, min, NOW);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

describe('validateBars', () => {
  it('accepts well-formed, evenly spaced bars', () => {
    const r = validateBars(good(5), 60, 3, NOW);
    expect(r.ok && r.bars.length).toBe(5);
  });

  it('rejects empty input, non-finite prices and non-UTC times', () => {
    expect(codes([])).toEqual(['NO_BARS']);
    expect(codes([...good(3), { ...bar(3), close: Number.NaN }])).toEqual(['BAD_BAR']);
    expect(codes([...good(3), { ...bar(3), high: Number.POSITIVE_INFINITY }])).toEqual(['BAD_BAR']);
    expect(codes([...good(3), { ...bar(3), time: '2026-01-05 00:03' }])).toEqual(['BAD_BAR']);
  });

  it('enforces high >= max(open, close), low <= min(open, close) and positive prices', () => {
    expect(codes([...good(3), { ...bar(3), high: 10.2 }])).toEqual(['INVALID_HIGH_LOW']); // close is 10.5
    expect(codes([...good(3), { ...bar(3), low: 10.1 }])).toEqual(['INVALID_HIGH_LOW']); // open is 10
    expect(codes([...good(3), { time: t(3), open: 0, high: 1, low: 0, close: 1 }])).toEqual(['NON_POSITIVE_PRICE']);
  });

  it('flags unsorted and duplicate timestamps', () => {
    const rows = good(5);
    [rows[1], rows[2]] = [rows[2]!, rows[1]!];
    expect(codes(rows)).toEqual(['UNSORTED_TIMESTAMPS']);
    expect(codes([...good(3), bar(2)])).toEqual(['DUPLICATE_TIMESTAMPS']);
  });

  it('flags gaps and spacing that does not match the timeframe', () => {
    expect(codes([bar(0), bar(1), bar(3), bar(4)])).toEqual(['MISSING_BARS']);
    expect(codes([...good(3), { ...bar(3), time: new Date(Date.parse(t(2)) + 90_000).toISOString() }])).toEqual([
      'TIMEFRAME_MISMATCH',
    ]);
  });

  it('requires the minimum bar count after dropping a forming bar', () => {
    expect(codes(good(5), 6)).toEqual(['TOO_FEW_BARS']);
    const formingAt = new Date(Date.parse(t(4)) + 30_000); // halfway through the last 1m bar
    const r = validateBars(good(5), 60, 3, formingAt);
    expect(r.ok && r.formingBarExcluded && r.bars.length).toBe(4);
    expect(validateBars(good(5), 60, 3, new Date(Date.parse(t(3)))).ok).toBe(false); // two unclosed bars
  });
});

describe('parseOhlc', () => {
  it('parses CSV with comments, epoch-second times and a synthetic marker', () => {
    const csv = '# SYNTHETIC test\ntime,open,high,low,close\n1767571200,1,2,0.5,1.5\n';
    const r = parseOhlc(csv, 'bars.csv');
    expect(r).toEqual({
      ok: true,
      synthetic: true,
      rows: [{ time: '2026-01-05T00:00:00.000Z', open: 1, high: 2, low: 0.5, close: 1.5 }],
    });
  });

  it('parses a JSON array and marks it not synthetic', () => {
    const r = parseOhlc(JSON.stringify([bar(0)]), 'bars.json');
    expect(r).toEqual({ ok: true, synthetic: false, rows: [bar(0)] });
  });

  it('rejects a CSV without the required header, bad JSON and oversized files', () => {
    expect(parseOhlc('a,b\n1,2', 'x.csv').ok).toBe(false);
    expect(parseOhlc('[oops', 'x.json').ok).toBe(false);
    expect(parseOhlc('x'.repeat(2_000_001), 'x.csv').ok).toBe(false);
  });

  it('turns non-numeric cells into values the validator rejects', () => {
    const r = parseOhlc('time,open,high,low,close\n2026-01-05T00:00:00Z,abc,2,1,1.5', 'x.csv');
    expect(r.ok && codes(r.rows, 1)).toEqual(['BAD_BAR']);
  });
});
