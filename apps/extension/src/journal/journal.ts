import { z } from 'zod';
import { DataSourceSchema, InstrumentTypeSchema, type AnalysisResult } from '../types/market';

/**
 * Paper-trading journal (Phase 4). SIMULATED ONLY: nothing here touches a broker.
 * Fixed-expiry model: a win pays `stake * payoutFraction` net, a loss costs `stake`, a tie returns
 * the stake. Results are entered by the user after expiry ("manual" settlement); a trade the user
 * cannot verify is UNVERIFIED and excluded from every win/loss statistic.
 */
export const TradeResultSchema = z.enum(['OPEN', 'WIN', 'LOSS', 'TIE', 'UNVERIFIED']);
export type TradeResult = z.infer<typeof TradeResultSchema>;

export const PaperTradeSchema = z.object({
  id: z.string(),
  signalId: z.string(),
  direction: z.enum(['UP', 'DOWN']),
  instrumentType: InstrumentTypeSchema,
  assetLabel: z.string(),
  chartTimeframeSec: z.number().int().positive(),
  predictionHorizonSec: z.number().int().positive(),
  source: DataSourceSchema,
  strategyVersion: z.string(),
  reasonCodes: z.array(z.string()),
  /** When the signal was produced, ISO 8601 UTC. */
  signalAt: z.string(),
  /** When the user recorded the paper trade (entry), ISO 8601 UTC. */
  entryTime: z.string(),
  /** entryTime + horizon. Settlement is refused before this. */
  expiryTime: z.string(),
  stake: z.number().positive(),
  /** Net payout on a win as a fraction of stake, e.g. 0.8 for 80%. */
  payoutFraction: z.number().positive().max(10),
  result: TradeResultSchema,
  settlementMethod: z.literal('manual').nullable(),
  settledAt: z.string().nullable(),
  assumptions: z.array(z.string()),
  simulated: z.literal(true),
});
export type PaperTrade = z.infer<typeof PaperTradeSchema>;

export const JournalSchema = z.array(PaperTradeSchema);

export function createTrade(signal: AnalysisResult, stake: number, payoutFraction: number, now = new Date(), id: string = crypto.randomUUID()): PaperTrade {
  if (signal.status !== 'UP' && signal.status !== 'DOWN') throw new Error('Only UP or DOWN signals can be paper traded.');
  if (signal.chartTimeframeSec === null || signal.predictionHorizonSec === null) throw new Error('Signal has no timeframe or horizon.');
  if (!(stake > 0) || !(payoutFraction > 0)) throw new Error('Stake and payout must be positive.');
  return PaperTradeSchema.parse({
    id,
    signalId: signal.id,
    direction: signal.status,
    instrumentType: signal.instrumentType,
    assetLabel: signal.assetLabel,
    chartTimeframeSec: signal.chartTimeframeSec,
    predictionHorizonSec: signal.predictionHorizonSec,
    source: signal.source,
    strategyVersion: signal.strategyVersion,
    reasonCodes: signal.reasonCodes,
    signalAt: signal.analyzedAt,
    entryTime: now.toISOString(),
    expiryTime: new Date(now.getTime() + signal.predictionHorizonSec * 1000).toISOString(),
    stake,
    payoutFraction,
    result: 'OPEN',
    settlementMethod: null,
    settledAt: null,
    assumptions: [
      'Simulated paper trade; no real order was placed.',
      'Entry is the moment you recorded it, not a verified platform entry price.',
      'Result is entered by you after expiry (manual settlement).',
      'Payout is what you entered, not a verified platform quote.',
    ],
    simulated: true,
  });
}

export function canSettle(trade: PaperTrade, now = new Date()): boolean {
  return trade.result === 'OPEN' && now.getTime() >= Date.parse(trade.expiryTime);
}

/** Records the user's verified outcome. Refuses before expiry so the result cannot be guessed early. */
export function settleTrade(trade: PaperTrade, result: Exclude<TradeResult, 'OPEN'>, now = new Date()): PaperTrade {
  if (!canSettle(trade, now)) throw new Error('Trade is not open or has not expired yet.');
  return { ...trade, result, settlementMethod: 'manual', settledAt: now.toISOString() };
}

export function tradePnl(t: PaperTrade): number {
  return t.result === 'WIN' ? t.stake * t.payoutFraction : t.result === 'LOSS' ? -t.stake : 0;
}

export type JournalStats = {
  total: number;
  open: number;
  wins: number;
  losses: number;
  ties: number;
  unverified: number;
  /** wins / (wins + losses); null with no decided trades. Ties and UNVERIFIED are excluded. */
  hitRate: number | null;
  netPnl: number;
  /** Average payout fraction over decided trades. */
  avgPayout: number | null;
  /** 1 / (1 + avgPayout): the hit rate needed to break even (no fees, no ties). */
  breakevenHitRate: number | null;
  /** Largest peak-to-trough fall of cumulative P&L, in stake units, over settled trades by entry time. */
  maxDrawdown: number;
  sampleWarning: string | null;
};

export function computeStats(trades: PaperTrade[]): JournalStats {
  const count = (r: TradeResult) => trades.filter((t) => t.result === r).length;
  const wins = count('WIN');
  const losses = count('LOSS');
  const decided = trades.filter((t) => t.result === 'WIN' || t.result === 'LOSS');
  const avgPayout = decided.length ? decided.reduce((s, t) => s + t.payoutFraction, 0) / decided.length : null;

  let cum = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of [...trades].filter((t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'TIE').sort((a, b) => a.entryTime.localeCompare(b.entryTime))) {
    cum += tradePnl(t);
    peak = Math.max(peak, cum);
    maxDrawdown = Math.max(maxDrawdown, peak - cum);
  }

  const n = decided.length;
  return {
    total: trades.length,
    open: count('OPEN'),
    wins,
    losses,
    ties: count('TIE'),
    unverified: count('UNVERIFIED'),
    hitRate: n ? wins / n : null,
    netPnl: trades.reduce((s, t) => s + tradePnl(t), 0),
    avgPayout,
    breakevenHitRate: avgPayout === null ? null : 1 / (1 + avgPayout),
    maxDrawdown,
    sampleWarning:
      n < 30
        ? `Only ${n} decided trades. Far too few to judge the strategy; results can be pure luck.`
        : n < 200
          ? `${n} decided trades. Still a small sample; treat the hit rate as rough.`
          : null,
  };
}

/** Stats per strategy version and timeframe/horizon pair, so different setups are not mixed. */
export function statsByGroup(trades: PaperTrade[]): { group: string; stats: JournalStats }[] {
  const groups = new Map<string, PaperTrade[]>();
  for (const t of trades) {
    const key = `${t.strategyVersion} · ${t.chartTimeframeSec}s chart / ${t.predictionHorizonSec}s horizon`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups].map(([group, ts]) => ({ group, stats: computeStats(ts) }));
}

const CSV_COLUMNS = [
  'id', 'signalId', 'direction', 'instrumentType', 'assetLabel', 'chartTimeframeSec', 'predictionHorizonSec', 'source',
  'strategyVersion', 'signalAt', 'entryTime', 'expiryTime', 'stake', 'payoutFraction', 'result', 'settlementMethod', 'settledAt',
] as const;

export function toCsv(trades: PaperTrade[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [CSV_COLUMNS.join(','), ...trades.map((t) => CSV_COLUMNS.map((c) => cell(t[c])).join(',')), ''].join('\n');
}
