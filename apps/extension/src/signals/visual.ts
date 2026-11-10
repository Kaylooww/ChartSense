import type { ObserveOutcome, VisualPattern } from '../analysis/ollama';
import type { AnalysisResult, ChartContext, Direction } from '../types/market';

export const VISUAL_STRATEGY_VERSION = 'visual-v0.3';

/**
 * visual-v0.3 (D-021, D-026, D-028): the entry and exit setups of reference/stock_trends_buy_sell_guide.pdf (S9)
 * plus the falling wedge and close-not-wick rule of best_chart_patterns_trading_guide.pdf (S10),
 * applied to the model's visual observations. Engineering hypotheses, not validated settings.
 * A direction needs at least one COMPLETED setup and no opposing one, seen on two consecutive
 * snapshots of the same chart region, and the snapshot must be fresh relative to the horizon.
 */
export const VISUAL_PARAMS = {
  /** Two agreeing snapshots may be at most this many monitoring intervals apart. */
  maxConfirmGapIntervals: 3,
  /** A snapshot older than this fraction of the horizon (capture -> result) is too late to use. */
  maxSnapshotAgeFraction: 0.5,
} as const;

type Setup = { code: string; rule: string; patterns: VisualPattern[]; needs: 'trend' | 'trend_or_range' | 'not_opposing' };

/** Each setup: the reason code, the guide rule it implements, the patterns that trigger it, and the context it needs. */
const SETUPS: Record<'UP' | 'DOWN', Setup[]> = {
  UP: [
    { code: 'PULLBACK_RESUMED', rule: 'Buy pullbacks in an uptrend that resume upward', patterns: ['pullback_resumed_up'], needs: 'trend' },
    { code: 'VISIBLE_BREAKOUT', rule: 'Buy confirmed breakouts above a range', patterns: ['breakout_above_recent_range'], needs: 'trend_or_range' },
    {
      code: 'CONTINUATION_PATTERN_BREAKOUT',
      rule: 'Buy when a triangle, flag or handle breaks upward',
      patterns: ['ascending_triangle_breakout', 'bull_flag_breakout', 'cup_handle_breakout'],
      needs: 'trend_or_range',
    },
    {
      code: 'REVERSAL_PATTERN_BREAKOUT',
      rule: 'Bullish reversal (double bottom, inverse head and shoulders, falling wedge) only after the breakout and once lower lows have stopped',
      patterns: ['double_bottom_breakout', 'inverse_head_shoulders_breakout', 'falling_wedge_breakout'],
      needs: 'not_opposing',
    },
  ],
  DOWN: [
    { code: 'PULLBACK_RESUMED', rule: 'Sell rallies in a downtrend that turn back down', patterns: ['pullback_resumed_down'], needs: 'trend' },
    { code: 'VISIBLE_BREAKDOWN', rule: 'Sell when support breaks', patterns: ['breakdown_below_recent_range'], needs: 'trend_or_range' },
    {
      code: 'CONTINUATION_PATTERN_BREAKDOWN',
      rule: 'Sell when a triangle or flag breaks downward',
      patterns: ['descending_triangle_breakdown', 'bear_flag_breakdown'],
      needs: 'trend_or_range',
    },
    {
      code: 'REVERSAL_PATTERN_BREAKDOWN',
      rule: 'Bearish reversal only after the neckline breaks and higher highs have stopped',
      patterns: ['double_top_breakdown', 'head_shoulders_breakdown'],
      needs: 'not_opposing',
    },
  ],
};

export type VisualCandidate = { direction: 'UP' | 'DOWN'; cropKey: string; capturedAtMs: number };

export type VisualInput = {
  outcome: Exclude<ObserveOutcome, { ok: false; code: 'aborted' }>;
  context: ChartContext;
  /** Identifies the chart region; a different region never confirms an earlier snapshot. */
  cropKey: string;
  capturedAt: string;
  intervalSec: number;
  previous: VisualCandidate | null;
  now?: Date;
  id?: string;
};

const label = (p: string) => p.replaceAll('_', ' ');

