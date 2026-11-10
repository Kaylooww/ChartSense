import { LatestMoveSchema, patternsFrom, type ObserveOutcome, type VisualObservation, type VisualPattern } from '../../apps/extension/src/analysis/ollama.ts';
import { evaluateVisual } from '../../apps/extension/src/signals/visual.ts';
import type { ChartContext } from '../../apps/extension/src/types/market.ts';
import { goldPatterns, type Labels } from './labels.mts';

export type EvalRow = { id: string; gold: Labels; outcome: Exclude<ObserveOutcome, { ok: false; code: 'aborted' }>; capturedAt: string; latencyMs: number };

const STRUCTURES = ['higher_highs_higher_lows', 'lower_highs_lower_lows', 'sideways_range'] as const;
const MOVE_PATTERNS = new Set(LatestMoveSchema.shape.latestMove.options.flatMap((m) => patternsFrom('unclear', m, [])));
const structureOf = (ps: VisualPattern[]) => STRUCTURES.find((s) => ps.includes(s)) ?? 'unclear';
const moveOf = (ps: VisualPattern[]) => ps.find((p) => MOVE_PATTERNS.has(p)) ?? 'none';

/** The rule's decision from one snapshot (no two-snapshot confirmation): UP, DOWN or NONE. */
const CONTEXT: ChartContext = { assetLabel: 'EVAL', instrumentType: 'fixed_expiry_demo', chartTimeframeSec: 60, predictionHorizonSec: 300 };
function decision(outcome: EvalRow['outcome'], capturedAt: string): 'UP' | 'DOWN' | 'NONE' {
  const { candidate } = evaluateVisual({ outcome, context: CONTEXT, cropKey: 'eval', capturedAt, intervalSec: 10, previous: null, now: new Date(capturedAt), id: 'eval' });
  return candidate?.direction ?? 'NONE';
}

export function goldOutcome(gold: Labels, capturedAt: string): Extract<ObserveOutcome, { ok: true }> {
  const observation: VisualObservation = {
    imageQuality: gold.imageQuality,
    candlesVisible: gold.candlesVisible,
    visibleTrend: gold.visibleTrend,
    visibleTimeframeLabel: null,
    notes: [],
    patterns: goldPatterns(gold),
    source: 'visual_only',
    observationMethod: 'gold-labels',
    capturedAt,
    observedAt: capturedAt,
    durationMs: 0,
    droppedNotes: 0,
    reliableNumericOHLC: false,
    limitations: [],
  };
  return { ok: true, observation };
}

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : null);
const ratio = (a: number, b: number) => (b ? a / b : null);

export function computeReport(rows: EvalRow[]) {
  const ok = rows.filter((r): r is EvalRow & { outcome: { ok: true } } => r.outcome.ok);
  const errors: Record<string, number> = {};
  for (const r of rows) if (!r.outcome.ok) errors[r.outcome.code] = (errors[r.outcome.code] ?? 0) + 1;

  const field = (get: (o: VisualObservation) => unknown, gold: (g: Labels) => unknown) =>
    ratio(ok.filter((r) => get(r.outcome.observation) === gold(r.gold)).length, ok.length);
  const fieldAccuracy = {
    imageQuality: field((o) => o.imageQuality, (g) => g.imageQuality),
    candlesVisible: field((o) => o.candlesVisible, (g) => g.candlesVisible),
    visibleTrend: field((o) => o.visibleTrend, (g) => g.visibleTrend),
    structure: field((o) => structureOf(o.patterns), (g) => g.structure),
    latestMove: field((o) => moveOf(o.patterns), (g) => moveOf(goldPatterns(g))),
  };

  const counts = new Map<VisualPattern, { tp: number; fp: number; fn: number }>();
  const bump = (p: VisualPattern, k: 'tp' | 'fp' | 'fn') => {
    const c = counts.get(p) ?? { tp: 0, fp: 0, fn: 0 };
    c[k] += 1;
    counts.set(p, c);
  };
  for (const r of ok) {
    const gold = new Set(goldPatterns(r.gold));
    const pred = new Set(r.outcome.observation.patterns);
    for (const p of pred) bump(p, gold.has(p) ? 'tp' : 'fp');
    for (const p of gold) if (!pred.has(p)) bump(p, 'fn');
  }
  const patterns = Object.fromEntries(
    [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([p, c]) => [p, { ...c, precision: ratio(c.tp, c.tp + c.fp), recall: ratio(c.tp, c.tp + c.fn) }]),
  );
  const sum = [...counts.values()].reduce((a, c) => ({ tp: a.tp + c.tp, fp: a.fp + c.fp, fn: a.fn + c.fn }), { tp: 0, fp: 0, fn: 0 });

  const confusion: Record<string, number> = {};
  let agree = 0;
  for (const r of rows) {
    const g = decision(goldOutcome(r.gold, r.capturedAt), r.capturedAt);
    const p = decision(r.outcome, r.capturedAt);
    confusion[`${g}->${p}`] = (confusion[`${g}->${p}`] ?? 0) + 1;
    if (g === p) agree += 1;
  }

  const latencies = rows.filter((r) => r.outcome.ok || r.outcome.code === 'bad_response').map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    n: rows.length,
    answered: ok.length,
    invalidJsonRate: ratio(errors.bad_response ?? 0, rows.length),
    errors,
    fieldAccuracy,
    patternMicro: { ...sum, precision: ratio(sum.tp, sum.tp + sum.fp), recall: ratio(sum.tp, sum.tp + sum.fn) },
    patterns,
    /** Rule decision from the model's answer vs from the gold labels (single snapshot). */
    decisionAgreement: ratio(agree, rows.length),
    decisionConfusion: confusion,
    latencyMs: {
      mean: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
  };
}
export type EvalReport = ReturnType<typeof computeReport>;
