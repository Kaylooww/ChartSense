import { Activity } from 'lucide-react';
import { VISION_MODELS, type VisionModel } from '../analysis/ollama';
import type { MonitorView } from '../sidepanel/hooks/useMonitor';
import { formatLocalTime } from '../sidepanel/format';
import type { ChartContext } from '../types/market';
import { AnalysisResultCard } from './AnalysisResultCard';
import { ChartContextForm } from './ChartContextForm';
import { OllamaSetup } from './OllamaSetup';

export const INTERVALS = [5, 10, 15, 30, 60];

const PHASE: Record<MonitorView['phase'], string> = {
  off: 'Not monitoring. Press Start monitoring.',
  starting: 'Starting…',
  needs_selection: 'Select the chart region on the screenshot below to begin analysis.',
  capturing: 'Capturing the chart…',
  analyzing: 'Analyzing with the local model…',
  waiting: 'Waiting for the next capture.',
};

const select = 'w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100';

export function MonitorPanel(props: {
  view: MonitorView;
  context: ChartContext;
  onContext: (patch: Partial<ChartContext>) => void;
  model: VisionModel;
  onModel: (m: VisionModel) => void;
  intervalSec: number;
  onInterval: (s: number) => void;
}) {
  const { view, context, model, intervalSec } = props;
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
    <section aria-label="Live monitoring" className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Live analysis</h2>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
          local AI · visual only
        </span>
      </div>

      <ChartContextForm value={context} onChange={props.onContext} />

      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <label className="space-y-1">
          <span>Vision model (Ollama)</span>
          <select className={select} value={model} onChange={(e) => props.onModel(e.target.value as VisionModel)}>
            {VISION_MODELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span>Capture every</span>
          <select className={select} value={intervalSec} onChange={(e) => props.onInterval(Number(e.target.value))}>
            {INTERVALS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
      </div>

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
        <dd className="text-right font-mono text-zinc-200">{view.phase === 'waiting' && view.nextAt ? formatLocalTime(new Date(view.nextAt).toISOString()) : '—'}</dd>
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
    </section>
  );
}
