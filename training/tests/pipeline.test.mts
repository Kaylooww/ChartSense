import { describe, expect, it } from 'vitest';
import { LatestMoveSchema, ModelObservationSchema, MOVE_PROMPT, PROMPT, type ObserveOutcome } from '../../apps/extension/src/analysis/ollama.ts';
import { readPngSize } from '../../apps/extension/src/capture/pngSize.ts';
import type { Candle as Bar } from '../../apps/extension/src/types/market.ts';
import { summarize, walkForward } from '../lib/backtest.mts';
import { goldPatterns, LabelsSchema, targetsFor, type Labels } from '../lib/labels.mts';
import { computeReport, goldOutcome } from '../lib/metrics.mts';
import { blank, cropRight, decodePng, encodePng, fillRect, fitWithin } from '../lib/png.mts';
import { sftRecords } from '../lib/sft.mts';
import { chronologicalGroupSplit } from '../lib/split.mts';
import { renderChart, SCENARIO_LABELS, SCENARIOS, scenarioCandles } from '../lib/synth.mts';

describe('png', () => {
  it('encodes a valid PNG and crops the newest 30% like the extension', () => {
    const img = blank(100, 40, [0, 0, 0]);
    fillRect(img, 90, 0, 10, 40, [255, 0, 0]);
    const png = encodePng(img);
    expect(readPngSize(`data:image/png;base64,${png.toString('base64')}`)).toEqual({ width: 100, height: 40 });
    const strip = cropRight(img, 0.7);
    expect(strip.width).toBe(30);
    expect([...strip.data.subarray((29) * 4, 30 * 4)]).toEqual([255, 0, 0, 255]); // right edge kept
  });

  it('decodes what it encodes and downscales to the extension size limit', () => {
    const img = blank(2048, 10, [10, 20, 30]);
    fillRect(img, 1024, 0, 1024, 10, [200, 100, 50]);
    expect(decodePng(encodePng(img))).toEqual(img);
    const small = fitWithin(img, 1024);
    expect([small.width, small.height]).toEqual([1024, 5]);
    expect([...small.data.subarray(1023 * 4, 1024 * 4)]).toEqual([200, 100, 50, 255]);
    expect(fitWithin(blank(100, 50, [0, 0, 0]))).toEqual(blank(100, 50, [0, 0, 0])); // never upscaled
  });
});

describe('synthetic scenarios', () => {
  it('have labels that are valid model answers for both schemas', () => {
    for (const s of SCENARIOS) {
      const labels = LabelsSchema.parse(SCENARIO_LABELS[s]);
      const { main, move } = targetsFor(labels);
      expect(ModelObservationSchema.parse(main)).toBeTruthy();
      expect(LatestMoveSchema.parse(move)).toBeTruthy();
    }
  });

  it('construct what the labels say inside the newest 30% strip', () => {
    const up = scenarioCandles('up_breakout', 7);
    const stripStart = Math.floor(up.length * 0.7);
    const earlierTop = Math.max(...up.slice(0, -3).map((c) => c.high));
    expect(up.slice(-3).every((c) => c.close > earlierTop)).toBe(true);
    expect(up.length - 3).toBeGreaterThan(stripStart); // the breakout candles are in the strip
    const pull = scenarioCandles('up_pullback_resumed', 7);
    const peak = Math.max(...pull.slice(0, -9).map((c) => c.close));
    expect(pull.at(-1)!.close).toBeLessThan(peak); // resumed up, did not break out
    expect(pull.at(-1)!.close).toBeGreaterThan(pull.at(-5)!.close);
  });

  it('mirror up scenarios exactly into down scenarios', () => {
    const up = scenarioCandles('up_breakout', 3);
    const down = scenarioCandles('down_breakdown', 3);
    down.forEach((c, i) => {
      expect(c.close).toBeCloseTo(200 - up[i]!.close, 10);
      expect(c.high).toBeCloseTo(200 - up[i]!.low, 10);
    });
    expect(renderChart(up).width).toBe(640);
  });
});

