import { Download, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { canSettle, computeStats, statsByGroup, toCsv, type JournalStats, type PaperTrade, type TradeResult } from '../journal/journal';
import { formatDuration, formatLocalTime } from '../sidepanel/format';
import type { Journal } from '../sidepanel/hooks/useJournal';

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const units = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
const small = 'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700';

const RESULT_TONE: Record<TradeResult, string> = {
  OPEN: 'text-sky-300',
  WIN: 'text-emerald-300',
  LOSS: 'text-rose-300',
  TIE: 'text-zinc-300',
  UNVERIFIED: 'text-amber-200',
};

/** A blob link the user clicks; revoked when the data changes. */
function useDownload(text: string, type: string): string {
  const url = useMemo(() => URL.createObjectURL(new Blob([text], { type })), [text, type]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

function Stats({ s }: { s: JournalStats }) {
  const decided = s.wins + s.losses;
  const beats = s.hitRate !== null && s.breakevenHitRate !== null ? s.hitRate > s.breakevenHitRate : null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-400">
      <dt>Trades</dt>
      <dd className="text-right text-zinc-200">
        {s.total} · {s.open} open · {s.unverified} unverified
      </dd>
      <dt>Wins / losses / ties</dt>
      <dd className="text-right text-zinc-200">
        {s.wins} / {s.losses} / {s.ties}
      </dd>
      <dt>Hit rate ({decided} decided)</dt>
      <dd className={`text-right font-mono ${beats === null ? 'text-zinc-200' : beats ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(s.hitRate)}</dd>
      <dt>Needed to break even</dt>
      <dd className="text-right font-mono text-zinc-200">
        {pct(s.breakevenHitRate)}
        {s.avgPayout !== null ? ` (payout ${pct(s.avgPayout)})` : ''}
      </dd>
      <dt>Net simulated P&amp;L</dt>
      <dd className={`text-right font-mono ${s.netPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{units(s.netPnl)} units</dd>
      <dt>Max drawdown</dt>
      <dd className="text-right font-mono text-zinc-200">{s.maxDrawdown.toFixed(2)} units</dd>
    </dl>
  );
}

export function JournalPanel({ journal }: { journal: Journal }) {
  const trades = useMemo(() => journal.trades ?? [], [journal.trades]);
  const [now, setNow] = useState(() => Date.now());
  const anyOpen = trades.some((t) => t.result === 'OPEN');
  useEffect(() => {
    if (!anyOpen) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyOpen]);

  const stats = useMemo(() => computeStats(trades), [trades]);
  const groups = useMemo(() => statsByGroup(trades), [trades]);
  const jsonUrl = useDownload(JSON.stringify(trades, null, 2), 'application/json');
  const csvUrl = useDownload(toCsv(trades), 'text/csv');
  const newestFirst = [...trades].sort((a, b) => b.entryTime.localeCompare(a.entryTime));

  if (journal.trades === null) return <p className="text-sm text-zinc-400">Loading journal…</p>;

  return (
    <section aria-label="Paper-trading journal" className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Paper-trading journal</h2>
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
          Simulated · no real orders
        </span>
      </div>
      <p className="text-xs leading-relaxed text-zinc-400">
        Record UP / DOWN signals from the Monitor tab. After each trade’s expiry, check the result on your chart and settle it here. If you
        can’t tell, choose “Can’t verify”: it is never counted as a win.
      </p>

      <Stats s={stats} />
      {stats.sampleWarning ? (
        <p role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          {stats.sampleWarning}
        </p>
      ) : null}
      {journal.invalidCount ? <p className="text-xs text-rose-200">{journal.invalidCount} stored record(s) could not be read and were skipped.</p> : null}

      {groups.length > 1 ? (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">By strategy and timeframe / horizon</summary>
          <ul className="mt-1 space-y-2">
            {groups.map((g) => (
              <li key={g.group} className="rounded-md border border-zinc-800 p-2">
                <p className="mb-1 font-mono text-zinc-300">{g.group}</p>
                <Stats s={g.stats} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <a href={jsonUrl} download="chartsense-paper-trades.json" className={`${small} inline-flex items-center gap-1`}>
          <Download className="size-3.5" aria-hidden /> Export JSON
        </a>
        <a href={csvUrl} download="chartsense-paper-trades.csv" className={`${small} inline-flex items-center gap-1`}>
          <Download className="size-3.5" aria-hidden /> Export CSV
        </a>
        <button
          type="button"
          disabled={trades.length === 0}
          className={`${small} inline-flex items-center gap-1 disabled:opacity-40`}
          onClick={() => window.confirm(`Delete all ${trades.length} paper trades? This cannot be undone.`) && journal.clear()}
        >
          <Trash2 className="size-3.5" aria-hidden /> Delete all
        </button>
      </div>

      {newestFirst.length === 0 ? <p className="text-xs text-zinc-500">No paper trades yet.</p> : null}
      <ul className="space-y-2" aria-label="Paper trades, newest first">
        {newestFirst.map((t) => (
          <TradeRow key={t.id} t={t} now={now} onSettle={(r) => journal.settle(t.id, r)} />
        ))}
      </ul>
    </section>
  );
}

function TradeRow({ t, now, onSettle }: { t: PaperTrade; now: number; onSettle: (r: Exclude<TradeResult, 'OPEN'>) => void }) {
  const label = t.instrumentType === 'conventional_demo' ? (t.direction === 'UP' ? 'BUY' : 'SELL') : t.direction;
  const leftSec = Math.max(0, Math.ceil((Date.parse(t.expiryTime) - now) / 1000));
  const settleable = canSettle(t, new Date(now));
  return (
    <li className="space-y-1 rounded-md border border-zinc-800 bg-zinc-950/60 p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-zinc-100">
          {label} · {t.assetLabel} · {formatDuration(t.chartTimeframeSec)} chart / {formatDuration(t.predictionHorizonSec)} horizon
        </span>
        <span className={`font-semibold ${RESULT_TONE[t.result]}`}>{t.result}</span>
      </div>
      <p className="font-mono text-zinc-400">
        entry {formatLocalTime(t.entryTime)} → expiry {formatLocalTime(t.expiryTime)} · stake {t.stake} · payout {pct(t.payoutFraction)} · {t.strategyVersion}
      </p>
      {t.result === 'OPEN' && !settleable ? <p className="text-zinc-400">Settle after expiry: {leftSec}s left.</p> : null}
      {settleable ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Settle this trade">
          <span className="self-center text-zinc-300">Result on your chart?</span>
          <button type="button" className={small} onClick={() => onSettle('WIN')}>Won</button>
          <button type="button" className={small} onClick={() => onSettle('LOSS')}>Lost</button>
          <button type="button" className={small} onClick={() => onSettle('TIE')}>Tie / refund</button>
          <button type="button" className={small} onClick={() => onSettle('UNVERIFIED')}>Can’t verify</button>
        </div>
      ) : null}
    </li>
  );
}
