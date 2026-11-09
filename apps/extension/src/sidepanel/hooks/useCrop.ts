import { useEffect, useState } from 'react';
import { cropFrame, type CropOutcome } from '../../capture/cropFrame';
import type { CaptureFrame } from '../../types/messages';
import type { RelRect } from '../../types/session';

export type CropState =
  | { status: 'none' }
  | { status: 'working' }
  | { status: 'done'; outcome: CropOutcome };

/**
 * Produces the cropped chart image for the current frame and selection. Results are keyed by the
 * inputs, so a slow crop can never be shown for a newer frame or selection. When cropping is
 * disabled (session ended, selection stale) the cropped image is dropped from memory.
 */
export function useCrop(frame: CaptureFrame | null, rel: RelRect | null, enabled: boolean): CropState {
  const [result, setResult] = useState<{ key: string; outcome: CropOutcome } | null>(null);

  const key = frame && rel ? `${frame.requestId}|${rel.x}|${rel.y}|${rel.w}|${rel.h}` : null;
  const active = enabled && key !== null;

  // Dropping state while rendering is React's supported way to reset state when inputs go away.
  if (!active && result !== null) setResult(null);

  useEffect(() => {
    if (!active || !frame || !rel || key === null) return;
    let cancelled = false;
    void cropFrame(frame, rel).then((outcome) => {
      if (!cancelled) setResult({ key, outcome });
    });
    return () => {
      cancelled = true;
    };
  }, [active, frame, rel, key]);

  if (!active) return { status: 'none' };
  if (result?.key === key) return { status: 'done', outcome: result.outcome };
  return { status: 'working' };
}
