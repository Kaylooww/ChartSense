import { Maximize, Trash2 } from 'lucide-react';
import { useRef, useState, type PointerEvent } from 'react';
import { FULL_FRAME, normalizeDrag, toImagePixels, toRelative, type Point } from '../capture/cropMath';
import { formatLocalTime } from '../sidepanel/format';
import type { CaptureFrame } from '../types/messages';
import type { RelRect, SelectionStaleReason } from '../types/session';

interface Props {
  frame: CaptureFrame;
  selection: RelRect | null;
  stale: SelectionStaleReason | null;
  onCommit: (rel: RelRect) => void;
  onClear: () => void;
}

/** Drags shorter than this (in CSS px) are treated as accidental clicks, not selections. */
const MIN_DRAG_PX = 8;

const STALE_TEXT: Record<SelectionStaleReason, string> = {
  SIZE_CHANGED: 'The page size changed (window or panel resized).',
  ZOOM_CHANGED: 'The page zoom changed.',
};

export function CropSelector({ frame, selection, stale, onCommit, onClear }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  // `live` is the rectangle being dragged, as fractions of the preview. It is computed inside the
  // pointer handlers (where reading the DOM is allowed), never during render.
  const [drag, setDrag] = useState<{ start: Point; live: RelRect | null } | null>(null);

  const measure = (event: PointerEvent): { point: Point; w: number; h: number } | null => {
    const box = imageRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return { point: { x: event.clientX - box.left, y: event.clientY - box.top }, w: box.width, h: box.height };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const m = measure(event);
    if (!m) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ start: m.point, live: null });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const m = measure(event);
    if (!m) return;
    const rect = normalizeDrag(drag.start, m.point, m.w, m.h);
    setDrag({ start: drag.start, live: toRelative(rect, m.w, m.h) });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const m = measure(event);
    setDrag(null);
    if (!m) return;
    const rect = normalizeDrag(drag.start, m.point, m.w, m.h);
    if (rect.w < MIN_DRAG_PX || rect.h < MIN_DRAG_PX) return;
    const rel = toRelative(rect, m.w, m.h);
    if (rel) onCommit(rel);
  };

  // While dragging, show the live rectangle; otherwise show the committed selection.
  const shown: RelRect | null = drag ? drag.live : selection;

  const px = shown ? toImagePixels(shown, frame.layout.imageWidth, frame.layout.imageHeight) : null;

  return (
    <section aria-label="Chart region selector" className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">1 · Select the chart</h2>
        <span className="font-mono text-[11px] text-zinc-500">
          Frame {frame.layout.imageWidth}×{frame.layout.imageHeight}px · {formatLocalTime(frame.capturedAt)}
        </span>
      </div>

      {stale ? (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          {STALE_TEXT[stale]} Your old selection (dashed) may no longer match the chart. Draw the region again.
        </p>
      ) : null}

      <div
        role="application"
        aria-label="Drag on the screenshot to select the chart area. Keyboard users can use the Use full frame button instead."
        className="relative cursor-crosshair touch-none select-none overflow-hidden rounded border border-zinc-700"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        <img
          ref={imageRef}
          src={frame.dataUrl}
          alt="Screenshot of the authorized tab"
          draggable={false}
          className="block h-auto w-full"
        />
        {shown ? (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ${
              stale ? 'border-dashed border-amber-400' : 'border-sky-400'
            }`}
            style={{
              left: `${shown.x * 100}%`,
              top: `${shown.y * 100}%`,
              width: `${shown.w * 100}%`,
              height: `${shown.h * 100}%`,
            }}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-zinc-400" aria-live="polite">
          {px ? `Selection ${px.w}×${px.h}px at (${px.x}, ${px.y})` : 'Drag on the screenshot to select the chart.'}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onCommit(FULL_FRAME)}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
          >
            <Maximize className="size-3.5" aria-hidden />
            Use full frame
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!selection}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
