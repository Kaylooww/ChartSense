import { useCallback, useMemo, useRef, useState } from 'react';
import type { CaptureFrame, Failure } from '../../types/messages';
import type {
  RelRect,
  SelectionStaleReason,
  SessionState,
} from '../../types/session';
import { sendRequest } from '../api';

export interface CaptureFlow {
  /** The latest full-tab screenshot. Memory only: dropped when the session stops or the tab changes. */
  frame: CaptureFrame | null;
  busy: boolean;
  /** Error from the last request that did not come through the persisted session. */
  localError: Failure | null;
  /** The selected chart region (relative to the frame), including a just-committed one. */
  selection: RelRect | null;
  /** Set when the page layout changed since the selection was drawn. */
  stale: SelectionStaleReason | null;
  /** Resolves with the new frame, or null if it failed or a newer request/Stop superseded it. */
  captureOnce: () => Promise<CaptureFrame | null>;
  commitSelection: (rel: RelRect) => void;
  clearSelection: () => void;
  dismissError: () => void;
}

/**
 * Owns everything that lives only in the side panel's memory: the latest frame, the in-flight
 * request id, and the optimistic selection. Frames are never persisted.
 */
export function useCaptureFlow(session: SessionState | null): CaptureFlow {
  const [frame, setFrame] = useState<CaptureFrame | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<Failure | null>(null);
  const [pending, setPending] = useState<{ rel: RelRect | null; baseline: string | null } | null>(null);
  const latestRequestId = useRef<string | null>(null);

  // Identity of the running capture session. Any change (stop, new tab, new start) discards frames.
  const sessionKey =
    session && session.source && (session.status === 'active' || session.status === 'paused')
      ? `${session.source.tabId}|${session.source.authorizedAt}|${session.startedAt ?? ''}`
      : null;
  const [currentKey, setCurrentKey] = useState<string | null>(sessionKey);
  if (currentKey !== sessionKey) {
    // Adjusting state while rendering is React's supported pattern for "reset when a prop changes".
    setCurrentKey(sessionKey);
    setFrame(null);
    setBusy(false);
    setLocalError(null);
    setPending(null);
  }

  const persisted = session?.selection ?? null;
  const pendingApplies = pending !== null && (persisted?.setAt ?? null) === pending.baseline;
  const selectionRel = pendingApplies ? pending.rel : (persisted?.rel ?? null);

  // Keep the selection object's identity stable across unrelated session updates so the crop
  // is only recomputed when the rectangle really changes.
  const sx = selectionRel?.x ?? null;
  const sy = selectionRel?.y ?? null;
  const sw = selectionRel?.w ?? null;
  const sh = selectionRel?.h ?? null;
  const selection = useMemo<RelRect | null>(
    () => (sx === null || sy === null || sw === null || sh === null ? null : { x: sx, y: sy, w: sw, h: sh }),
    [sx, sy, sw, sh],
  );

  const stale = pendingApplies ? null : (session?.selectionStale ?? null);

  const captureOnce = useCallback(() => {
    const requestId = crypto.randomUUID();
    latestRequestId.current = requestId;
    setBusy(true);
    setLocalError(null);
    return sendRequest<CaptureFrame>({ type: 'CAPTURE_ONCE', requestId }).then((response) => {
      // A newer request, or a Stop, superseded this one: discard the answer.
      if (latestRequestId.current !== requestId) return null;
      latestRequestId.current = null;
      setBusy(false);
      if (response.ok && response.data.requestId === requestId) {
        setFrame(response.data);
        return response.data;
      }
      if (!response.ok) setLocalError(response.error);
      return null;
    });
  }, []);

  const commitSelection = useCallback(
    (rel: RelRect) => {
      if (!frame) return;
      setPending({ rel, baseline: persisted?.setAt ?? null });
      void sendRequest({ type: 'SET_SELECTION', rel, layout: frame.layout }).then((response) => {
        if (!response.ok) {
          setPending(null);
          setLocalError(response.error);
        }
      });
    },
    [frame, persisted?.setAt],
  );

  const clearSelection = useCallback(() => {
    setPending({ rel: null, baseline: persisted?.setAt ?? null });
    void sendRequest({ type: 'CLEAR_SELECTION' });
  }, [persisted?.setAt]);

  const dismissError = useCallback(() => {
    setLocalError(null);
    void sendRequest({ type: 'CLEAR_ERROR' });
  }, []);

  return {
    frame,
    busy,
    localError,
    selection,
    stale,
    captureOnce,
    commitSelection,
    clearSelection,
    dismissError,
  };
}
