// Draft auto-labeling and human review of real examples (training/README.md, D-031).
// Model answers are stored as `draft` only; `labels` (what splits, eval and SFT use) is written only
// by a person approving. All writes go to example.json files on this machine.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { observeChart, patternsFrom, type ObserveOutcome, type VisionModel, type VisualPattern } from '../../apps/extension/src/analysis/ollama.ts';
import { imageBase64, loadExamples, type Loaded } from './dataset.mts';
import { ExampleSchema, LabelsSchema, statusOf, type Draft, type Example, type Labels } from './labels.mts';
import { chronologicalGroupSplit, type SplitName } from './split.mts';

const shape = LabelsSchema.shape;
const STRUCTURES = shape.structure.options.filter((v) => v !== 'unclear');
const MOVES = shape.latestMove.options.filter((v) => v !== 'none');
const moveFor = new Map(MOVES.map((m) => [patternsFrom('unclear', m, [])[0]!, m]));
const isLine = (e: Example) => e.origin?.chartStyle === 'line';

/** Reads example.json, applies `change`, validates the whole example and writes it atomically. */
export function updateExample(dir: string, change: (e: Example) => Example): Example {
  const next = ExampleSchema.parse(change(ExampleSchema.parse(JSON.parse(readFileSync(join(dir, 'example.json'), 'utf8')))));
  const tmp = join(dir, 'example.json.tmp');
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  renameSync(tmp, join(dir, 'example.json')); // a killed run never leaves a half-written file
  return next;
}

export const imagesSha256 = (dir: string) =>
  createHash('sha256').update(readFileSync(join(dir, 'chart.png'))).update(readFileSync(join(dir, 'recent.png'))).digest('hex');

/**
 * Turns the extension's observation back into label fields. observeChart merges structure, latest
 * move and setups into one pattern list; the three groups are disjoint, so the split is exact.
 */
export function draftFromOutcome(outcome: Extract<ObserveOutcome, { ok: true }>, example: Example, model: string, imageSha256: string): Draft {
  const o = outcome.observation;
  const has = (p: string) => o.patterns.includes(p as VisualPattern);
  const structure = STRUCTURES.find(has) ?? 'unclear';
  const latestMove = o.patterns.map((p) => moveFor.get(p)).find(Boolean) ?? 'none';
  const setups = shape.completedSetups.element.options.filter(has);
  const warnings: string[] = [];
  let candlesVisible = o.candlesVisible;
  if (isLine(example) && candlesVisible) {
    candlesVisible = false;
    warnings.push('Line chart: the model said candles are visible; set to false.');
  }
  if (example.origin?.chartStyle === 'candlestick' && !candlesVisible) warnings.push('Candlestick crop, but the model said no candles are visible.');
  if (isLine(example)) warnings.push('Line chart: the prompts describe candles; check latestMove and quality against the line itself.');
  if (o.droppedNotes) warnings.push(`${o.droppedNotes} model note(s) with numbers were dropped.`);
  return {
    labels: LabelsSchema.parse({ imageQuality: o.imageQuality, candlesVisible, visibleTrend: o.visibleTrend, structure, completedSetups: setups, latestMove }),
    visibleTimeframeLabel: o.visibleTimeframeLabel,
    notes: o.notes,
    warnings,
    model,
    createdAt: o.observedAt,
    imageSha256,
  };
}

export type Observe = (e: Loaded, model: string, signal: AbortSignal) => Promise<ObserveOutcome>;
export const ollamaObserve: Observe = (e, model, signal) =>
  observeChart({ pngBase64: imageBase64(e.dir, 'chart.png'), recentBase64: imageBase64(e.dir, 'recent.png'), capturedAt: e.example.time, model: model as VisionModel, signal });

export type Progress = { total: number; done: number; drafted: number; failed: number; current: string | null; lastError: string | null; stopped: string | null };

/** Unlabeled and failed real examples: what Auto-Label All (re)processes. Drafts and reviewed ones are skipped. */
export const pending = (examples: Loaded[]) => examples.filter((e) => e.example.source !== 'synthetic' && ['unlabeled', 'failed'].includes(statusOf(e.example)));

/**
 * Drafts every pending example, one at a time, saving each result immediately so a stopped run
 * resumes where it left off. Retries timeouts / bad answers / connection errors; a missing model or a
 * cancel stops the run. Never touches an example a person reviewed meanwhile.
 */
