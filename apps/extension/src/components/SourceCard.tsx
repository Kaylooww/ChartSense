import { CircleDashed, Pause, Radio, ShieldCheck } from 'lucide-react';
import type { ComponentType } from 'react';
import { formatLocalTime } from '../sidepanel/format';
import type { SessionState, SessionStatus } from '../types/session';

const STATUS: Record<
  SessionStatus,
  { label: string; hint: string; tone: string; Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }
> = {
  idle: {
    label: 'Idle',
    hint: 'Open your chart tab, then click the ChartSense icon in the Chrome toolbar to authorize it.',
    tone: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
    Icon: CircleDashed,
  },
  armed: {
    label: 'Tab authorized',
    hint: 'Press Start monitoring to begin. Nothing is captured until you do.',
    tone: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    Icon: ShieldCheck,
  },
  active: {
    label: 'Capturing',
    hint: 'Monitoring: the chart is captured and analyzed at the chosen interval until you press Pause or Stop, or close this panel.',
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    Icon: Radio,
  },
  paused: {
    label: 'Paused',
    hint: 'Captures are blocked. Press Resume to continue or Stop to end the session.',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    Icon: Pause,
  },
};

export function SourceCard({ session, sourceVisible }: { session: SessionState; sourceVisible: boolean | null }) {
  const { label, hint, tone, Icon } = STATUS[session.status];
  const { source } = session;

  return (
    <section aria-label="Source tab and session status" className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Source</h2>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
      </div>

      {source ? (
        <dl className="space-y-1 text-sm">
          <div>
            <dt className="sr-only">Tab title</dt>
            <dd className="truncate font-medium" title={source.title}>
              {source.title || 'Untitled tab'}
            </dd>
          </div>
          <div className="flex justify-between gap-2 text-xs text-zinc-400">
            <dt>Site</dt>
            <dd className="truncate font-mono text-zinc-300" title={source.origin}>
              {source.origin}
            </dd>
          </div>
          <div className="flex justify-between gap-2 text-xs text-zinc-400">
            <dt>Authorized</dt>
            <dd className="font-mono text-zinc-300">{formatLocalTime(source.authorizedAt)}</dd>
          </div>
          {session.status === 'active' || session.status === 'paused' ? (
            <div className="flex justify-between gap-2 text-xs text-zinc-400">
              <dt>Captures this session</dt>
              <dd className="font-mono text-zinc-300">{session.captureCount}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <p className="text-xs leading-relaxed text-zinc-400">{hint}</p>

      {source && sourceVisible === false ? (
        <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          The authorized tab is in the background. Switch back to it to capture.
        </p>
      ) : null}
    </section>
  );
}
