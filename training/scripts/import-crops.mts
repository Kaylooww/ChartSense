// Imports a folder of user-supplied chart crops (ChartSense_Real_Crops_330 layout: dataset/source_manifest.json,
// dataset/annotations_unreviewed.jsonl, dataset/images/*.png) into training/data/real/<id>/.
// Images are prepared exactly as the extension sends them: chart.png = crop downscaled to 1024 px,
// recent.png = newest 30% strip. Labels always start as null: the dataset's own label fields use an
// older schema and are never copied. Label with `npm run training:review`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { DATA_DIR } from '../lib/dataset.mts';
import type { Example } from '../lib/labels.mts';
import { cropRight, decodePng, encodePng, fitWithin } from '../lib/png.mts';

const root = process.argv[2];
if (!root) {
  console.error('Usage: npm run training:import-crops -- <folder containing dataset/source_manifest.json>');
  process.exit(1);
}
const dataset = join(root, 'dataset');
const Manifest = z.array(z.object({ sourceId: z.string().regex(/^\d{6}$/), originalFilename: z.string(), instrument: z.string(), chartStyle: z.string() }).loose());
const Row = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/), image: z.string().regex(/^images\/[A-Za-z0-9_.-]+\.png$/), sourceId: z.string() }).loose();

const sources = new Map(Manifest.parse(JSON.parse(readFileSync(join(dataset, 'source_manifest.json'), 'utf8'))).map((s) => [s.sourceId, s]));
const rows = readFileSync(join(dataset, 'annotations_unreviewed.jsonl'), 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => Row.parse(JSON.parse(l)));

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// "Screenshot 2026-11-11 005128.png" -> capture time. Only used to order sessions chronologically.
const timeOf = (s: { originalFilename: string; sourceId: string }) => {
  const m = /(\d{4}-\d{2}-\d{2}) (\d{2})(\d{2})(\d{2})/.exec(s.originalFilename);
  if (!m) throw new Error(`No capture time in ${s.originalFilename}`);
  return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.000Z`;
};

let imported = 0, skipped = 0;
for (const row of rows) {
  const src = sources.get(row.sourceId);
  if (!src) throw new Error(`${row.id}: sourceId ${row.sourceId} not in source_manifest.json`);
  const id = slug(row.id);
  const dir = join(DATA_DIR, 'real', id);
  if (existsSync(dir)) {
    skipped++;
    continue;
  }
  const img = decodePng(readFileSync(join(dataset, row.image)));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'chart.png'), encodePng(fitWithin(img)));
  writeFileSync(join(dir, 'recent.png'), encodePng(fitWithin(cropRight(img, 0.7))));
  const example: Example = {
    id,
    source: 'user_crop',
    // One group per instrument: screenshots of the same instrument taken minutes apart are one session
    // (e.g. EUR/USD line and candle views), and their many overlapping crops must stay in one split.
    group: `crops-${slug(src.instrument)}`,
    time: timeOf(src),
    chartTimeframeSec: null,
    origin: { instrument: src.instrument, chartStyle: src.chartStyle, sourceId: src.sourceId },
    labels: null,
    privacyReviewed: true,
  };
  writeFileSync(join(dir, 'example.json'), JSON.stringify(example, null, 2) + '\n');
  imported++;
}
console.log(`Imported ${imported}, skipped ${skipped} already present. All need labels: npm run training:review`);
