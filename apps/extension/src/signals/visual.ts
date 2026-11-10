import type { ObserveOutcome, VisualPattern } from '../analysis/ollama';
import type { AnalysisResult, ChartContext, Direction } from '../types/market';

export const VISUAL_STRATEGY_VERSION = 'visual-v0.1';

/**
 * Engineering hypotheses (D-021), not validated settings. A directional candidate needs the model's
 * trend, its structure pattern and its breakout pattern to agree on two consecutive snapshots of the
 * same chart region, and the snapshot must be fresh relative to the prediction horizon.
 */
export const VISUAL_PARAMS = {
  /** Two agreeing snapshots may be at most this many monitoring intervals apart. */
  maxConfirmGapIntervals: 3,
  /** A snapshot older than this fraction of the horizon (capture -> result) is too late to use. */
  maxSnapshotAgeFraction: 0.5,
} as const;

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
  if (has('sideways_range')) {
    reasonCodes.push('SIDEWAYS');
    return done('WAIT', 'The chart looks sideways.');
  }

  const up = o.visibleTrend === 'upward_appearance' && has('higher_highs_higher_lows') && !has('lower_highs_lower_lows');
  const down = o.visibleTrend === 'downward_appearance' && has('lower_highs_lower_lows') && !has('higher_highs_higher_lows');
  if (!up && !down) {
    reasonCodes.push('TREND_UNCLEAR');
    return done('WAIT', 'The visible trend and price structure do not agree.');
  }
  const direction = up ? 'UP' : 'DOWN';
  reasonCodes.push(up ? 'TREND_UP' : 'TREND_DOWN');

  if (!has(up ? 'breakout_above_recent_range' : 'breakdown_below_recent_range')) {
    reasonCodes.push('NO_VISIBLE_BREAKOUT');
    return done('WAIT', 'Trend is visible but there is no visible breakout.');
  }
  reasonCodes.push(up ? 'VISIBLE_BREAKOUT' : 'VISIBLE_BREAKDOWN');

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
  return done(direction, `Visible ${up ? 'uptrend' : 'downtrend'} with a ${up ? 'breakout' : 'breakdown'} seen on two consecutive snapshots.`, [], candidate);
}
