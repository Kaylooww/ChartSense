import { describe, expect, it } from 'vitest';
import type { ObserveOutcome, VisualObservation } from '../src/analysis/ollama';
import { evaluateVisual, type VisualInput } from '../src/signals/visual';
import { AnalysisResultSchema } from '../src/types/market';

const CAPTURED = '2026-11-10T08:00:00.000Z';
const NOW = new Date('2026-11-10T08:00:06Z'); // 6 s after capture

function obs(patch: Partial<VisualObservation> = {}): Extract<ObserveOutcome, { ok: true }> {
  return {
    ok: true,
    observation: {
      imageQuality: 'readable',
      candlesVisible: true,
      visibleTrend: 'upward_appearance',
      patterns: ['higher_highs_higher_lows', 'breakout_above_recent_range'],
      visibleTimeframeLabel: null,
      notes: [],
      source: 'visual_only',
      observationMethod: 'ollama:qwen3-vl:4b',
      capturedAt: CAPTURED,
      observedAt: NOW.toISOString(),
      durationMs: 6000,
      droppedNotes: 0,
      reliableNumericOHLC: false,
      limitations: [],
      ...patch,
    },
  };
}

const base: VisualInput = {
  outcome: obs(),
  context: { assetLabel: 'MOCK/USD', instrumentType: 'fixed_expiry_demo', chartTimeframeSec: 300, predictionHorizonSec: 900 },
  cropKey: 'crop-a',
  capturedAt: CAPTURED,
  intervalSec: 5,
  previous: null,
  now: NOW,
  id: 'test',
};
const run = (patch: Partial<VisualInput> = {}) => evaluateVisual({ ...base, ...patch });

