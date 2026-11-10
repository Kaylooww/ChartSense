// Validates every example: schema-compatible labels, both PNGs present, unique ids, consistent source.
import { loadExamples } from '../lib/dataset.mts';

const { examples, issues } = loadExamples();
const unlabeled = examples.filter((e) => e.example.labels === null);
const bySource = (s: string) => examples.filter((e) => e.example.source === s).length;

console.log(`${examples.length} valid examples (${bySource('synthetic')} synthetic, ${examples.length - bySource('synthetic')} real), ${unlabeled.length} still need labels.`);
for (const e of unlabeled) console.log(`  needs labels: ${e.dir}`);
for (const i of issues) console.error(`  INVALID ${i.dir}: ${i.problem}`);
process.exit(issues.length ? 1 : 0);
