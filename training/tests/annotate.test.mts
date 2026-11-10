import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ObserveOutcome, VisualPattern } from '../../apps/extension/src/analysis/ollama.ts';
import { approve, autoLabel, clearReview, exportVerified, reject, type Observe } from '../lib/annotate.mts';
import { loadExamples } from '../lib/dataset.mts';
import { ExampleSchema, statusOf, type Example } from '../lib/labels.mts';
import { blank, encodePng } from '../lib/png.mts';

let data: string;
const dirOf = (id: string) => join(data, 'real', id);
const read = (id: string) => ExampleSchema.parse(JSON.parse(readFileSync(join(dirOf(id), 'example.json'), 'utf8')));

function add(id: string, group: string, time: string, chartStyle: 'candlestick' | 'line' = 'candlestick') {
  mkdirSync(dirOf(id), { recursive: true });
  for (const f of ['chart.png', 'recent.png']) writeFileSync(join(dirOf(id), f), encodePng(blank(8, 4, [0, 0, 0])));
  const e: Example = { id, source: 'user_crop', group, time, chartTimeframeSec: null, origin: { instrument: group, chartStyle, sourceId: '000000' }, labels: null, privacyReviewed: true };
  writeFileSync(join(dirOf(id), 'example.json'), JSON.stringify(e));
}

const answer = (patterns: VisualPattern[], candlesVisible = true): ObserveOutcome => ({
  ok: true,
  observation: {
    imageQuality: 'readable', candlesVisible, visibleTrend: 'upward_appearance', visibleTimeframeLabel: null, notes: ['steady climb'], patterns,
    source: 'visual_only', observationMethod: 'ollama:test', capturedAt: '2026-11-11T00:00:00.000Z', observedAt: '2026-11-11T01:00:00.000Z',
    durationMs: 1, droppedNotes: 0, reliableNumericOHLC: false, limitations: [],
  },
});
const ok: Observe = async () => answer(['higher_highs_higher_lows', 'breakout_above_recent_range', 'bull_flag_breakout']);
const run = (observe: Observe, signal = new AbortController().signal) => autoLabel({ dataDir: data, model: 'qwen3-vl:2b-instruct', retries: 1, signal, observe, retryDelayMs: 0 });

beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), 'cs-annotate-'));
  add('a-1', 'g-a', '2026-11-11T00:51:00.000Z');
  add('a-2', 'g-a', '2026-11-11T00:51:00.000Z');
  add('b-1', 'g-b', '2026-11-11T00:52:00.000Z', 'line');
});

describe('auto-label drafts', () => {
  it('saves each answer as a draft with provenance, never as a label', async () => {
    const p = await run(ok);
    expect(p).toMatchObject({ total: 3, done: 3, drafted: 3, failed: 0 });
    const e = read('a-1');
    expect(statusOf(e)).toBe('draft');
    expect(e.labels).toBeNull();
    expect(e.draft).toMatchObject({
      model: 'qwen3-vl:2b-instruct',
      labels: { structure: 'higher_highs_higher_lows', latestMove: 'broke_above_recent_highs', completedSetups: ['bull_flag_breakout'], candlesVisible: true },
      notes: ['steady climb'],
    });
    expect(e.draft!.imageSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never keeps candlesVisible on a line chart, and flags it', async () => {
    await run(ok);
    const d = read('b-1').draft!;
    expect(d.labels.candlesVisible).toBe(false);
    expect(d.warnings.join(' ')).toMatch(/line chart/i);
  });

  it('retries, then records a failure that the next run resumes', async () => {
    let calls = 0;
    const flaky: Observe = async () => (calls++, { ok: false, code: 'timeout', message: 'slow' });
    const p = await run(flaky);
    expect(p).toMatchObject({ drafted: 0, failed: 3 });
    expect(calls).toBe(6); // 1 try + 1 retry each
    expect(read('a-2').autoLabelError).toMatchObject({ code: 'timeout', attempts: 2 });
    expect(statusOf(read('a-2'))).toBe('failed');

    const again = await run(ok);
    expect(again).toMatchObject({ total: 3, drafted: 3 });
    expect(read('a-2').autoLabelError).toBeUndefined();
    expect((await run(ok)).total).toBe(0); // drafts are not redone
  });

  it('stops on cancel without writing, and resumes the rest later', async () => {
    const c = new AbortController();
    const cancelAfterFirst: Observe = async (e) => {
      if (e.example.id !== 'a-1') c.abort();
      return c.signal.aborted ? { ok: false, code: 'aborted', message: 'Cancelled.' } : ok(e, '', c.signal);
    };
    const p = await run(cancelAfterFirst, c.signal);
    expect(p).toMatchObject({ drafted: 1, stopped: 'Cancelled' });
    expect(statusOf(read('a-2'))).toBe('unlabeled');
    expect((await run(ok)).total).toBe(2);
  });

  it('stops the whole run when the model is not installed', async () => {
    const p = await run(async () => ({ ok: false, code: 'model_missing', message: 'Model x is not installed.' }));
    expect(p).toMatchObject({ done: 1, failed: 1, stopped: 'Model x is not installed.' });
  });

  it('does not overwrite an example a person reviewed during the run', async () => {
    const reviewMidRun: Observe = async (e, m, s) => {
      if (e.example.id === 'a-1') reject(dirOf('a-1'), 'bad crop', 'me');
      return ok(e, m, s);
    };
    await run(reviewMidRun);
    expect(statusOf(read('a-1'))).toBe('rejected');
    expect(read('a-1').draft).toBeUndefined();
  });
});

describe('review and export', () => {
  const labels = { imageQuality: 'readable', candlesVisible: true, visibleTrend: 'upward_appearance', structure: 'unclear', completedSetups: [], latestMove: 'none' };

  it('validates approvals against the schema and the chart style', async () => {
    await run(ok);
    expect(() => approve(dirOf('a-1'), { ...labels, visibleTrend: 'up' }, 'me')).toThrow();
    expect(() => approve(dirOf('b-1'), labels, 'me')).toThrow(/line chart/);
    const e = approve(dirOf('a-1'), labels, 'me');
    expect(e).toMatchObject({ reviewStatus: 'approved', annotator: 'me', labels });
    expect(e.draft?.model).toBe('qwen3-vl:2b-instruct'); // provenance kept
    expect(statusOf(clearReview(dirOf('a-1')))).toBe('draft');
  });

  it('rejects an example whose labels and status disagree', () => {
    expect(ExampleSchema.safeParse({ ...read('a-1'), reviewStatus: 'draft', labels }).success).toBe(false);
    expect(ExampleSchema.safeParse({ ...read('a-1'), reviewStatus: 'approved' }).success).toBe(false);
  });

  it('exports approved examples only, with images, and keeps each group in one split', async () => {
    await run(ok);
    approve(dirOf('a-1'), labels, 'me');
    approve(dirOf('a-2'), labels, 'me');
    approve(dirOf('b-1'), { ...labels, candlesVisible: false }, 'me');
    reject(dirOf('b-1'), 'wrong', 'me');
    const out = join(data, 'exports', 'v');
    const m = exportVerified(out, data);
    expect(m.count).toBe(2);
    expect(m.groups).toEqual({ 'g-a': 'train' });
    const rows = readFileSync(join(out, 'labels.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(['a-1', 'a-2']);
    expect(rows[0]).toMatchObject({ labels, draftModel: 'qwen3-vl:2b-instruct', editedFromDraft: true, split: 'train' });
    for (const r of rows) for (const f of Object.values(r.images) as string[]) expect(existsSync(join(out, f))).toBe(true);
    expect(loadExamples(data).issues).toEqual([]);
  });
});
