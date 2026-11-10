/** Tiny `--name value` parser for the training scripts. */
export function args(defaults: Record<string, string>): Record<string, string> {
  const out = { ...defaults };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!.replace(/^--/, '');
    if (!(key in defaults)) throw new Error(`Unknown option --${key}. Options: ${Object.keys(defaults).map((k) => `--${k}`).join(' ')}`);
    out[key] = argv[++i] ?? '';
  }
  return out;
}
