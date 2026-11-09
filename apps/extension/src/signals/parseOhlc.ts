/**
 * Turns an imported CSV or JSON file into raw rows for `validateBars`. This is a trust boundary:
 * sizes are capped and every value is re-checked by the validator. Accepted shapes:
 *   CSV:  header `time,open,high,low,close[,volume]`, one bar per line
 *   JSON: `[{ "time": ..., "open": ..., ... }]`
 * `time` is the bar open time: ISO 8601 UTC (`...Z`) or Unix epoch seconds.
 * A CSV comment line (`# ...`) containing "SYNTHETIC" marks the file as demo data. That can only
 * make the label more cautious, never present a file as live.
 */
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_IMPORT_ROWS = 20_000;

export type ParseResult = { ok: true; rows: unknown[]; synthetic: boolean } | { ok: false; error: string };

const COLUMNS = ['time', 'open', 'high', 'low', 'close', 'volume'] as const;

export function parseOhlc(text: string, fileName: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'File is larger than 2 MB.' };
  const lines = text.split(/\r?\n/);
  const rows = /\.json$/i.test(fileName) || text.trimStart().startsWith('[') ? parseJson(text) : parseCsv(lines);
  if (!Array.isArray(rows)) return rows;
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `More than ${MAX_IMPORT_ROWS} bars.` };
  const synthetic = lines.some((line) => line.startsWith('#') && /synthetic/i.test(line));
  return { ok: true, rows: rows.map(normalizeRow), synthetic };
}

function parseJson(text: string): unknown[] | ParseResult {
  try {
    const data: unknown = JSON.parse(text);
    return Array.isArray(data) ? data : { ok: false, error: 'JSON must be an array of bars.' };
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
}

function parseCsv(allLines: string[]): unknown[] | ParseResult {
  const lines = allLines.filter((line) => line.trim() !== '' && !line.startsWith('#'));
  const header = lines.shift()?.split(',').map((h) => h.trim().toLowerCase());
  if (!header || !['time', 'open', 'high', 'low', 'close'].every((c) => header.includes(c))) {
    return { ok: false, error: 'CSV needs a header with time, open, high, low, close.' };
  }
  return lines.map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((name, i) => (row[name] = (cells[i] ?? '').trim()));
    return row;
  });
}

function normalizeRow(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const src = raw as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const key of COLUMNS) {
    const value = src[key];
    if (value === undefined || value === '') continue;
    row[key] = key === 'time' ? normalizeTime(value) : typeof value === 'string' ? Number(value) : value;
  }
  return row;
}

function normalizeTime(value: unknown): unknown {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return text;
  const date = new Date(Number(text) * 1000);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}