export async function autoLabel(opts: {
  dataDir?: string;
  model: string;
  retries: number;
  signal: AbortSignal;
  observe?: Observe;
  onProgress?: (p: Progress) => void;
  now?: () => Date;
  retryDelayMs?: number;
}): Promise<Progress> {
  const { model, retries, signal, observe = ollamaObserve, onProgress = () => {}, now = () => new Date(), retryDelayMs = 2000 } = opts;
  const todo = pending(loadExamples(opts.dataDir).examples);
  const p: Progress = { total: todo.length, done: 0, drafted: 0, failed: 0, current: null, lastError: null, stopped: null };
  onProgress(p);
  for (const e of todo) {
    if (signal.aborted) break;
    p.current = e.example.id;
    onProgress(p);
    let outcome: ObserveOutcome | null = null;
    let attempts = 0;
    while (attempts <= retries && !signal.aborted) {
      attempts++;
      outcome = await observe(e, model, signal);
      if (outcome.ok || outcome.code === 'aborted' || outcome.code === 'model_missing') break;
      if (attempts <= retries) await new Promise((r) => setTimeout(r, retryDelayMs * attempts));
    }
    if (!outcome || (!outcome.ok && outcome.code === 'aborted') || signal.aborted) break;
    const sha = imagesSha256(e.dir);
    const result = outcome;
    let skipped = false;
    updateExample(e.dir, (cur) => {
      if (!['unlabeled', 'failed'].includes(statusOf(cur))) return (skipped = true), cur;
      if (result.ok) {
        const { autoLabelError: _, ...rest } = cur;
        return { ...rest, reviewStatus: 'draft', draft: draftFromOutcome(result, cur, model, sha) };
      }
      return { ...cur, reviewStatus: 'failed', autoLabelError: { code: result.code, message: result.message, attempts, model, at: now().toISOString() } };
    });
    p.done++;
    if (!skipped && result.ok) p.drafted++;
    if (!skipped && !result.ok) {
      p.failed++;
      p.lastError = `${e.example.id}: ${result.message}`;
      if (result.code === 'model_missing') {
        p.stopped = result.message;
        break;
      }
    }
    onProgress(p);
  }
  if (signal.aborted) p.stopped = 'Cancelled';
  p.current = null;
  onProgress(p);
  return p;
}

/** A person approves labels (edited or as drafted). Line charts can never be approved with candles. */
export function approve(dir: string, input: unknown, annotator: string, now = new Date()): Example {
  const labels: Labels = LabelsSchema.parse(input);
  return updateExample(dir, (cur) => {
    if (isLine(cur) && labels.candlesVisible) throw new Error('This crop is a line chart: candlesVisible must be false.');
    const { reviewNote: _, ...rest } = cur;
    return { ...rest, labels, annotator, reviewStatus: 'approved', reviewedAt: now.toISOString() };
  });
}

export function reject(dir: string, note: string, annotator: string, now = new Date()): Example {
  return updateExample(dir, (cur) => ({ ...cur, labels: null, annotator, reviewStatus: 'rejected', reviewNote: note.slice(0, 500), reviewedAt: now.toISOString() }));
}

/** Undo a review: back to the draft if there is one, else unlabeled. The draft itself is kept. */
export function clearReview(dir: string): Example {
  return updateExample(dir, ({ labels: _l, annotator: _a, reviewNote: _n, reviewedAt: _r, ...cur }) => ({ ...cur, labels: null, reviewStatus: cur.draft ? 'draft' : 'unlabeled' }));
}

/**
 * Writes approved real examples only (labels + both images) with a chronological, group-aware split:
 * every crop of one session/instrument lands in the same split. Drafts are never exported.
 */
export function exportVerified(outDir: string, dataDir?: string, now = new Date()) {
  const approved = loadExamples(dataDir).examples.filter((e) => e.example.source !== 'synthetic' && statusOf(e.example) === 'approved' && e.example.labels);
  const splits = chronologicalGroupSplit(approved.map((e) => e.example));
  const splitOf = new Map(Object.entries(splits).flatMap(([name, ids]) => ids.map((id) => [id, name as SplitName])));
  const groups: Record<string, SplitName> = {};
  for (const e of approved) {
    const s = splitOf.get(e.example.id)!;
    if (groups[e.example.group] && groups[e.example.group] !== s) throw new Error(`group ${e.example.group} spans two splits`);
    groups[e.example.group] = s;
  }
  mkdirSync(join(outDir, 'images'), { recursive: true });
  const rows = approved.map(({ dir, example: x }) => {
    for (const f of ['chart', 'recent']) copyFileSync(join(dir, `${f}.png`), join(outDir, 'images', `${x.id}-${f}.png`));
    return { id: x.id, split: splitOf.get(x.id), group: x.group, source: x.source, time: x.time, origin: x.origin ?? null, labels: x.labels, annotator: x.annotator ?? null, reviewedAt: x.reviewedAt ?? null, draftModel: x.draft?.model ?? null, editedFromDraft: x.draft ? JSON.stringify(x.draft.labels) !== JSON.stringify(x.labels) : null, images: { chart: `images/${x.id}-chart.png`, recent: `images/${x.id}-recent.png` } };
  });
  writeFileSync(join(outDir, 'labels.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  const manifest = {
    exportedAt: now.toISOString(),
    count: rows.length,
    splits: { train: splits.train.length, validation: splits.validation.length, test: splits.test.length },
    groups,
    note: 'Human-approved labels only. Crops of one screenshot overlap heavily: they are views of a few moments, not independent market observations. Groups never cross splits.',
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
