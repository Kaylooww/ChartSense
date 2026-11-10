import { Activity, NotebookPen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { VISION_MODELS, type VisionModel } from '../analysis/ollama';
import type { MonitorView } from '../sidepanel/hooks/useMonitor';
import { flash, playSignalTone } from '../sidepanel/alert';
import { formatLocalTime } from '../sidepanel/format';
import type { Journal } from '../sidepanel/hooks/useJournal';
import type { MonitorSettings } from '../sidepanel/hooks/useMonitorSettings';
import { AnalysisResultCard } from './AnalysisResultCard';
import { ChartContextForm } from './ChartContextForm';
import { OllamaSetup } from './OllamaSetup';

export const INTERVALS = [5, 10, 15, 30, 60];

const PHASE: Record<MonitorView['phase'], string> = {
  off: 'Not monitoring. Press Start monitoring, or Resume if paused.',
  starting: 'Starting…',
  needs_selection: 'Select the chart region on the screenshot below to begin analysis.',
  tab_hidden: 'Chart tab is in the background. Monitoring continues when you switch back to it.',
  capturing: 'Capturing the chart…',
  analyzing: 'Analyzing with the local model…',
  waiting: 'Waiting for the next capture.',
};

const select = 'w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100';

export function MonitorPanel(props: {
  view: MonitorView;
  settings: MonitorSettings;
  onSettings: (patch: Partial<MonitorSettings>) => void;
  journal: Journal;
}) {
  const { view, settings, onSettings, journal } = props;
  const { context, model, intervalSec, soundOn, stake, payoutPct } = settings;
  const sectionRef = useRef<HTMLElement>(null);
  const lastAlerted = useRef<'UP' | 'DOWN' | null>(null);
  const status = view.result?.status ?? null;

  // Alert only when a direction first appears or flips, not on every cycle that repeats it.
  useEffect(() => {
    const dir = status === 'UP' || status === 'DOWN' ? status : null;
    if (dir && dir !== lastAlerted.current) {
      flash(sectionRef.current, dir);
      if (soundOn) playSignalTone(dir);
    }
    lastAlerted.current = dir;
  }, [status, soundOn]);

  const signal = view.result && (view.result.status === 'UP' || view.result.status === 'DOWN') ? view.result : null;
  const recorded = signal !== null && journal.recordedSignalIds.has(signal.id);
  const validTrade = stake > 0 && payoutPct > 0 && payoutPct <= 1000;
  const failure = view.modelFailure;
  const connection =
    view.observation !== null
      ? `Connected · last answer took ${(view.observation.durationMs / 1000).toFixed(1)}s`
      : failure
        ? failure.code === 'unreachable'
          ? 'Not reachable. See the setup steps below.'
          : failure.message
        : 'No answer yet this run.';

  return (
    <section ref={sectionRef} aria-label="Live monitoring" className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Live analysis</h2>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
          local AI · visual only
        </span>
      </div>

      <ChartContextForm value={context} onChange={(patch) => onSettings({ context: { ...context, ...patch } })} />

      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <label className="space-y-1">
          <span>Vision model (Ollama)</span>
          <select className={select} value={model} onChange={(e) => onSettings({ model: e.target.value as VisionModel })}>
            {VISION_MODELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span>Capture every</span>
          <select className={select} value={intervalSec} onChange={(e) => onSettings({ intervalSec: Number(e.target.value) })}>
            {INTERVALS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input type="checkbox" checked={soundOn} onChange={(e) => onSettings({ soundOn: e.target.checked })} className="accent-sky-500" />
        Play a sound when an UP / DOWN signal appears (the card also flashes)
      </label>

      <OllamaSetup model={model} showSteps={failure?.code === 'unreachable'} />

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-zinc-400">
        <dt>Status</dt>
        <dd role="status" className="flex items-center justify-end gap-1.5 text-right text-zinc-200">
          {view.phase === 'capturing' || view.phase === 'analyzing' ? <Activity className="size-3.5 motion-safe:animate-pulse" aria-hidden /> : null}
          {PHASE[view.phase]}
        </dd>
        <dt>Ollama</dt>
        <dd className="text-right text-zinc-200">{connection}</dd>
        <dt>Last analysis</dt>
        <dd className="text-right font-mono text-zinc-200">{view.result ? formatLocalTime(view.result.analyzedAt) : '—'}</dd>
        <dt>Next capture</dt>
        <dd className="text-right font-mono text-zinc-200">{(view.phase === 'waiting' || view.phase === 'tab_hidden') && view.nextAt ? formatLocalTime(new Date(view.nextAt).toISOString()) : '—'}
          {view.failures > 0 ? ` (model failed ${view.failures}× in a row, waiting longer)` : ''}
        </dd>
      </dl>

      {view.observation ? (
        <div className="space-y-1 text-xs">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Detected on the chart (model, unverified)</h3>
          <div className="flex flex-wrap gap-1">
            {view.observation.patterns.length ? (
              view.observation.patterns.map((p) => (
                <span key={p} className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
                  {p.replaceAll('_', ' ')}
                </span>
              ))
            ) : (
              <span className="text-zinc-500">No listed pattern</span>
            )}
          </div>
          {view.observation.notes.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-zinc-300">
              {view.observation.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          {view.observation.droppedNotes ? (
            <p className="text-zinc-500">{view.observation.droppedNotes} note(s) hidden because they contained numbers read from pixels.</p>
          ) : null}
        </div>
      ) : null}

      {view.result ? <AnalysisResultCard result={view.result} /> : null}

      {signal ? (
        <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-zinc-400">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span>Simulated stake (units)</span>
              <input type="number" min="0.01" step="any" value={stake} onChange={(e) => onSettings({ stake: Number(e.target.value) })} className={select} />
            </label>
            <label className="space-y-1">
              <span>Payout on win (%)</span>
              <input type="number" min="1" max="1000" step="any" value={payoutPct} onChange={(e) => onSettings({ payoutPct: Number(e.target.value) })} className={select} />
            </label>
          </div>
          <button
            type="button"
            disabled={recorded || !validTrade}
            onClick={() => journal.record(signal, stake, payoutPct / 100)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <NotebookPen className="size-4" aria-hidden />
            {recorded ? 'Recorded in the journal' : 'Record paper trade (simulated)'}
          </button>
          <p>Enter the payout your platform shows. Nothing is sent to any website; settle it in the Journal tab after expiry.</p>
        </div>
      ) : null}
    </section>
  );
}
