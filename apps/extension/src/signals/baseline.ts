import type { AnalysisResult, ChartContext, Candle, DataSource, Direction, IndicatorSnapshot } from '../types/market';
import { ema, macd, rsi } from './indicators';
import { validateBars } from './validateBars';

export const STRATEGY_VERSION = 'baseline-v0.1';

/**
 * Engineering hypotheses, not validated or profitable settings (PROJECT_CONTEXT.md FR-04).
 * minBars = slow EMA seed (50) + 100 warm-up bars, so the seed's weight in EMA50 is under 2%.
 */
export const BASELINE_PARAMS = {
  emaFast: 20,
  emaSlow: 50,
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  minBars: 150,
  /** Bars per window when comparing recent highs/lows with the window before. */
  structureWindow: 10,
  /** Bars before the confirmation bars that define resistance / support. */
  breakoutLookback: 20,
  /** Consecutive closes beyond the level needed to call a breakout confirmed. */
  confirmBars: 2,
  /** Bars (before the last one) searched for a pullback touching the fast EMA. */
  retestWindow: 3,
  /** |EMA fast - EMA slow| / close below this means sideways. */
  minTrendGap: 0.001,
  rsiOverbought: 70,
  rsiOversold: 30,
} as const;

export type EvaluateInput = {
  rows: unknown[];
  context: ChartContext;
  source: DataSource;
  now?: Date;
  id?: string;
};

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toFixed(2) : n.toPrecision(6));

