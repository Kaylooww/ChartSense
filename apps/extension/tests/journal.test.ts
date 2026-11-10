import { describe, expect, it } from 'vitest';
import { canSettle, computeStats, createTrade, JournalSchema, settleTrade, statsByGroup, toCsv, type PaperTrade } from '../src/journal/journal';
import type { AnalysisResult } from '../src/types/market';

const T0 = new Date('2026-11-10T10:00:00Z');
const signal: AnalysisResult = {
  id: 'sig-1',
  status: 'UP',
  source: 'visual_only',
  instrumentType: 'fixed_expiry_demo',
  assetLabel: 'EUR/USD',
  chartTimeframeSec: 60,
  predictionHorizonSec: 120,
  analyzedAt: T0.toISOString(),
  lastBarTime: null,
  barCount: 0,
  strategyVersion: 'visual-v0.1',
  parameters: {},
  barDataVerified: false,
  reasonCodes: ['TREND_UP'],
  evidence: [],
  missingFields: [],
  assumptions: [],
  explanation: '',
  indicators: null,
  isSimulation: true,
  actionableAsOrder: false,
};

let n = 0;
const trade = (result: PaperTrade['result'], payout = 0.8, minute = n++): PaperTrade => ({
  ...createTrade(signal, 1, payout, new Date(T0.getTime() + minute * 60_000), `t${minute}`),
  result,
});

describe('createTrade / settleTrade', () => {
  it('records a simulated trade with expiry = entry + horizon (not the chart timeframe)', () => {
    const t = createTrade(signal, 10, 0.8, T0, 'a');
    expect(t).toMatchObject({ direction: 'UP', result: 'OPEN', simulated: true, stake: 10, payoutFraction: 0.8, signalId: 'sig-1' });
    expect(t.expiryTime).toBe('2026-11-10T10:02:00.000Z');
  });

  it('refuses WAIT signals and non-positive stake or payout', () => {
    expect(() => createTrade({ ...signal, status: 'WAIT' }, 1, 0.8)).toThrow();
    expect(() => createTrade(signal, 0, 0.8)).toThrow();
    expect(() => createTrade(signal, 1, -1)).toThrow();
  });

  it('cannot be settled before expiry (no look-ahead), and only once', () => {
    const t = createTrade(signal, 1, 0.8, T0, 'a');
    const beforeExpiry = new Date('2026-11-10T10:01:59Z');
    expect(canSettle(t, beforeExpiry)).toBe(false);
    expect(() => settleTrade(t, 'WIN', beforeExpiry)).toThrow();
    const settled = settleTrade(t, 'WIN', new Date('2026-11-10T10:02:00Z'));
    expect(settled).toMatchObject({ result: 'WIN', settlementMethod: 'manual', settledAt: '2026-11-10T10:02:00.000Z' });
    expect(() => settleTrade(settled, 'LOSS', new Date('2026-11-10T10:05:00Z'))).toThrow();
  });
});

describe('computeStats', () => {
  it('computes hit rate, net P&L, break-even and drawdown; excludes ties, open and unverified from the hit rate', () => {
    // entry order: W L L W T U O
    const trades = [trade('WIN'), trade('LOSS'), trade('LOSS'), trade('WIN'), trade('TIE'), trade('UNVERIFIED'), trade('OPEN')];
    const s = computeStats(trades);
    expect(s).toMatchObject({ total: 7, wins: 2, losses: 2, ties: 1, unverified: 1, open: 1 });
    expect(s.hitRate).toBe(0.5);
    expect(s.netPnl).toBeCloseTo(2 * 0.8 - 2, 10); // -0.4
    expect(s.breakevenHitRate).toBeCloseTo(1 / 1.8, 10); // 55.56 %
    // cumulative: 0.8, -0.2, -1.2, -0.4, -0.4 -> peak 0.8, trough -1.2
    expect(s.maxDrawdown).toBeCloseTo(2, 10);
    expect(s.sampleWarning).toMatch(/Only 4 decided trades/);
  });

  it('never counts an unverified trade as a win', () => {
    const s = computeStats([trade('UNVERIFIED'), trade('UNVERIFIED')]);
    expect([s.wins, s.hitRate, s.netPnl]).toEqual([0, null, 0]);
  });

  it('groups by strategy and timeframe/horizon', () => {
    const other = { ...trade('WIN'), predictionHorizonSec: 300 };
    expect(statsByGroup([trade('LOSS'), other]).map((g) => g.group)).toHaveLength(2);
  });
});

describe('export', () => {
  it('writes CSV with a header and quotes cells that need it, and round-trips JSON through the schema', () => {
    const t = { ...trade('WIN'), assetLabel: 'EUR,"USD"' };
    const csv = toCsv([t]);
    expect(csv.split('\n')[0]).toMatch(/^id,signalId,direction/);
    expect(csv).toContain('"EUR,""USD"""');
    expect(JournalSchema.parse(JSON.parse(JSON.stringify([t])))).toEqual([t]);
  });
});
