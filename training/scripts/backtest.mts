// Walk-forward test of the OHLC rule engine (baseline-v0.1) with no look-ahead, separate from the
// vision model. Use --csv for imported bars, or --random-walk N for a seeded series with NO edge:
// a hit rate far from 50% there would point to look-ahead or a bug, not skill.
import { readFileSync } from 'node:fs';
import { evaluateBaseline } from '../../apps/extension/src/signals/baseline.ts';
import { parseOhlc } from '../../apps/extension/src/signals/parseOhlc.ts';
import { validateBars } from '../../apps/extension/src/signals/validateBars.ts';
import type { Candle } from '../../apps/extension/src/types/market.ts';
import { summarize, walkForward } from '../lib/backtest.mts';
import { mulberry32 } from '../lib/synth.mts';
import { args } from './args.mts';

const opts = args({ csv: '', 'random-walk': '0', seed: '7', timeframe: '300', horizon: '900', payout: '0.8' });
const timeframeSec = Number(opts.timeframe);
const horizonSec = Number(opts.horizon);
if (horizonSec % timeframeSec) throw new Error('horizon must be a whole number of candles');

function randomWalk(n: number, seed: number): Candle[] {
  const rand = mulberry32(seed);
  let price = 100;
  return Array.from({ length: n }, (_, i) => {
    const open = price;
    const close = open + (rand() - 0.5) * 0.6;
    price = close;
    return { time: new Date(Date.UTC(2026, 0, 1) + i * timeframeSec * 1000).toISOString(), open, close, high: Math.max(open, close) + rand() * 0.2, low: Math.min(open, close) - rand() * 0.2 };
  });
}

let bars: Candle[];
if (opts.csv) {
  const parsed = parseOhlc(readFileSync(opts.csv, 'utf8'), opts.csv);
  if (!parsed.ok) throw new Error(parsed.error);
  const v = validateBars(parsed.rows, timeframeSec, 1, new Date(8.64e15));
  if (!v.ok) throw new Error(v.issues.map((i) => i.message).join('; '));
  bars = v.bars;
} else bars = randomWalk(Number(opts['random-walk']) || 2000, Number(opts.seed));

const context = { assetLabel: 'BACKTEST', instrumentType: 'fixed_expiry_demo', chartTimeframeSec: timeframeSec, predictionHorizonSec: horizonSec } as const;
const { trades, statuses } = walkForward(bars, {
  timeframeSec,
  horizonBars: horizonSec / timeframeSec,
  startIndex: 150,
  evaluate: (past, nowMs) => evaluateBaseline({ rows: [...past], context, source: 'imported_ohlc', now: new Date(nowMs), id: 'bt' }).status,
});
const s = summarize(trades, Number(opts.payout));
const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
console.log(`baseline-v0.1 walk-forward on ${opts.csv || `random walk (${bars.length} bars, seed ${opts.seed})`}`);
console.log(`statuses: ${JSON.stringify(statuses)}`);
console.log(`trades ${s.trades} · wins ${s.wins} · losses ${s.losses} · ties ${s.ties} · hit rate ${pct(s.hitRate)} vs break-even ${pct(s.breakevenHitRate)} · net ${s.netUnits.toFixed(2)} units`);
if (s.sampleWarning) console.log(s.sampleWarning);