export function evaluateBaseline({ rows, context, source, now = new Date(), id = crypto.randomUUID() }: EvaluateInput): AnalysisResult {
  const p = BASELINE_PARAMS;
  const assumptions = [
    source === 'demo_fixture'
      ? 'Bars are synthetic demo data, not a real market.'
      : 'Bars come from an imported file; ChartSense cannot check that they match your platform’s quotes.',
    'The result describes the series as of its last complete bar, not the live market.',
    'Rule-based and uncalibrated: no probability, confidence or win rate is implied.',
  ];
  const base = {
    id,
    source,
    instrumentType: context.instrumentType,
    assetLabel: context.assetLabel.trim(),
    chartTimeframeSec: context.chartTimeframeSec,
    predictionHorizonSec: context.predictionHorizonSec,
    analyzedAt: now.toISOString(),
    strategyVersion: STRATEGY_VERSION,
    parameters: { ...p },
    assumptions,
    isSimulation: true as const,
    actionableAsOrder: false as const,
  };
  const result = (
    status: Direction,
    explanation: string,
    extra: Partial<Pick<AnalysisResult, 'reasonCodes' | 'evidence' | 'missingFields' | 'indicators' | 'lastBarTime' | 'barCount' | 'barDataVerified'>>,
  ): AnalysisResult => ({
    status,
    explanation,
    reasonCodes: [],
    evidence: [],
    missingFields: [],
    indicators: null,
    lastBarTime: null,
    barCount: 0,
    barDataVerified: false,
    ...base,
    ...extra,
  });

  const missingFields = [
    ...(base.assetLabel === '' ? ['assetLabel'] : []),
    ...(context.chartTimeframeSec === null ? ['chartTimeframeSec'] : []),
    ...(context.predictionHorizonSec === null ? ['predictionHorizonSec'] : []),
  ];
  if (missingFields.length > 0 || context.chartTimeframeSec === null) {
    return result('INSUFFICIENT_DATA', 'Fill in the chart context before analyzing.', {
      reasonCodes: ['MISSING_CONTEXT'],
      missingFields,
    });
  }

  const validated = validateBars(rows, context.chartTimeframeSec, p.minBars, now);
  if (!validated.ok) {
    return result('INSUFFICIENT_DATA', 'The imported bars cannot be trusted for indicators.', {
      reasonCodes: validated.issues.map((i) => i.code),
      evidence: validated.issues.map((i) => i.message),
      missingFields: ['validated OHLC bars'],
      barCount: rows.length,
    });
  }

  const bars = validated.bars;
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const fastSeries = ema(closes, p.emaFast);
  const slowSeries = ema(closes, p.emaSlow);
  const fast = fastSeries[n - 1]!;
  const slow = slowSeries[n - 1]!;
  const rsiNow = rsi(closes, p.rsiPeriod)[n - 1]!;
  const m = macd(closes, p.macdFast, p.macdSlow, p.macdSignal);
  const indicators: IndicatorSnapshot = {
    emaFast: fast,
    emaSlow: slow,
    rsi: rsiNow,
    macd: m.macd[n - 1]!,
    macdSignal: m.signal[n - 1]!,
    macdHistogram: m.histogram[n - 1]!,
  };
  const last = bars[n - 1]!;
  const reasonCodes: string[] = validated.formingBarExcluded ? ['FORMING_BAR_EXCLUDED'] : [];
  const evidence: string[] = validated.formingBarExcluded ? ['The newest bar has not closed yet and was ignored.'] : [];
  const done = (status: Direction, explanation: string) =>
    result(status, explanation, {
      reasonCodes,
      evidence,
      indicators,
      lastBarTime: last.time,
      barCount: n,
      barDataVerified: true,
    });

  if (context.predictionHorizonSec! < context.chartTimeframeSec) {
    reasonCodes.push('HORIZON_SHORTER_THAN_TIMEFRAME');
    evidence.push('The prediction horizon is shorter than one candle; a candle-close strategy cannot speak to it.');
    return done('WAIT', 'The prediction horizon is shorter than the chart timeframe.');
  }

  // Trend: EMA order and recent swing structure must agree.
  const emaTrend = fast > slow ? 'UP' : fast < slow ? 'DOWN' : 'FLAT';
  evidence.push(`EMA${p.emaFast} ${fmt(fast)} ${emaTrend === 'UP' ? '>' : emaTrend === 'DOWN' ? '<' : '='} EMA${p.emaSlow} ${fmt(slow)}.`);
  if (Math.abs(fast - slow) / last.close < p.minTrendGap) {
    reasonCodes.push('SIDEWAYS');
    evidence.push(`EMAs are within ${p.minTrendGap * 100}% of price: no clear trend.`);
    return done('WAIT', 'The market looks sideways.');
  }

  const w = p.structureWindow;
  const recent = bars.slice(n - w);
  const prior = bars.slice(n - 2 * w, n - w);
  const hi = (bs: Candle[]) => Math.max(...bs.map((b) => b.high));
  const lo = (bs: Candle[]) => Math.min(...bs.map((b) => b.low));
  const structure =
    hi(recent) > hi(prior) && lo(recent) > lo(prior) ? 'UP' : hi(recent) < hi(prior) && lo(recent) < lo(prior) ? 'DOWN' : 'MIXED';
  evidence.push(
    structure === 'UP'
      ? `Last ${w} bars made a higher high and a higher low than the ${w} before.`
      : structure === 'DOWN'
        ? `Last ${w} bars made a lower high and a lower low than the ${w} before.`
        : `Last ${w} bars show mixed highs and lows versus the ${w} before.`,
  );
  if (structure !== emaTrend) {
    reasonCodes.push('TREND_CONFLICT');
    return done('WAIT', 'EMA trend and recent price structure disagree.');
  }
  const dir = emaTrend as 'UP' | 'DOWN'; // FLAT already returned as SIDEWAYS
  reasonCodes.push(dir === 'UP' ? 'TREND_UP' : 'TREND_DOWN');

  // Setup: confirmed breakout of the prior range, or a pullback to the fast EMA that has resumed.
  const c = p.confirmBars;
  const range = bars.slice(n - c - p.breakoutLookback, n - c);
  const confirm = bars.slice(n - c);
  const level = dir === 'UP' ? hi(range) : lo(range);
  const breakout = confirm.every((b) => (dir === 'UP' ? b.close > level : b.close < level));
  let retest = false;
  for (let i = n - 1 - p.retestWindow; i < n - 1 && !breakout; i++) {
    const b = bars[i]!;
    const touched = dir === 'UP' ? b.low <= fastSeries[i]! && b.close > slowSeries[i]! : b.high >= fastSeries[i]! && b.close < slowSeries[i]!;
    const resumed = dir === 'UP' ? last.close > fast && last.close > b.high : last.close < fast && last.close < b.low;
    if (touched && resumed) retest = true;
  }
  const levelName = dir === 'UP' ? 'resistance' : 'support';
  if (breakout) {
    reasonCodes.push(dir === 'UP' ? 'BREAKOUT_CONFIRMED' : 'BREAKDOWN_CONFIRMED');
    evidence.push(`Last ${c} closes are ${dir === 'UP' ? 'above' : 'below'} the ${p.breakoutLookback}-bar ${levelName} ${fmt(level)}.`);
  } else if (retest) {
    reasonCodes.push('RETEST_CONFIRMED');
    evidence.push(`Price pulled back to EMA${p.emaFast} and the last close moved beyond the pullback bar.`);
  } else {
    reasonCodes.push('NO_CONFIRMED_SETUP');
    evidence.push(`No ${c}-close break of the ${p.breakoutLookback}-bar ${levelName} ${fmt(level)} and no confirmed EMA${p.emaFast} retest.`);
    return done('WAIT', 'Trend is clear but there is no confirmed breakout or retest.');
  }

  // Filters: RSI and MACD can only veto, never create, a candidate.
  evidence.push(`RSI${p.rsiPeriod} ${rsiNow.toFixed(1)}; MACD histogram ${fmt(indicators.macdHistogram)}.`);
  if (dir === 'UP' ? rsiNow >= p.rsiOverbought : rsiNow <= p.rsiOversold) {
    reasonCodes.push(dir === 'UP' ? 'RSI_OVERBOUGHT' : 'RSI_OVERSOLD');
    return done('WAIT', `RSI is ${dir === 'UP' ? 'overbought' : 'oversold'}; the move may be stretched.`);
  }
  if (dir === 'UP' ? indicators.macdHistogram <= 0 : indicators.macdHistogram >= 0) {
    reasonCodes.push('MACD_DISAGREES');
    return done('WAIT', 'Trend and MACD momentum disagree.');
  }

  return done(dir, `${dir === 'UP' ? 'Uptrend' : 'Downtrend'} with a confirmed ${breakout ? 'breakout' : 'retest'}; RSI and MACD do not object.`);
}
