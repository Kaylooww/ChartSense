// Evaluates an Ollama model on a split through the extension's real request code (observeChart:
// same prompts, schemas, think:false, two questions per image). Writes a JSON report to training/reports/.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { observeChart, VISION_MODELS, type VisionModel } from '../../apps/extension/src/analysis/ollama.ts';
import { DATA_DIR, imageBase64, loadExamples, TRAINING_DIR } from '../lib/dataset.mts';
import { computeReport, type EvalRow } from '../lib/metrics.mts';
import type { Splits } from '../lib/split.mts';
import { args } from './args.mts';

const opts = args({ model: 'qwen3-vl:2b-instruct', split: 'test', limit: '0', timeout: '120000', splits: 'splits.json' });
const model = opts.model as VisionModel;
if (!(VISION_MODELS as readonly string[]).includes(model)) console.warn(`Note: ${model} is not in the extension's model list.`);

const splitsFile = join(DATA_DIR, opts.splits!);
if (!existsSync(splitsFile)) throw new Error(`No ${opts.splits}: run npm run training:split first.`);
const splits = JSON.parse(readFileSync(splitsFile, 'utf8')) as Splits & { createdAt: string };
const ids = splits[opts.split as keyof Splits];
if (!ids) throw new Error(`Unknown split ${opts.split}`);
const byId = new Map(loadExamples().examples.map((e) => [e.example.id, e]));
const selected = (Number(opts.limit) > 0 ? ids.slice(0, Number(opts.limit)) : ids).map((id) => {
  const e = byId.get(id);
  if (!e?.example.labels) throw new Error(`Example ${id} in ${opts.splits} is missing or unlabeled`);
  return e;
});

const rows: (EvalRow & { scenario?: string })[] = [];
for (const [i, e] of selected.entries()) {
  const capturedAt = e.example.time;
  const started = performance.now();
  const outcome = await observeChart({
    pngBase64: imageBase64(e.dir, 'chart.png'),
    recentBase64: imageBase64(e.dir, 'recent.png'),
    capturedAt,
    model,
    signal: new AbortController().signal,
    timeoutMs: Number(opts.timeout),
  });
  if (!outcome.ok && outcome.code === 'aborted') continue;
  const latencyMs = performance.now() - started;
  rows.push({ id: e.example.id, scenario: e.example.scenario, gold: e.example.labels!, outcome, capturedAt, latencyMs });
  process.stdout.write(`\r${i + 1}/${selected.length} ${e.example.id.padEnd(36)}`);
}
process.stdout.write('\n');

const report = computeReport(rows);
// Connection failures (Ollama down, timeouts, missing model) are not model mistakes: such a run is not a result.
const incomplete = Object.keys(report.errors).some((code) => code !== 'bad_response');
const fingerprint = createHash('sha256').update(selected.map((e) => e.example.id).join('\n')).digest('hex').slice(0, 12);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(TRAINING_DIR, 'reports');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `eval-${model.replace(/[^a-z0-9.-]/gi, '_')}-${opts.splits === 'splits.json' ? '' : opts.splits!.replace(/^splits-|\.json$/g, '') + '-'}${opts.split}-${stamp}${incomplete ? '-INCOMPLETE' : ''}.json`);
writeFileSync(
  file,
  JSON.stringify(
    {
      model,
      split: opts.split,
      splitsFile: opts.splits,
      splitsCreatedAt: splits.createdAt,
      testSetFingerprint: fingerprint,
      incomplete,
      evaluatedAt: new Date().toISOString(),
      report,
      rows: rows.map((r) => ({
        id: r.id,
        scenario: r.scenario,
        latencyMs: Math.round(r.latencyMs),
        gold: r.gold,
        predicted: r.outcome.ok ? { ...r.outcome.observation, limitations: undefined } : { error: r.outcome.code, message: r.outcome.message },
      })),
    },
    null,
    2,
  ) + '\n',
);

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
console.log(`\n${model} on ${opts.split} (n=${report.n}, fingerprint ${fingerprint})`);
console.log(`answered ${report.answered}/${report.n} · invalid JSON ${pct(report.invalidJsonRate)} · errors ${JSON.stringify(report.errors)}`);
console.log(`field accuracy: ${Object.entries(report.fieldAccuracy).map(([k, v]) => `${k} ${pct(v)}`).join(' · ')}`);
console.log(`patterns (micro): precision ${pct(report.patternMicro.precision)} · recall ${pct(report.patternMicro.recall)}`);
for (const [p, c] of Object.entries(report.patterns)) console.log(`  ${p.padEnd(32)} P ${pct(c.precision).padStart(6)}  R ${pct(c.recall).padStart(6)}  (tp ${c.tp} fp ${c.fp} fn ${c.fn})`);
console.log(`rule decision agreement vs gold: ${pct(report.decisionAgreement)} ${JSON.stringify(report.decisionConfusion)}`);
console.log(`latency per image (both questions): mean ${Math.round(report.latencyMs.mean ?? 0)} ms · p50 ${Math.round(report.latencyMs.p50 ?? 0)} · p95 ${Math.round(report.latencyMs.p95 ?? 0)}`);
console.log(`Report: ${file}`);
if (incomplete) {
  console.error('INCOMPLETE: some requests failed to reach the model (see errors). Do not compare this run; fix Ollama and rerun.');
  process.exitCode = 1;
}
