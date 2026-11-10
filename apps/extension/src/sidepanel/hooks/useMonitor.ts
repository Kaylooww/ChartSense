import { useEffect, useRef, useState } from 'react';
import { observeChart, type VisionModel, type VisualObservation, type ObserveOutcome } from '../../analysis/ollama';
import { cropFrame } from '../../capture/cropFrame';
import { downscaleToBase64 } from '../../capture/downscale';
import { detectLayoutChange } from '../../capture/layout';
import { evaluateVisual, type VisualCandidate } from '../../signals/visual';
import type { AnalysisResult, ChartContext } from '../../types/market';
import type { CaptureFrame } from '../../types/messages';
import type { LayoutSignature, RelRect } from '../../types/session';

export type MonitorPhase = 'off' | 'starting' | 'needs_selection' | 'capturing' | 'analyzing' | 'waiting';

export type MonitorView = {
  phase: MonitorPhase;
  /** Epoch ms of the next scheduled capture while waiting. */
  nextAt: number | null;
  result: AnalysisResult | null;
  observation: VisualObservation | null;
  /** Failure of the last model call, if it failed (drives the connection status line). */
  modelFailure: Extract<ObserveOutcome, { ok: false }> | null;
  cycles: number;
};

type Run = Omit<MonitorView, 'phase'> & { key: string; phase: MonitorPhase };

const IDLE: Omit<Run, 'key'> = { phase: 'starting', nextAt: null, result: null, observation: null, modelFailure: null, cycles: 0 };

/**
 * Live monitoring loop, run by the side panel (closing the panel stops it). One cycle at a time:
 * capture -> crop -> local model -> visual rule. The next cycle starts `intervalSec` after the previous
 * one started, or 1 s after it ended if it ran longer, so requests never overlap or queue up.
 * Any change of region, context, interval or model restarts the loop and hides older results.
 */
export function useMonitor(opts: {
  active: boolean;
  frame: CaptureFrame | null;
  selection: RelRect | null;
  selectionLayout: LayoutSignature | null;
  stale: boolean;
  captureOnce: () => Promise<CaptureFrame | null>;
  context: ChartContext;
  intervalSec: number;
  model: VisionModel;
}): MonitorView {
  const { active, selection, selectionLayout, stale, captureOnce, context, intervalSec, model } = opts;

  const selKey = selection ? `${selection.x},${selection.y},${selection.w},${selection.h}|${stale}` : 'none';
  const key = `${selKey}|${JSON.stringify(context)}|${intervalSec}|${model}`;
  const [run, setRun] = useState<Run | null>(null);

  // Reading these through a ref lets the loop see the latest values without restarting on every frame.
  const latest = useRef({ frame: opts.frame, selection, selectionLayout, stale, context });
  useEffect(() => {
    latest.current = { frame: opts.frame, selection, selectionLayout, stale, context };
  });

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const { signal } = controller;
    const patch = (p: Partial<Run>) => {
      if (!signal.aborted) setRun((r) => ({ ...(r?.key === key ? r : { ...IDLE, key }), ...p }));
    };
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
      });
    let previous: VisualCandidate | null = null;
    let cycles = 0;

    /** Returns 'user' when the loop must stop and wait for a (new) region selection, which restarts it. */
    async function cycle(): Promise<'user' | void> {
      const { selection: rel, selectionLayout: layout, stale: isStale, context: ctx } = latest.current;
      if (!rel || isStale) {
        // Take one screenshot to draw on, then wait for the user instead of recapturing under their cursor.
        if (!latest.current.frame) {
          patch({ phase: 'capturing' });
          await captureOnce();
        }
        patch({ phase: 'needs_selection' });
        return 'user';
      }
      patch({ phase: 'capturing' });
      const frame = await captureOnce(); // failures are shown by the capture error banner
      if (!frame || signal.aborted) return;
      if (layout && detectLayoutChange(layout, frame.layout)) {
        patch({ phase: 'needs_selection' });
        return 'user';
      }
      const crop = await cropFrame(frame, rel);
      if (!crop.ok || signal.aborted) return;

      patch({ phase: 'analyzing' });
      let outcome: ObserveOutcome;
      try {
        // Only the cropped region is sent, downscaled, to Ollama on loopback.
        const pngBase64 = await downscaleToBase64(crop.value.dataUrl);
        outcome = await observeChart({ pngBase64, capturedAt: frame.capturedAt, model, signal });
      } catch {
        outcome = { ok: false, code: 'bad_response', message: 'Could not prepare the image.' };
      }
      if (signal.aborted || (!outcome.ok && outcome.code === 'aborted')) return;

      const { result, candidate } = evaluateVisual({ outcome, context: ctx, cropKey: selKey, capturedAt: frame.capturedAt, intervalSec, previous });
      previous = candidate;
      cycles += 1;
      patch({ result, cycles, observation: outcome.ok ? outcome.observation : null, modelFailure: outcome.ok ? null : outcome });
    }

    void (async () => {
      while (!signal.aborted) {
        const started = Date.now();
        if ((await cycle()) === 'user' || signal.aborted) break;
        const wait = Math.max(intervalSec * 1000 - (Date.now() - started), 1000);
        patch({ phase: 'waiting', nextAt: Date.now() + wait });
        await sleep(wait);
      }
    })();
    return () => {
      controller.abort();
      setRun(null); // pause, stop or a restart: never show the old run's result as current
    };
  }, [active, key, selKey, intervalSec, model, captureOnce]);

  if (!active) return { ...IDLE, phase: 'off' };
  return run?.key === key ? run : { ...IDLE };
}
