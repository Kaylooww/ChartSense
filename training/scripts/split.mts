// Writes training/data/splits.json: chronological, group-aware train/validation/test (70/15/15).
// Only labeled examples are split. Adding data changes the split, so only compare models evaluated
// on the same split (each report records the test-set fingerprint).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, loadExamples } from '../lib/dataset.mts';
import { chronologicalGroupSplit } from '../lib/split.mts';
import { args } from './args.mts';

// --source real|synthetic splits one source on its own (written to splits-<source>.json): synthetic and
// real examples have unrelated timestamps, so a mixed chronological split would put all real data in test.
const opts = args({ source: 'all' });
if (!['all', 'real', 'synthetic'].includes(opts.source!)) throw new Error('--source must be all, real or synthetic');

const { examples, issues } = loadExamples();
if (issues.length) {
  console.error(`${issues.length} invalid examples; run npm run training:validate first.`);
  process.exit(1);
}
const labeled = examples
  .filter((e) => e.example.labels !== null && (opts.source === 'all' || (opts.source === 'synthetic') === (e.example.source === 'synthetic')))
  .map((e) => e.example);
const out = opts.source === 'all' ? 'splits.json' : `splits-${opts.source}.json`;
const splits = chronologicalGroupSplit(labeled);
writeFileSync(join(DATA_DIR, out), JSON.stringify({ createdAt: new Date().toISOString(), ...splits }, null, 2) + '\n');
console.log(`${out}: train ${splits.train.length} · validation ${splits.validation.length} · test ${splits.test.length}`);
