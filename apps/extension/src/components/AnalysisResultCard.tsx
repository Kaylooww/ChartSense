import { ArrowDownRight, ArrowUpRight, CircleHelp, Hourglass, OctagonAlert } from 'lucide-react';
import type { ComponentType } from 'react';
import { formatDuration, formatLocalTime } from '../sidepanel/format';
import type { AnalysisResult, DataSource, Direction } from '../types/market';

type IconType = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const STATUS: Record<Direction, { tone: string; Icon: IconType }> = {
  UP: { tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', Icon: ArrowUpRight },
  DOWN: { tone: 'border-rose-500/40 bg-rose-500/10 text-rose-300', Icon: ArrowDownRight },
  WAIT: { tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200', Icon: Hourglass },
  INSUFFICIENT_DATA: { tone: 'border-zinc-600 bg-zinc-800 text-zinc-200', Icon: CircleHelp },
  ERROR: { tone: 'border-rose-500/40 bg-rose-500/10 text-rose-200', Icon: OctagonAlert },
};

const SOURCE_LABEL: Record<DataSource, string> = {
  demo_fixture: 'Demo fixture (synthetic)',
  imported_ohlc: 'Imported OHLC (source not verified)',
  authorized_feed: 'Authorized feed',
  visual_only: 'Screenshot, local AI (visual only)',
};

/** Conventional instruments show UP as BUY and DOWN as SELL; fixed-expiry keeps UP and DOWN. */
function statusLabel(r: AnalysisResult): string {
  if (r.instrumentType === 'conventional_demo' && r.status === 'UP') return 'BUY';
  if (r.instrumentType === 'conventional_demo' && r.status === 'DOWN') return 'SELL';
  return r.status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT DATA' : r.status;
}

/**
 * What the signal means in a platform's own button words: on fixed-expiry platforms BUY means
 * "price will be higher at expiry" and SELL means "lower". A suggestion only; nothing is ever clicked.
 */
export function suggestedAction(status: Direction): { action: 'BUY' | 'SELL' | null; text: string } {
  if (status === 'UP') return { action: 'BUY', text: 'BUY: the setup points to a higher price at the end of your horizon.' };
  if (status === 'DOWN') return { action: 'SELL', text: 'SELL: the setup points to a lower price at the end of your horizon.' };
  return { action: null, text: 'No trade: wait for a clearer setup.' };
}

function ActionLine({ status }: { status: Direction }) {
  const { action, text } = suggestedAction(status);
  const tone = action === 'BUY' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : action === 'SELL' ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : 'border-zinc-700 bg-zinc-800/60 text-zinc-300';
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${tone}`}>
      <p className="text-sm">
        Suggested action: <span className="text-base font-bold tracking-wide">{action ?? 'WAIT'}</span>
      </p>
      <p className="text-xs opacity-90">{text}</p>
      <p className="text-[11px] opacity-75">Simulated suggestion only. ChartSense never places the trade; you decide.</p>
    </div>
  );
}

const n = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(2) : v.toPrecision(6));

export function AnalysisResultCard({ result: r }: { result: AnalysisResult }) {
  const { tone, Icon } = STATUS[r.status];
  const visual = r.source === 'visual_only';
  const rows: [string, string][] = [
    ['Asset', r.assetLabel || '—'],
    ['Instrument', r.instrumentType === 'fixed_expiry_demo' ? 'Fixed-expiry (demo)' : 'Conventional (demo)'],
    ['Chart timeframe', r.chartTimeframeSec ? formatDuration(r.chartTimeframeSec) : '—'],
    ['Prediction horizon', r.predictionHorizonSec ? formatDuration(r.predictionHorizonSec) : '—'],
    ['Data source', SOURCE_LABEL[r.source]],
    ['Analyzed at', formatLocalTime(r.analyzedAt)],
    ...(visual
      ? []
      : ([
          ['As of bar (open)', r.lastBarTime ? new Date(r.lastBarTime).toLocaleString(undefined, { timeZoneName: 'short' }) : '—'],
          [r.barDataVerified ? 'Bars used' : 'Rows read (rejected)', String(r.barCount)],
        ] as [string, string][])),
    ['Strategy', r.strategyVersion],
  ];

  return (
    <div aria-live="polite" className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-base font-bold tracking-wide ${tone}`}>
          <Icon className="size-4.5" aria-hidden />
          {statusLabel(r)}
        </span>
        <span className="text-[11px] text-zinc-400">Rule-based · uncalibrated · simulation only</span>
      </div>
      <ActionLine status={r.status} />
      <p className="text-sm text-zinc-100">{r.explanation}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-400">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="truncate text-right font-mono text-zinc-200" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {r.evidence.length > 0 ? (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Evidence</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-300">
            {r.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1" aria-label="Reason codes">
        {r.reasonCodes.map((code) => (
          <code key={code} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
            {code}
          </code>
        ))}
      </div>

      {r.missingFields.length > 0 ? (
        <p className="text-xs text-zinc-300">
          <span className="font-semibold">Missing:</span> {r.missingFields.join(', ')}
        </p>
      ) : null}

      {r.indicators ? (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">Indicator values (from validated bars)</summary>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
            <dt>EMA{r.parameters.emaFast}</dt>
            <dd className="text-right text-zinc-200">{n(r.indicators.emaFast)}</dd>
            <dt>EMA{r.parameters.emaSlow}</dt>
            <dd className="text-right text-zinc-200">{n(r.indicators.emaSlow)}</dd>
            <dt>RSI{r.parameters.rsiPeriod}</dt>
            <dd className="text-right text-zinc-200">{r.indicators.rsi.toFixed(2)}</dd>
            <dt>MACD / signal</dt>
            <dd className="text-right text-zinc-200">
              {n(r.indicators.macd)} / {n(r.indicators.macdSignal)}
            </dd>
          </dl>
        </details>
      ) : null}

      <ul className="space-y-0.5 text-[11px] leading-relaxed text-zinc-500">
        {r.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
        <li>Doing nothing is always a valid choice. This is not an order and not financial advice.</li>
      </ul>
    </div>
  );
}
