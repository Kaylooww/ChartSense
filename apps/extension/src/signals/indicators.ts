/**
 * Indicators on validated closes. Each output array is aligned with the input; `null` marks the
 * warm-up bars where the value is not defined yet. Nothing here may be fed screenshot estimates.
 */
export type Series = (number | null)[];

/** EMA seeded with the simple average of the first `period` values, k = 2 / (period + 1). */
export function ema(values: Series, period: number): Series {
  const out: Series = values.map(() => null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue; // leading nulls (e.g. MACD line warm-up)
    if (prev === null) {
      seed.push(v);
      if (seed.length < period) continue;
      prev = seed.reduce((a, b) => a + b, 0) / period;
      seed = [];
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI: first averages are simple means of the first `period` changes, then Wilder smoothing. */
export function rsi(closes: number[], period: number): Series {
  const out: Series = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }
  gain /= period;
  loss /= period;
  out[period] = toRsi(gain, loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = toRsi(gain, loss);
  }
  return out;
}

function toRsi(gain: number, loss: number): number {
  if (loss === 0) return gain === 0 ? 50 : 100; // flat series is neutral, all-gain series is 100
  return 100 - 100 / (1 + gain / loss);
}

export type MacdSeries = { macd: Series; signal: Series; histogram: Series };

/** MACD line = EMA(fast) - EMA(slow); signal = EMA(signalPeriod) of the MACD line. */
export function macd(closes: number[], fast: number, slow: number, signalPeriod: number): MacdSeries {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line: Series = closes.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const signal = ema(line, signalPeriod);
  const histogram: Series = line.map((m, i) => (m != null && signal[i] != null ? m - signal[i]! : null));
  return { macd: line, signal, histogram };
}
