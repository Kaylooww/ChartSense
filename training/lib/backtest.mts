import type { Candle } from '../../apps/extension/src/types/market.ts';

/** Signal evaluator: sees ONLY bars up to and including the current one, and the time that bar closed. */
export type Evaluate = (past: readonly Candle[], nowMs: number) => 'UP' | 'DOWN' | 'WAIT' | 'INSUFFICIENT_DATA' | 'ERROR';

export type Trade = { index: number; direction: 'UP' | 'DOWN'; entryClose: number; exitClose: number; result: 'WIN' | 'LOSS' | 'TIE' };

/**
 * Walk-forward test of a rule on historical bars with no look-ahead: at bar t the evaluator gets
 * bars[0..t] and the close time of bar t; the outcome is judged at the close of bar t + horizonBars.
 * Entry is assumed at the close of bar t (a simplification: real fills differ). Trades never overlap:
 * after a signal the next one is considered only once that trade has expired.
 */
export function walkForward(bars: readonly Candle[], opts: { timeframeSec: number; horizonBars: number; startIndex: number; evaluate: Evaluate }) {
  const { timeframeSec, horizonBars, startIndex, evaluate } = opts;
  if (horizonBars < 1) throw new Error('horizonBars must be at least 1');
  const trades: Trade[] = [];
  const statuses: Record<string, number> = {};
  for (let t = startIndex; t + horizonBars < bars.length; t++) {
    const nowMs = Date.parse(bars[t]!.time) + timeframeSec * 1000;
    const status = evaluate(bars.slice(0, t + 1), nowMs);
    statuses[status] = (statuses[status] ?? 0) + 1;
    if (status !== 'UP' && status !== 'DOWN') continue;
    const entryClose = bars[t]!.close;
    const exitClose = bars[t + horizonBars]!.close;
    const result = exitClose === entryClose ? 'TIE' : (exitClose > entryClose) === (status === 'UP') ? 'WIN' : 'LOSS';
    trades.push({ index: t, direction: status, entryClose, exitClose, result });
    t += horizonBars - 1; // skip until this trade has expired
  }
  return { trades, statuses };
}

export function summarize(trades: Trade[], payoutFraction: number) {
  const wins = trades.filter((t) => t.result === 'WIN').length;
  const losses = trades.filter((t) => t.result === 'LOSS').length;
  const decided = wins + losses;
  return {
    trades: trades.length,
    wins,
    losses,
    ties: trades.length - decided,
    hitRate: decided ? wins / decided : null,
    breakevenHitRate: 1 / (1 + payoutFraction),
    netUnits: wins * payoutFraction - losses,
    sampleWarning: decided < 30 ? `Only ${decided} decided trades: far too few to conclude anything.` : decided < 200 ? `${decided} decided trades: still a small sample.` : null,
  };
}
