import { TriangleAlert, X } from 'lucide-react';
import { ERROR_COPY } from '../capture/errors';
import type { ErrorCode } from '../types/session';

export function ErrorBanner({ code, onDismiss }: { code: ErrorCode; onDismiss: () => void }) {
  const copy = ERROR_COPY[code];
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-300" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-rose-100">{copy.title}</p>
        <p className="text-xs leading-relaxed text-rose-100/80">{copy.detail}</p>
        <p className="text-xs leading-relaxed text-rose-50">{copy.recovery}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="h-fit rounded p-1 text-rose-200 hover:bg-rose-500/20"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