export function evaluateVisual(input: VisualInput): { result: AnalysisResult; candidate: VisualCandidate | null } {
  const { outcome, context, cropKey, capturedAt, intervalSec, previous, now = new Date(), id = crypto.randomUUID() } = input;
  const p = VISUAL_PARAMS;
  const reasonCodes: string[] = [];
  const evidence: string[] = [];
  const done = (status: Direction, explanation: string, missingFields: string[] = [], candidate: VisualCandidate | null = null) => ({
    candidate,
    result: {
      id,
      status,
      source: 'visual_only' as const,
      instrumentType: context.instrumentType,
      assetLabel: context.assetLabel.trim(),
      chartTimeframeSec: context.chartTimeframeSec,
      predictionHorizonSec: context.predictionHorizonSec,
      analyzedAt: now.toISOString(),
      lastBarTime: null,
      barCount: 0,
      strategyVersion: VISUAL_STRATEGY_VERSION,
      parameters: { ...p, intervalSec },
      barDataVerified: false,
      reasonCodes,
      evidence,
      missingFields,
      assumptions: [
        `Read from a screenshot taken ${capturedAt} by a local vision model; no prices or indicator values were read.`,
        'Vision models can misread charts. Check the chart yourself.',
        'Rule-based and uncalibrated: no probability, confidence or win rate is implied.',
      ],
      explanation,
      indicators: null,
      isSimulation: true as const,
      actionableAsOrder: false as const,
    },
  });

  const missing = [
    ...(context.assetLabel.trim() === '' ? ['assetLabel'] : []),
    ...(context.chartTimeframeSec === null ? ['chartTimeframeSec'] : []),
    ...(context.predictionHorizonSec === null ? ['predictionHorizonSec'] : []),
  ];
  if (missing.length || context.chartTimeframeSec === null || context.predictionHorizonSec === null) {
    reasonCodes.push('MISSING_CONTEXT');
    const names: Record<string, string> = { assetLabel: 'asset label', chartTimeframeSec: 'chart timeframe', predictionHorizonSec: 'prediction horizon' };
    return done('INSUFFICIENT_DATA', `Fill in: ${missing.map((f) => names[f]).join(', ')}.`, missing);
  }

  if (!outcome.ok) {
    reasonCodes.push(outcome.code === 'timeout' ? 'MODEL_TIMEOUT' : outcome.code === 'bad_response' ? 'MODEL_BAD_RESPONSE' : 'MODEL_UNAVAILABLE');
    evidence.push(outcome.message);
    return done('INSUFFICIENT_DATA', 'The local vision model gave no usable answer for this snapshot.', ['visual observation']);
  }
  const o = outcome.observation;

  const ageMs = now.getTime() - Date.parse(capturedAt);
  if (ageMs > context.predictionHorizonSec * 1000 * p.maxSnapshotAgeFraction) {
    reasonCodes.push('STALE_SNAPSHOT');
    evidence.push(`Analysis finished ${Math.round(ageMs / 1000)}s after the screenshot; too late for a ${context.predictionHorizonSec}s horizon.`);
    return done('WAIT', 'The snapshot is too old for the chosen horizon.');
  }

  if (o.imageQuality === 'unreadable' || !o.candlesVisible) {
    reasonCodes.push('CHART_NOT_READABLE');
    return done('INSUFFICIENT_DATA', 'The model could not read candles in the selected region.', ['readable chart']);
  }

  const has = (pattern: VisualPattern) => o.patterns.includes(pattern);
  evidence.push(`Visible trend (model): ${label(o.visibleTrend)}.`);
  evidence.push(o.patterns.length ? `Detected patterns (model): ${o.patterns.map(label).join(', ')}.` : 'No listed pattern detected.');

  if (o.imageQuality === 'poor') {
    reasonCodes.push('LOW_IMAGE_QUALITY');
    return done('WAIT', 'The chart image is hard to read.');
  }
  if (context.predictionHorizonSec < context.chartTimeframeSec) {
    reasonCodes.push('HORIZON_SHORTER_THAN_TIMEFRAME');
    return done('WAIT', 'The prediction horizon is shorter than the chart timeframe.');
  }
  const upTrend = o.visibleTrend === 'upward_appearance' && has('higher_highs_higher_lows') && !has('lower_highs_lower_lows');
  const downTrend = o.visibleTrend === 'downward_appearance' && has('lower_highs_lower_lows') && !has('higher_highs_higher_lows');
  const range = has('sideways_range');
  const found = (dir: 'UP' | 'DOWN') => {
    const trend = dir === 'UP' ? upTrend : downTrend;
    const opposingStructure = has(dir === 'UP' ? 'lower_highs_lower_lows' : 'higher_highs_higher_lows');
    return SETUPS[dir].filter(
      (setup) =>
        setup.patterns.some(has) &&
        (setup.needs === 'trend' ? trend : setup.needs === 'trend_or_range' ? trend || (range && !opposingStructure) : !opposingStructure),
    );
  };
  const up = found('UP');
  const down = found('DOWN');
  if (upTrend) reasonCodes.push('TREND_UP');
  if (downTrend) reasonCodes.push('TREND_DOWN');

  if (up.length && down.length) {
    reasonCodes.push('SIGNAL_CONFLICT');
    return done('WAIT', 'Bullish and bearish setups are both visible.');
  }
  if (!up.length && !down.length) {
    if (range) {
      reasonCodes.push('SIDEWAYS');
      return done('WAIT', 'The chart is in a range: wait for a confirmed breakout.');
    }
    if (upTrend || downTrend) {
      reasonCodes.push('NO_CONFIRMED_SETUP');
      return done('WAIT', 'Trend is visible but no completed pullback, breakout or pattern yet.');
    }
    reasonCodes.push('TREND_UNCLEAR');
    return done('WAIT', 'The visible trend and price structure do not agree.');
  }
  const direction = up.length ? 'UP' : 'DOWN';
  const setups = up.length ? up : down;
  for (const setup of setups) {
    reasonCodes.push(setup.code);
    evidence.push(`Guide rule: ${setup.rule}.`);
  }

  const candidate: VisualCandidate = { direction, cropKey, capturedAtMs: Date.parse(capturedAt) };
  const confirmed =
    previous !== null &&
    previous.direction === direction &&
    previous.cropKey === cropKey &&
    candidate.capturedAtMs - previous.capturedAtMs <= p.maxConfirmGapIntervals * intervalSec * 1000;
  if (!confirmed) {
    reasonCodes.push('AWAITING_CONFIRMATION');
    return done('WAIT', `Possible ${direction} setup; waiting for the next snapshot to confirm it.`, [], candidate);
  }
  reasonCodes.push('CONFIRMED_ON_CONSECUTIVE_SNAPSHOTS');
  return done(direction, `${setups.map((x) => x.rule).join('; ')}. Seen on two consecutive snapshots.`, [], candidate);
}
