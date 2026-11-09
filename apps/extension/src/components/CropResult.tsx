import { TriangleAlert } from 'lucide-react';
import { ERROR_COPY } from '../capture/errors';
import { formatLocalTime } from '../sidepanel/format';
import type { CropState } from '../sidepanel/hooks/useCrop';

export function CropResult({ crop }: { crop: CropState }) {
  return (
    <section aria-label="Cropped chart preview" className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">2 · Cropped chart preview</h2>

      {crop.status === 'none' ? (
        <p className="text-xs text-zinc-400">Select the chart region above to see the crop.</p>
      ) : null}
      {crop.status === 'working' ? <p className="text-xs text-zinc-400">Cropping…</p> : null}

      {crop.status === 'done' && !crop.outcome.ok ? (
        <p role="alert" className="text-xs text-rose-200">
          <span className="font-semibold">{ERROR_COPY[crop.outcome.code].title}.</span> {ERROR_COPY[crop.outcome.code].recovery}
        </p>
      ) : null}

      {crop.status === 'done' && crop.outcome.ok ? (
        <>
          <img
            src={crop.outcome.value.dataUrl}
            alt="Cropped chart region"
            className="block h-auto max-h-72 w-full rounded border border-zinc-700 bg-zinc-950 object-contain"
          />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-400">
            <dt>Crop size</dt>
            <dd className="text-right text-zinc-300">
              {crop.outcome.value.px.w}×{crop.outcome.value.px.h}px
            </dd>
            <dt>Screenshot taken</dt>
            <dd className="text-right text-zinc-300">{formatLocalTime(crop.outcome.value.capturedAt)}</dd>
            <dt>Data source</dt>
            <dd className="text-right text-zinc-300">visual_only</dd>
          </dl>
          {crop.outcome.value.quality.warnings.length > 0 ? (
            <ul className="space-y-1" aria-label="Image quality warnings">
              {crop.outcome.value.quality.warnings.map((warning) => (
                <li
                  key={warning.code}
                  className="flex gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-zinc-500">
              No obvious problems found. These checks are rough heuristics and do not prove the chart is readable.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
