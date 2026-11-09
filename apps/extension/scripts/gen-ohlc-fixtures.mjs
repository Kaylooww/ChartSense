// Regenerates the SYNTHETIC OHLC fixtures in fixtures/ohlc/. Deterministic: same output every run.
// Nothing produced here is market data. Run: node apps/extension/scripts/gen-ohlc-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../../fixtures/ohlc/', import.meta.url));
const START = Date.parse('2026-01-05T00:00:00Z');
const STEP = 300_000; // 5m bars

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds bars whose closes follow `closes`; open = previous close, wicks are small and random. */
function barsFrom(closes, seed, { cap } = {}) {
  const rand = mulberry32(seed);
  let prev = closes[0] - 0.1;
  return closes.map((close, i) => {
    const open = prev;
    prev = close;
    let high = Math.max(open, close) + rand() * 0.15;
    if (cap && cap(i) !== null) high = Math.min(high, Math.max(cap(i), open, close));
    const low = Math.min(open, close) - rand() * 0.15;
    return { time: new Date(START + i * STEP).toISOString(), open, high, low, close };
  });
}

function trend(count, start, slope, seed, noise = 0.35) {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => start + slope * i + (rand() - 0.5) * 2 * noise);
}

function write(name, header, bars) {
  const r = (n) => n.toFixed(4);
  const lines = bars.map((b) => [b.time, r(b.open), r(b.high), r(b.low), r(b.close)].join(','));
  const text = [`# SYNTHETIC demo fixture, not market data. ${header}`, 'time,open,high,low,close', ...lines, ''].join('\n');
  writeFileSync(OUT + name, text);
}

// 1. Uptrend, then a 20-bar ascending range under flat resistance, then two closes above it.
{
  const up = trend(170, 100, 0.12, 1);
  const top = up[up.length - 1] + 0.6;
  const range = Array.from({ length: 28 }, (_, i) => top - 0.9 + i * 0.02 + (i % 2 ? 0.25 : -0.25));
  const closes = [...up, ...range, top + 0.35, top + 0.7];
  const n = closes.length;
  write(
    'uptrend-breakout.csv',
    'Expected baseline-v0.1: UP (TREND_UP, BREAKOUT_CONFIRMED).',
    barsFrom(closes, 11, { cap: (i) => (i >= 170 && i < n - 2 ? top : null) }),
  );
}

// 2. Long uptrend, then a sharp slide: EMA20 still above EMA50 but lower highs and lower lows.
{
  const up = trend(180, 100, 0.12, 2);
  const last = up[up.length - 1];
  const down = trend(20, last - 0.3, -0.18, 3, 0.2);
  write('contradictory-trend.csv', 'Expected baseline-v0.1: WAIT (TREND_CONFLICT).', barsFrom([...up, ...down], 12));
}

// 3. Clean uptrend but only 40 bars: below the 150-bar minimum.
write('too-few-bars.csv', 'Expected baseline-v0.1: INSUFFICIENT_DATA (TOO_FEW_BARS).', barsFrom(trend(40, 100, 0.12, 4), 13));

// 4. Rows 101/102 swapped and row 151 repeated.
{
  const bars = barsFrom(trend(200, 100, 0.12, 5), 14);
  [bars[100], bars[101]] = [bars[101], bars[100]];
  bars.splice(151, 0, { ...bars[150] });
  write(
    'unsorted-duplicate.csv',
    'Expected baseline-v0.1: INSUFFICIENT_DATA (UNSORTED_TIMESTAMPS, DUPLICATE_TIMESTAMPS).',
    bars,
  );
}

// 5. Row 121 has a high below its close and row 161 a low above its open.
{
  const bars = barsFrom(trend(200, 100, 0.12, 6), 15);
  bars[120].high = Math.max(bars[120].open, bars[120].close) - 0.2;
  bars[160].low = Math.min(bars[160].open, bars[160].close) + 0.2;
  write('invalid-high-low.csv', 'Expected baseline-v0.1: INSUFFICIENT_DATA (INVALID_HIGH_LOW).', bars);
}