describe('visual-v0.1', () => {
  it('needs two consecutive agreeing snapshots of the same region before UP', () => {
    const first = run();
    expect(first.result.status).toBe('WAIT');
    expect(first.result.reasonCodes).toContain('AWAITING_CONFIRMATION');
    expect(first.candidate).toMatchObject({ direction: 'UP', cropKey: 'crop-a' });

    const second = run({ previous: { ...first.candidate!, capturedAtMs: Date.parse(CAPTURED) - 5000 } });
    expect(second.result.status).toBe('UP');
    expect(second.result.reasonCodes).toEqual(['TREND_UP', 'VISIBLE_BREAKOUT', 'CONFIRMED_ON_CONSECUTIVE_SNAPSHOTS']);

    expect(run({ previous: { ...first.candidate!, cropKey: 'crop-b' } }).result.status).toBe('WAIT'); // other region
    expect(run({ previous: { ...first.candidate!, capturedAtMs: Date.parse(CAPTURED) - 60_000 } }).result.status).toBe('WAIT'); // too far apart
  });

  it('gives the symmetric DOWN', () => {
    const outcome = obs({ visibleTrend: 'downward_appearance', patterns: ['lower_highs_lower_lows', 'breakdown_below_recent_range'] });
    const first = run({ outcome });
    expect(run({ outcome, previous: first.candidate }).result.status).toBe('DOWN');
  });

  it.each([
    ['trend without a completed setup', obs({ patterns: ['higher_highs_higher_lows'] }), 'NO_CONFIRMED_SETUP'],
    ['trend vs structure conflict', obs({ patterns: ['lower_highs_lower_lows', 'breakout_above_recent_range'] }), 'TREND_UNCLEAR'],
    ['unclear trend', obs({ visibleTrend: 'unclear' }), 'TREND_UNCLEAR'],
    ['range without breakout', obs({ visibleTrend: 'sideways_appearance', patterns: ['sideways_range'] }), 'SIDEWAYS'],
    ['pullback in an uptrend that has not resumed (no pattern)', obs({ patterns: ['higher_highs_higher_lows'] }), 'NO_CONFIRMED_SETUP'],
    ['reversal pattern while lower lows continue', obs({ visibleTrend: 'downward_appearance', patterns: ['lower_highs_lower_lows', 'double_bottom_breakout'] }), 'NO_CONFIRMED_SETUP'],
    ['falling wedge while lower lows continue', obs({ visibleTrend: 'downward_appearance', patterns: ['lower_highs_lower_lows', 'falling_wedge_breakout'] }), 'NO_CONFIRMED_SETUP'],
    ['bullish and bearish setups together', obs({ visibleTrend: 'sideways_appearance', patterns: ['sideways_range', 'breakout_above_recent_range', 'breakdown_below_recent_range'] }), 'SIGNAL_CONFLICT'],
    ['poor image', obs({ imageQuality: 'poor' }), 'LOW_IMAGE_QUALITY'],
  ])('%s -> WAIT', (_, outcome, code) => {
    const r = run({ outcome }).result;
    expect(r.status).toBe('WAIT');
    expect(r.reasonCodes).toContain(code);
  });

  it.each([
    ['pullback resumed in an uptrend', obs({ patterns: ['higher_highs_higher_lows', 'pullback_resumed_up'] }), 'UP', 'PULLBACK_RESUMED'],
    ['range breakout', obs({ visibleTrend: 'sideways_appearance', patterns: ['sideways_range', 'breakout_above_recent_range'] }), 'UP', 'VISIBLE_BREAKOUT'],
    ['bull flag breakout in an uptrend', obs({ patterns: ['higher_highs_higher_lows', 'bull_flag_breakout'] }), 'UP', 'CONTINUATION_PATTERN_BREAKOUT'],
    ['double bottom breakout after a decline', obs({ visibleTrend: 'downward_appearance', patterns: ['double_bottom_breakout'] }), 'UP', 'REVERSAL_PATTERN_BREAKOUT'],
    ['falling wedge breakout after a decline', obs({ visibleTrend: 'downward_appearance', patterns: ['falling_wedge_breakout'] }), 'UP', 'REVERSAL_PATTERN_BREAKOUT'],
    ['bear flag breakdown in a downtrend', obs({ visibleTrend: 'downward_appearance', patterns: ['lower_highs_lower_lows', 'bear_flag_breakdown'] }), 'DOWN', 'CONTINUATION_PATTERN_BREAKDOWN'],
    ['head and shoulders breakdown', obs({ visibleTrend: 'upward_appearance', patterns: ['head_shoulders_breakdown'] }), 'DOWN', 'REVERSAL_PATTERN_BREAKDOWN'],
  ])('guide setup: %s -> %s after confirmation', (_, outcome, direction, code) => {
    const first = run({ outcome });
    expect(first.result.status).toBe('WAIT'); // a single snapshot is never enough
    const second = run({ outcome, previous: first.candidate });
    expect(second.result.status).toBe(direction);
    expect(second.result.reasonCodes).toContain(code);
    expect(second.result.evidence.some((e) => e.startsWith('Guide rule:'))).toBe(true);
  });

  it.each([
    ['unreadable chart', obs({ imageQuality: 'unreadable' }), 'CHART_NOT_READABLE'],
    ['no candles', obs({ candlesVisible: false }), 'CHART_NOT_READABLE'],
    ['Ollama down', { ok: false, code: 'unreachable', message: 'Could not reach Ollama.' } as const, 'MODEL_UNAVAILABLE'],
    ['model timeout', { ok: false, code: 'timeout', message: 'No answer within 90s.' } as const, 'MODEL_TIMEOUT'],
  ])('%s -> INSUFFICIENT_DATA', (_, outcome, code) => {
    const r = run({ outcome }).result;
    expect(r.status).toBe('INSUFFICIENT_DATA');
    expect(r.reasonCodes).toEqual([code]);
  });

  it('waits when the snapshot is too old for the horizon, and keeps timeframe and horizon separate', () => {
    const late = run({ now: new Date(Date.parse(CAPTURED) + 500_000) }).result; // > half of 900 s
    expect(late.reasonCodes).toEqual(['STALE_SNAPSHOT']);
    const short = run({ context: { ...base.context, predictionHorizonSec: 60 } }).result;
    expect(short.reasonCodes).toContain('HORIZON_SHORTER_THAN_TIMEFRAME');
    expect([short.chartTimeframeSec, short.predictionHorizonSec]).toEqual([300, 60]);
  });

  it('requires context and never carries indicator values or a confidence number', () => {
    const r = run({ context: { ...base.context, predictionHorizonSec: null } }).result;
    expect(r.status).toBe('INSUFFICIENT_DATA');
    expect(r.missingFields).toEqual(['predictionHorizonSec']);
    for (const result of [r, run().result]) {
      expect(AnalysisResultSchema.parse(result)).toBeTruthy();
      expect(result.source).toBe('visual_only');
      expect(result.indicators).toBeNull();
      expect(result.barDataVerified).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/"[a-z]*(confidence|probability|winRate|accuracy)[a-z]*"\s*:/i);
    }
  });
});
