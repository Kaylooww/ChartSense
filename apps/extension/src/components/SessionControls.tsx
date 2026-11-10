import { Camera, Pause, Play, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SessionState } from '../types/session';

interface Props {
  session: SessionState;
  busy: boolean;
  sourceVisible: boolean | null;
  onStart: () => void;
  onCaptureOnce: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function Button({
  children,
  onClick,
  disabled,
  variant = 'neutral',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
  variant?: 'primary' | 'neutral' | 'danger';
}) {
  const styles = {
    primary: 'bg-sky-500 text-zinc-950 hover:bg-sky-400',
    neutral: 'border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
    danger: 'border border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function SessionControls({ session, busy, sourceVisible, onStart, onCaptureOnce, onPause, onResume, onStop }: Props) {
  const { status } = session;
  const running = status === 'active' || status === 'paused';
  const canCapture = status === 'active' && !busy && sourceVisible !== false;

  return (
    <section aria-label="Capture controls" className="grid grid-cols-2 gap-2">
      <Button variant="primary" onClick={onStart} disabled={status !== 'armed'}>
        <Play className="size-4" aria-hidden />
        Start monitoring
      </Button>
      <Button onClick={onCaptureOnce} disabled={!canCapture}>
        <Camera className="size-4" aria-hidden />
        {busy ? 'Capturing…' : 'Capture once'}
      </Button>
      {status === 'paused' ? (
        <Button onClick={onResume} disabled={false}>
          <Play className="size-4" aria-hidden />
          Resume
        </Button>
      ) : (
        <Button onClick={onPause} disabled={status !== 'active'}>
          <Pause className="size-4" aria-hidden />
          Pause
        </Button>
      )}
      <Button variant="danger" onClick={onStop} disabled={!running}>
        <Square className="size-4" aria-hidden />
        Stop
      </Button>
    </section>
  );
}
