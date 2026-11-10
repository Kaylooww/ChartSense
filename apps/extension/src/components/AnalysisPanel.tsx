import { FileUp, Play } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';
import { evaluateBaseline, STRATEGY_VERSION } from '../signals/baseline';
import { MAX_IMPORT_BYTES, parseOhlc } from '../signals/parseOhlc';
import type { AnalysisResult, ChartContext } from '../types/market';
import { AnalysisResultCard } from './AnalysisResultCard';
import { ChartContextForm, EMPTY_CONTEXT } from './ChartContextForm';

type Imported = { name: string; rows: unknown[]; synthetic: boolean } | { name: string; error: string } | null;

/** Developer/testing tool: runs baseline-v0.1 on an imported OHLC file. Not part of live monitoring. */
export function AnalysisPanel() {
  const ids = useId();
  const [context, setContext] = useState<ChartContext>(EMPTY_CONTEXT);
  const [imported, setImported] = useState<Imported>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Any input change makes the shown result outdated, so it is cleared rather than left looking current.
  const update = (patch: Partial<ChartContext>) => {
    setContext((c) => ({ ...c, ...patch }));
    setResult(null);
  };

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    if (!file) return setImported(null);
    if (file.size > MAX_IMPORT_BYTES) return setImported({ name: file.name, error: 'File is larger than 2 MB.' });
    const parsed = parseOhlc(await file.text(), file.name);
    setImported(parsed.ok ? { name: file.name, rows: parsed.rows, synthetic: parsed.synthetic } : { name: file.name, error: parsed.error });
  }

  const ready = imported !== null && 'rows' in imported;

  return (
    <section aria-label="OHLC test bench" className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">OHLC test bench (developer)</h2>
        <span className="font-mono text-[10px] text-zinc-500">{STRATEGY_VERSION}</span>
      </div>
      <p className="text-xs leading-relaxed text-zinc-400">
        For testing the indicator rules with historical or synthetic bars (see <code>fixtures/ohlc/</code>). Live monitoring does not use this.
      </p>

      <ChartContextForm value={context} onChange={update} />

      <div className="space-y-1">
        <label htmlFor={`${ids}-file`} className="flex items-center gap-1.5 text-xs text-zinc-400">
          <FileUp className="size-3.5" aria-hidden />
          OHLC file (.csv or .json, bar open time in UTC)
        </label>
        <input
          id={`${ids}-file`}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={(e) => void onFile(e)}
          className="block w-full text-xs text-zinc-300 file:mr-2 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-800 file:px-2 file:py-1 file:text-zinc-100 hover:file:bg-zinc-700"
        />
        {imported && 'error' in imported ? (
          <p role="alert" className="text-xs text-rose-200">
            {imported.name}: {imported.error}
          </p>
        ) : null}
        {ready ? (
          <p className="text-xs text-zinc-400">
            {imported.name}: {imported.rows.length} rows read
            {imported.synthetic ? ' · marked SYNTHETIC demo data' : ' · source not verified'}. Kept in memory only.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={() =>
          ready &&
          setResult(evaluateBaseline({ rows: imported.rows, context, source: imported.synthetic ? 'demo_fixture' : 'imported_ohlc' }))
        }
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Play className="size-4" aria-hidden />
        Analyze bars
      </button>

      {result ? (
        <AnalysisResultCard result={result} />
      ) : (
        <p className="text-xs text-zinc-500">No result yet. Import bars and press Analyze bars.</p>
      )}
    </section>
  );
}