describe('chronologicalGroupSplit', () => {
  it('never splits a group and keeps test newer than train', () => {
    const ex = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, group: `g${Math.floor(i / 2)}`, time: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    const s = chronologicalGroupSplit(ex);
    expect(s.train.length + s.validation.length + s.test.length).toBe(40);
    const groupOf = (id: string) => ex.find((e) => e.id === id)!.group;
    const trainGroups = new Set(s.train.map(groupOf));
    expect(s.test.some((id) => trainGroups.has(groupOf(id)))).toBe(false);
    const time = (id: string) => ex.find((e) => e.id === id)!.time;
    expect(Math.max(...s.train.map((id) => Date.parse(time(id))))).toBeLessThan(Math.min(...s.test.map((id) => Date.parse(time(id)))));
    expect(s.test.length).toBeGreaterThanOrEqual(5);
  });
});

describe('metrics', () => {
  const gold = SCENARIO_LABELS.up_breakout;
  const at = '2026-01-01T00:00:00.000Z';
  const wrong: Labels = { ...SCENARIO_LABELS.range };

  it('scores perfect answers as perfect and counts invalid JSON separately', () => {
    const bad: ObserveOutcome = { ok: false, code: 'bad_response', message: 'x' };
    const r = computeReport([
      { id: 'a', gold, outcome: goldOutcome(gold, at), capturedAt: at, latencyMs: 100 },
      { id: 'b', gold, outcome: bad as Extract<ObserveOutcome, { ok: false }> & { code: 'bad_response' }, capturedAt: at, latencyMs: 300 },
    ]);
    expect(r.answered).toBe(1);
    expect(r.invalidJsonRate).toBe(0.5);
    expect(Object.values(r.fieldAccuracy).every((v) => v === 1)).toBe(true);
    expect(r.patternMicro).toMatchObject({ precision: 1, recall: 1 });
    expect(r.latencyMs).toMatchObject({ p50: 300, p95: 300, mean: 200 });
    // gold gives a rule candidate (UP); the failed answer gives none
    expect(r.decisionConfusion).toEqual({ 'UP->UP': 1, 'UP->NONE': 1 });
  });

  it('computes per-pattern precision and recall', () => {
    const r = computeReport([{ id: 'a', gold, outcome: goldOutcome(wrong, at), capturedAt: at, latencyMs: 1 }]);
    expect(r.patterns.sideways_range).toMatchObject({ tp: 0, fp: 1, precision: 0 });
    expect(r.patterns.breakout_above_recent_range).toMatchObject({ fn: 1, recall: 0 });
    expect(goldPatterns(gold)).toEqual(['higher_highs_higher_lows', 'breakout_above_recent_range']);
  });
});

describe('walkForward', () => {
  const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({ time: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), open: i, high: i + 1, low: i - 1, close: i }));

  it('never shows the evaluator a bar from after "now"', () => {
    walkForward(bars, {
      timeframeSec: 60,
      horizonBars: 3,
      startIndex: 5,
      evaluate: (past, nowMs) => {
        expect(past.every((b) => Date.parse(b.time) + 60_000 <= nowMs)).toBe(true);
        expect(Date.parse(past.at(-1)!.time) + 60_000).toBe(nowMs);
        return 'WAIT';
      },
    });
  });

  it('judges at entry + horizon and does not overlap trades', () => {
    const { trades } = walkForward(bars, { timeframeSec: 60, horizonBars: 3, startIndex: 5, evaluate: () => 'DOWN' });
    expect(trades[0]).toMatchObject({ index: 5, entryClose: 5, exitClose: 8, result: 'LOSS' });
    expect(trades[1]!.index).toBe(8); // next signal only after the first expired
    expect(summarize(trades, 0.8)).toMatchObject({ wins: 0, hitRate: 0, breakevenHitRate: 1 / 1.8 });
  });
});

describe('sft records', () => {
  it('use the extension prompts verbatim and answers the extension can parse', () => {
    const [chart, recent] = sftRecords('x', SCENARIO_LABELS.bottom_turning_up, { chart: 'a/chart.png', recent: 'a/recent.png' });
    expect(chart!.messages[0].content[1].text).toBe(PROMPT);
    expect(recent!.messages[0].content[1].text).toBe(MOVE_PROMPT);
    expect(ModelObservationSchema.parse(JSON.parse(chart!.messages[1].content[0].text))).toBeTruthy();
    expect(LatestMoveSchema.parse(JSON.parse(recent!.messages[1].content[0].text))).toEqual({ latestMove: 'pulled_back_then_turned_up' });
  });
});
