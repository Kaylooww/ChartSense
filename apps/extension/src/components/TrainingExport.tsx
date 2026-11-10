import { Download, ScanSearch, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CropResult } from '../capture/cropFrame';
import { downscaleToBase64 } from '../capture/downscale';
import { buildTrainingExport, type TrainingExport as Export } from '../capture/trainingExport';

const button = 'inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 hover:bg-zinc-700';

/**
 * Optional, explicit export of the current crop for model training (D-029). Nothing happens until
 * the user prepares it, reviews both images and ticks the privacy box; the file is only saved when
 * they click the download link. Nothing is stored by the extension and nothing is uploaded.
 */
export function TrainingExport({ crop, sessionStartedAt, chartTimeframeSec }: { crop: CropResult | null; sessionStartedAt: string | null; chartTimeframeSec: number | null }) {
  // A prepared export is a frozen snapshot: monitoring keeps capturing, but the images being reviewed
  // (and their capture time) never change until the user saves or discards them.
  const [current, setCurrent] = useState<Export | null>(null);
  const [reviewed, setReviewed] = useState(false);

  const url = useMemo(
    () => (current && reviewed ? URL.createObjectURL(new Blob([JSON.stringify(current)], { type: 'application/json' })) : null),
    [current, reviewed],
  );
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);

  async function prepare() {
    if (!crop) return;
    // The same two images the local model receives: downscaled crop + newest 30% strip.
    const chart = await downscaleToBase64(crop.dataUrl);
    const recent = await downscaleToBase64(crop.dataUrl, 1024, 0.7);
    setReviewed(false);
    setCurrent(buildTrainingExport({ chart, recent, capturedAt: crop.capturedAt, sessionStartedAt, chartTimeframeSec }));
  }

  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-zinc-400">
      <p className="font-semibold uppercase tracking-wide text-zinc-400">Export for model training (optional)</p>
      <p>Saves this crop to your Downloads only when you click the link. Nothing is stored or uploaded automatically.</p>
      {!current ? (
        <button type="button" className={`${button} disabled:opacity-40`} disabled={!crop} onClick={() => void prepare()}>
          <ScanSearch className="size-3.5" aria-hidden /> Prepare export of this crop
        </button>
      ) : (
        <>
          <div className="flex gap-2">
            <img src={`data:image/png;base64,${current.images.chart}`} alt="Chart image to export" className="h-28 min-w-0 flex-1 rounded border border-zinc-700 object-contain" />
            <img src={`data:image/png;base64,${current.images.recent}`} alt="Newest-candles strip to export" className="h-28 w-16 rounded border border-zinc-700 object-contain" />
          </div>
          <label className="flex items-start gap-2 text-zinc-300">
            <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5 accent-sky-500" />
            I checked both images: they show only the chart, with no balance, username, account ID, messages or other personal data.
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {url ? (
              <a href={url} download={`chartsense-training-${current.id}.json`} className={button}>
                <Download className="size-3.5" aria-hidden /> Save training file
              </a>
            ) : (
              <p>Tick the box after reviewing to enable the download.</p>
            )}
            <button type="button" className={button} onClick={() => setCurrent(null)}>
              <X className="size-3.5" aria-hidden /> Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
