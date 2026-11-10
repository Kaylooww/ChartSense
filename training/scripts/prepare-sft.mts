// Builds supervised fine-tuning files from the train and validation splits only (never test):
// training/data/sft/{train,validation}.jsonl with image paths relative to training/data/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DATA_DIR, loadExamples } from '../lib/dataset.mts';
import { sftRecords } from '../lib/sft.mts';
import type { Splits } from '../lib/split.mts';

const splits = JSON.parse(readFileSync(join(DATA_DIR, 'splits.json'), 'utf8')) as Splits;
const byId = new Map(loadExamples().examples.map((e) => [e.example.id, e]));
const outDir = join(DATA_DIR, 'sft');
mkdirSync(outDir, { recursive: true });
for (const split of ['train', 'validation'] as const) {
  const lines = splits[split].flatMap((id) => {
    const e = byId.get(id);
    if (!e?.example.labels) throw new Error(`Example ${id} missing or unlabeled`);
    const path = (f: string) => relative(DATA_DIR, join(e.dir, f)).replaceAll('\\', '/');
    return sftRecords(id, e.example.labels, { chart: path('chart.png'), recent: path('recent.png') }).map((r) => JSON.stringify(r));
  });
  writeFileSync(join(outDir, `${split}.jsonl`), lines.join('\n') + '\n');
  console.log(`${split}: ${lines.length} records (${splits[split].length} examples x 2 questions)`);
}
