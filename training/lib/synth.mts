import type { Labels } from './labels.mts';
import { blank, fillRect, type Rgba } from './png.mts';

/**
 * Synthetic candlestick charts whose labels are known BY CONSTRUCTION. They exercise the pipeline and
 * give a controlled baseline; they do not look like any real platform, so real exports are still needed.
 * Down scenarios are exact mirror images of up scenarios, which exposes up/down bias in a model.
 */
export type Candle = { open: number; high: number; low: number; close: number };

export const SCENARIOS = [
  'up_breakout',
  'down_breakdown',
  'up_pullback_resumed',
  'down_bounce_resumed',
  'top_turning_down',
  'bottom_turning_up',
  'range',
  'no_chart',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

const UP_TREND = { imageQuality: 'readable', candlesVisible: true, visibleTrend: 'upward_appearance', structure: 'higher_highs_higher_lows', completedSetups: [] } as const;
const DOWN_TREND = { imageQuality: 'readable', candlesVisible: true, visibleTrend: 'downward_appearance', structure: 'lower_highs_lower_lows', completedSetups: [] } as const;

export const SCENARIO_LABELS: Record<Scenario, Labels> = {
  up_breakout: { ...UP_TREND, completedSetups: [], latestMove: 'broke_above_recent_highs' },
  down_breakdown: { ...DOWN_TREND, completedSetups: [], latestMove: 'broke_below_recent_lows' },
  up_pullback_resumed: { ...UP_TREND, completedSetups: [], latestMove: 'pulled_back_then_turned_up' },
  down_bounce_resumed: { ...DOWN_TREND, completedSetups: [], latestMove: 'bounced_then_turned_down' },
  top_turning_down: { ...UP_TREND, completedSetups: [], latestMove: 'bounced_then_turned_down' },
  bottom_turning_up: { ...DOWN_TREND, completedSetups: [], latestMove: 'pulled_back_then_turned_up' },
  range: { imageQuality: 'readable', candlesVisible: true, visibleTrend: 'sideways_appearance', structure: 'sideways_range', completedSetups: [], latestMove: 'none' },
  no_chart: { imageQuality: 'unreadable', candlesVisible: false, visibleTrend: 'unclear', structure: 'unclear', completedSetups: [], latestMove: 'none' },
};

export function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 60;

/** Uptrend closes with zigzag swings (higher highs and higher lows). */
function upCloses(rand: () => number, n: number, slope: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 + slope * i + amp * Math.sin(i * 0.9) + (rand() - 0.5) * 0.4);
}

function candlesFrom(closes: number[], rand: () => number): Candle[] {
  let prev = closes[0]! - 0.3;
  return closes.map((close) => {
    const open = prev;
    prev = close;
    return { open, close, high: Math.max(open, close) + rand() * 0.35, low: Math.min(open, close) - rand() * 0.35 };
  });
}

const mirror = (cs: Candle[]): Candle[] => cs.map((c) => ({ open: 200 - c.open, close: 200 - c.close, high: 200 - c.low, low: 200 - c.high }));

/** Candles for a scenario. Every construction keeps the latest move inside the newest 30% strip. */
export function scenarioCandles(scenario: Exclude<Scenario, 'no_chart'>, seed: number): Candle[] {
  const rand = mulberry32(seed);
  const slope = 0.45 + rand() * 0.3;
  const amp = 0.8 + rand() * 0.6;
  switch (scenario) {
    case 'up_breakout': {
      const base = candlesFrom(upCloses(rand, N - 3, slope, amp), rand);
      const top = Math.max(...base.map((c) => c.high));
      const tail = [top + 0.9, top + 1.8, top + 2.8];
      return [...base, ...candlesFrom([base[base.length - 1]!.close, ...tail], rand).slice(1)];
    }
    case 'up_pullback_resumed': {
      const closes = upCloses(rand, N - 9, slope, amp * 0.6);
      const peak = closes[closes.length - 1]!;
      const dip = [1, 2, 3, 4, 5].map((k) => peak - k * 0.55);
      const resume = [1, 2, 3, 4].map((k) => dip[4]! + k * 0.5); // turns up, stays below the peak
      return candlesFrom([...closes, ...dip, ...resume], rand);
    }
    case 'top_turning_down': {
      const closes = upCloses(rand, N - 8, slope, amp * 0.6);
      const peak = closes[closes.length - 1]!;
      return candlesFrom([...closes, ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => peak - k * 0.6)], rand);
    }
    case 'range': {
      const closes = Array.from({ length: N - 5 }, (_, i) => 100 + 2.4 * Math.sin(i * 0.55) + (rand() - 0.5) * 0.5);
      return candlesFrom([...closes, ...[0, 0, 0, 0, 0].map(() => 100 + (rand() - 0.5) * 0.3)], rand);
    }
    case 'down_breakdown':
      return mirror(scenarioCandles('up_breakout', seed));
    case 'down_bounce_resumed':
      return mirror(scenarioCandles('up_pullback_resumed', seed));
    case 'bottom_turning_up':
      return mirror(scenarioCandles('top_turning_down', seed));
  }
}

const BG: [number, number, number] = [11, 18, 32];
const GRID: [number, number, number] = [27, 39, 66];
const UP: [number, number, number] = [52, 211, 153];
const DOWN: [number, number, number] = [244, 63, 94];

export function renderChart(candles: Candle[], width = 640, height = 400): Rgba {
  const img = blank(width, height, BG);
  for (let y = 40; y < height; y += 60) fillRect(img, 0, y, width, 1, GRID);
  const pad = 20;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const y = (p: number) => pad + (1 - (p - lo) / (hi - lo || 1)) * (height - 2 * pad);
  const step = (width - 2 * pad) / candles.length;
  candles.forEach((c, i) => {
    const color = c.close >= c.open ? UP : DOWN;
    const x = pad + step * (i + 0.5);
    fillRect(img, x, y(c.high), 1, y(c.low) - y(c.high), color);
    const top = y(Math.max(c.open, c.close));
    fillRect(img, x - step * 0.3, top, step * 0.6, Math.max(1, y(Math.min(c.open, c.close)) - top), color);
  });
  return img;
}

/** A panel with text-like blocks and no candles: the model must report it unreadable. */
export function renderNoChart(seed: number, width = 640, height = 400): Rgba {
  const rand = mulberry32(seed);
  const img = blank(width, height, [24, 28, 38]);
  for (let row = 30; row < height - 20; row += 28) {
    let x = 30;
    while (x < width - 60) {
      const w = 20 + rand() * 70;
      fillRect(img, x, row, w, 10, [150, 160, 175]);
      x += w + 12;
    }
  }
  return img;
}
