// Local labeling page for real examples (training/data/real). Serves on 127.0.0.1 only; reads and
// writes example.json files on this machine, and Auto-Label All talks only to the local Ollama.
// Model answers are saved as drafts; only "Approve" writes labels. Usage: npm run training:review.
import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { PATTERN_DEFINITIONS, patternsFrom } from '../../apps/extension/src/analysis/ollama.ts';
import { approve, autoLabel, clearReview, exportVerified, reject, type Progress } from '../lib/annotate.mts';
import { DATA_DIR, loadExamples } from '../lib/dataset.mts';
import { LabelsSchema, statusOf } from '../lib/labels.mts';
import { args } from './args.mts';
import { PAGE } from './review-page.mts';

const opts = args({ port: '5210', annotator: 'user', model: 'qwen3-vl:2b-instruct' });
const annotator = opts.annotator!;
const real = () => new Map(loadExamples().examples.filter((e) => e.example.source !== 'synthetic').map((e) => [e.example.id, e]));

const shape = LabelsSchema.shape;
const describe = (p: string) => PATTERN_DEFINITIONS[p as keyof typeof PATTERN_DEFINITIONS] ?? '';
const options = {
  imageQuality: shape.imageQuality.options,
  visibleTrend: shape.visibleTrend.options,
  structure: shape.structure.options.map((v) => [v, describe(v)]),
  latestMove: shape.latestMove.options.map((v) => [v, v === 'none' ? 'none of these in the newest candles' : describe(patternsFrom('unclear', v, [])[0]!)]),
  completedSetups: shape.completedSetups.element.options.map((v) => [v, describe(v)]),
};

let job: { progress: Progress; model: string; controller: AbortController; running: boolean } | null = null;

const send = (res: ServerResponse, code: number, type: string, body: string | Buffer) => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const json = (res: ServerResponse, code: number, body: unknown) => send(res, code, 'application/json', JSON.stringify(body));

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'GET') {
    if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);
    if (url.pathname === '/api/state') {
      const examples = [...real().values()].map(({ example: e }) => ({ ...e, status: statusOf(e) }));
      examples.sort((a, b) => a.id.localeCompare(b.id));
      return json(res, 200, { options, examples, defaultModel: opts.model });
    }
    if (url.pathname === '/api/autolabel') return json(res, 200, job && { ...job.progress, model: job.model, running: job.running });
    const img = /^\/img\/([a-z0-9-]+)\/(chart|recent)\.png$/.exec(url.pathname);
    const e = img && real().get(img[1]!);
    return e ? send(res, 200, 'image/png', readFileSync(join(e.dir, `${img![2]}.png`))) : send(res, 404, 'text/plain', 'not found');
  }
  if (req.method !== 'POST') return send(res, 405, 'text/plain', 'method not allowed');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const input = (body ? JSON.parse(body) : {}) as Record<string, unknown>;
      if (url.pathname === '/api/autolabel/start') {
        if (job?.running) return json(res, 409, { error: 'Auto-labeling is already running.' });
        const model = String(input.model ?? opts.model);
        if (!/^[A-Za-z0-9._:/-]{1,80}$/.test(model)) return json(res, 400, { error: 'Invalid model name.' });
        const retries = Math.max(0, Math.min(5, Number(input.retries ?? 2) || 0));
        const controller = new AbortController();
        const current: NonNullable<typeof job> = { model, controller, running: true, progress: { total: 0, done: 0, drafted: 0, failed: 0, current: null, lastError: null, stopped: null } };
        job = current;
        autoLabel({ model, retries, signal: controller.signal, onProgress: (p) => (current.progress = { ...p }) })
          .catch((err: Error) => (current.progress = { ...current.progress, stopped: `Error: ${err.message}` }))
          .finally(() => (current.running = false));
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/autolabel/cancel') {
        job?.controller.abort();
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/export') {
        const out = join(DATA_DIR, 'exports', `verified-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
        return json(res, 200, { ...exportVerified(out), dir: out });
      }
      const act = /^\/api\/(approve|reject|clear)\/([a-z0-9-]+)$/.exec(url.pathname);
      const e = act && real().get(act[2]!);
      if (!e) return json(res, 404, { error: 'unknown example' });
      const next =
        act![1] === 'approve' ? approve(e.dir, input.labels, annotator) : act![1] === 'reject' ? reject(e.dir, String(input.note ?? ''), annotator) : clearReview(e.dir);
      json(res, 200, { ...next, status: statusOf(next) });
    } catch (err) {
      const issues = (err as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
      json(res, 400, { error: issues ? issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : (err as Error).message });
    }
  });
}).listen(Number(opts.port), '127.0.0.1', () => console.log(`Review page: http://127.0.0.1:${opts.port}/  (Ctrl+C to stop)`));
