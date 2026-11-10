// Unpacks training files saved from the extension ("Save training file") into training/data/real/<id>/.
// Labels start as null: annotate example.json by hand, then run `npm run training:validate`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TrainingExportSchema } from '../../apps/extension/src/capture/trainingExport.ts';
import { DATA_DIR } from '../lib/dataset.mts';
import type { Example } from '../lib/labels.mts';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run training:import -- <chartsense-training-*.json> [...]');
  process.exit(1);
}
let failed = 0;
for (const file of files) {
  const parsed = TrainingExportSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    console.error(`${file}: not a valid ChartSense training export (${parsed.error.issues[0]?.message})`);
    failed++;
    continue;
  }
  const e = parsed.data;
  const dir = join(DATA_DIR, 'real', e.id);
  if (existsSync(dir)) {
    console.log(`${e.id}: already imported, skipped (labels kept)`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'chart.png'), Buffer.from(e.images.chart, 'base64'));
  writeFileSync(join(dir, 'recent.png'), Buffer.from(e.images.recent, 'base64'));
  const example: Example = {
    id: e.id,
    source: 'user_export',
    group: e.group,
    time: e.capturedAt,
    chartTimeframeSec: e.chartTimeframeSec,
    labels: null,
    privacyReviewed: true,
  };
  writeFileSync(join(dir, 'example.json'), JSON.stringify(example, null, 2) + '\n');
  console.log(`${e.id}: imported to ${dir} (needs labels)`);
}
process.exit(failed ? 1 : 0);
