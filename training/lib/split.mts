export type SplitName = 'train' | 'validation' | 'test';
export type Splits = Record<SplitName, string[]>;

/**
 * Chronological, group-aware split. Groups (chart sessions) are ordered by their first capture time
 * and filled into train, then validation, then test, so (1) no session appears in two splits and
 * (2) every test example is newer than every training example: no future data leaks into training.
 */
export function chronologicalGroupSplit(
  examples: { id: string; group: string; time: string }[],
  fractions: [number, number, number] = [0.7, 0.15, 0.15],
): Splits {
  const groups = new Map<string, { first: string; ids: string[] }>();
  for (const e of examples) {
    const g = groups.get(e.group) ?? { first: e.time, ids: [] };
    g.ids.push(e.id);
    if (e.time < g.first) g.first = e.time;
    groups.set(e.group, g);
  }
  const ordered = [...groups].sort(([a, ga], [b, gb]) => ga.first.localeCompare(gb.first) || a.localeCompare(b));
  const out: Splits = { train: [], validation: [], test: [] };
  const total = examples.length;
  const limits = [fractions[0] * total, (fractions[0] + fractions[1]) * total];
  let assigned = 0;
  for (const [, g] of ordered) {
    const name: SplitName = assigned < limits[0]! ? 'train' : assigned < limits[1]! ? 'validation' : 'test';
    out[name].push(...g.ids.sort());
    assigned += g.ids.length;
  }
  return out;
}
