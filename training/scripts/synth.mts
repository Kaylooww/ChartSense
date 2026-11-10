// Generates SYNTHETIC labeled examples into training/data/synthetic/<id>/. Deterministic per seed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../lib/dataset.mts';
import type { Example } from '../lib/labels.mts';
import { cropRight, encodePng } from '../lib/png.mts';
import { renderChart, renderNoChart, SCENARIO_LABELS, SCENARIOS, scenarioCandles } from '../lib/synth.mts';
import { args } from './args.mts';

const { seeds } = args({ seeds: '20' });
const root = join(DATA_DIR, 'synthetic');
rmSync(root, { recursive: true, force: true });

let index = 0;
for (let seed = 1; seed <= Number(seeds); seed++) {
  for (const scenario of SCENARIOS) {
    const id = `syn-${scenario.replaceAll('_', '-')}-${String(seed).padStart(3, '0')}`;
    const image = scenario === 'no_chart' ? renderNoChart(seed) : renderChart(scenarioCandles(scenario, seed * 101));
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'chart.png'), encodePng(image));
    writeFileSync(join(dir, 'recent.png'), encodePng(cropRight(image, 0.7))); // same 30% strip as the extension
    const example: Example = {
      id,
      source: 'synthetic',
      group: id,
      time: new Date(Date.UTC(2026, 0, 1) + index++ * 60_000).toISOString(), // generation order
      chartTimeframeSec: 60,
      scenario,
      labels: SCENARIO_LABELS[scenario],
      annotator: 'by-construction',
      privacyReviewed: true,
    };
    writeFileSync(join(dir, 'example.json'), JSON.stringify(example, null, 2) + '\n');
  }
}
console.log(`Wrote ${index} synthetic examples to ${root}`);
