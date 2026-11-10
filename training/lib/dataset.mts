import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExampleSchema, type Example } from './labels.mts';

export const TRAINING_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DATA_DIR = join(TRAINING_DIR, 'data');
export const SOURCES = ['synthetic', 'real'] as const;

export type Loaded = { dir: string; example: Example };
export type LoadIssue = { dir: string; problem: string };

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const isPng = (file: string) => existsSync(file) && readFileSync(file).subarray(0, 8).equals(PNG_SIGNATURE);

/** Reads every example folder under data/synthetic and data/real, validating files and labels. */
export function loadExamples(dataDir = DATA_DIR): { examples: Loaded[]; issues: LoadIssue[] } {
  const examples: Loaded[] = [];
  const issues: LoadIssue[] = [];
  const seen = new Set<string>();
  for (const source of SOURCES) {
    const root = join(dataDir, source);
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
      const dir = join(root, name);
      const problems: string[] = [];
      let example: Example | null = null;
      try {
        const parsed = ExampleSchema.safeParse(JSON.parse(readFileSync(join(dir, 'example.json'), 'utf8')));
        if (parsed.success) example = parsed.data;
        else problems.push(`example.json: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`);
      } catch (e) {
        problems.push(`example.json unreadable: ${(e as Error).message}`);
      }
      for (const png of ['chart.png', 'recent.png']) if (!isPng(join(dir, png))) problems.push(`${png} missing or not a PNG`);
      if (example && example.id !== name) problems.push(`id "${example.id}" does not match folder name`);
      if (example && seen.has(example.id)) problems.push(`duplicate id ${example.id}`);
      if (example && (source === 'real') !== (example.source !== 'synthetic')) problems.push(`source "${example.source}" is in data/${source}`);
      if (problems.length || !example) issues.push({ dir, problem: problems.join(' | ') });
      else {
        seen.add(example.id);
        examples.push({ dir, example });
      }
    }
  }
  return { examples, issues };
}

export const imageBase64 = (dir: string, file: 'chart.png' | 'recent.png') => readFileSync(join(dir, file)).toString('base64');
