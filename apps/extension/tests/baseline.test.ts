import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateBaseline, STRATEGY_VERSION } from '../src/signals/baseline';
import { parseOhlc } from '../src/signals/parseOhlc';
import { AnalysisResultSchema, type ChartContext } from '../src/types/market';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ohlc/', import.meta.url));
const NOW = new Date('2026-02-01T00:00:00Z');
const CONTEXT: ChartContext = {
  assetLabel: 'MOCK/USD',
  instrumentType: 'fixed_expiry_demo',
  chartTimeframeSec: 300,
  predictionHorizonSec: 900,
};

function fixtureRows(name: string): unknown[] {
  const parsed = parseOhlc(readFileSync(FIXTURES + name, 'utf8'), name);
  if (!parsed.ok) throw new Error(parsed.error);
  expect(parsed.synthetic).toBe(true);
  return parsed.rows;
}

const run = (rows: unknown[], context: Partial<ChartContext> = {}, now = NOW) =>
  evaluateBaseline({ rows, context: { ...CONTEXT, ...context }, source: 'demo_fixture', now, id: 'test' });

/** Mirror prices around 400 so an uptrend becomes a downtrend (high and low swap roles). */
function mirror(rows: unknown[]): unknown[] {
  return (rows as { time: string; open: number; high: number; low: number; close: number }[]).map((b) => ({
    time: b.time,
    open: 400 - b.open,
    high: 400 - b.low,
    low: 400 - b.high,
    close: 400 - b.close,
  }));
}

describe('baseline-v0.1 on fixtures', () => {
  it('clear uptrend with a confirmed breakout -> UP', () => {
    const r = run(fixtureRows('uptrend-breakout.csv'));
    expect(r.status).toBe('UP');
    expect(r.reasonCodes).toEqual(['TREND_UP', 'BREAKOUT_CONFIRMED']);
    expect(r.indicators!.emaFast).toBeGreaterThan(r.indicators!.emaSlow);
    expect(r.barDataVerified).toBe(true);
  });

  it('is deterministic for the same bars and time', () => {
    const rows = fixtureRows('uptrend-breakout.csv');
    expect(run(rows)).toEqual(run(rows));
  });

  it('the mirrored uptrend gives the symmetric DOWN', () => {
    const r = run(mirror(fixtureRows('uptrend-breakout.csv')));
    expect(r.status).toBe('DOWN');
    expect(r.reasonCodes).toEqual(['TREND_DOWN', 'BREAKDOWN_CONFIRMED']);
  });

  it('contradictory trend -> WAIT', () => {
    const r = run(fixtureRows('contradictory-trend.csv'));
    expect(r.status).toBe('WAIT');
    expect(r.reasonCodes).toContain('TREND_CONFLICT');
    expect(r.indicators!.emaFast).toBeGreaterThan(r.indicators!.emaSlow);
  });

  it.each([
    ['too-few-bars.csv', ['TOO_FEW_BARS']],
    ['unsorted-duplicate.csv', ['UNSORTED_TIMESTAMPS', 'DUPLICATE_TIMESTAMPS']],
    ['invalid-high-low.csv', ['INVALID_HIGH_LOW']],
  ])('%s -> INSUFFICIENT_DATA %j with no indicator values', (name, codes) => {
    const r = run(fixtureRows(name));
    expect(r.status).toBe('INSUFFICIENT_DATA');
    expect(r.reasonCodes).toEqual(codes);
    expect(r.indicators).toBeNull();
    expect(r.barDataVerified).toBe(false);
  });
});

describe('baseline-v0.1 contract', () => {
  const rows = fixtureRows('uptrend-breakout.csv');

  it('always carries source, timestamp, horizon, version and reasons, and no confidence number', () => {
    for (const r of [run(rows), run([]), run(rows, { assetLabel: '' })]) {
      expect(AnalysisResultSchema.parse(r)).toBeTruthy();
      expect(r.source).toBe('demo_fixture');
      expect(r.analyzedAt).toBe(NOW.toISOString());
      expect(r.strategyVersion).toBe(STRATEGY_VERSION);
      expect(r.reasonCodes.length).toBeGreaterThan(0);
      expect(r.actionableAsOrder).toBe(false);
      expect(JSON.stringify(r)).not.toMatch(/"[a-z]*(confidence|probability|winRate|accuracy)[a-z]*"\s*:/i);
    }
  });

  it('missing context -> INSUFFICIENT_DATA listing exactly the missing fields', () => {
    const r = run(rows, { assetLabel: ' ', predictionHorizonSec: null });
    expect(r.status).toBe('INSUFFICIENT_DATA');
    expect(r.missingFields).toEqual(['assetLabel', 'predictionHorizonSec']);
  });

  it('keeps timeframe and horizon separate: the horizon is never filled from the timeframe', () => {
    const r = run(rows, { chartTimeframeSec: 300, predictionHorizonSec: 60 });
    expect(r.chartTimeframeSec).toBe(300);
    expect(r.predictionHorizonSec).toBe(60);
    expect(r.status).toBe('WAIT');
    expect(r.reasonCodes).toContain('HORIZON_SHORTER_THAN_TIMEFRAME');
    expect(run(rows, { predictionHorizonSec: 300 }).status).toBe('UP'); // 5m candle, 5m horizon is fine
  });

  it('rejects bars whose spacing does not match the chosen timeframe', () => {
    const r = run(rows, { chartTimeframeSec: 60 * 15, predictionHorizonSec: 3600 });
    expect(r.status).toBe('INSUFFICIENT_DATA');
    expect(r.reasonCodes).toEqual(['TIMEFRAME_MISMATCH']);
  });

  it('drops a still-forming last bar instead of looking ahead', () => {
    const last = rows[rows.length - 1] as { time: string };
    const midBar = new Date(Date.parse(last.time) + 120_000); // 2 minutes into the last 5m bar
    const r = run(rows, {}, midBar);
    expect(r.reasonCodes).toContain('FORMING_BAR_EXCLUDED');
    expect(r.barCount).toBe(rows.length - 1);
    expect(r.lastBarTime).toBe((rows[rows.length - 2] as { time: string }).time);
  });
});
