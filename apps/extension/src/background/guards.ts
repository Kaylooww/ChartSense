import type { ErrorCode, SessionState } from '../types/session';

/** Minimum gap between two screenshots. Chrome allows 2/s; we stay well below that. */
export const MIN_CAPTURE_INTERVAL_MS = 1000;

export interface SenderLike {
  id?: string | undefined;
  url?: string | undefined;
}

/**
 * Only the extension's own side panel page may drive the background worker. Web pages cannot
 * message the extension at all (no `externally_connectable`, no content scripts), so this is a
 * second layer of defence.
 */
export function isTrustedSender(
  sender: SenderLike,
  extensionId: string,
  sidePanelUrl: string,
): boolean {
  if (!extensionId || sender.id !== extensionId) return false;
  if (typeof sender.url !== 'string') return false;
  return sender.url === sidePanelUrl || sender.url.startsWith(`${sidePanelUrl}?`) || sender.url.startsWith(`${sidePanelUrl}#`);
}

/** Only ordinary web pages can be captured. Browser-internal and store pages are rejected up front. */
export function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
  } catch {
    return false;
  }
}

/** Origin string for display and comparison. `file:` pages report an opaque origin, so use a fixed label. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return 'file://';
    return u.origin;
  } catch {
    return null;
  }
}

export type CaptureGate = { ok: true } | { ok: false; code: ErrorCode };

export interface CaptureGateInput {
  session: SessionState;
  /** The tab currently in front in the source window, if known. */
  activeTabId: number | undefined;
  captureInFlight: boolean;
  nowMs: number;
  lastCaptureAtMs: number;
  minIntervalMs?: number;
}

/**
 * Decides whether a screenshot may be taken right now. Checks run from most to least
 * fundamental so the user sees the most useful error first.
 */
export function checkCaptureAllowed(input: CaptureGateInput): CaptureGate {
  const { session, activeTabId, captureInFlight, nowMs, lastCaptureAtMs } = input;
  const minInterval = input.minIntervalMs ?? MIN_CAPTURE_INTERVAL_MS;

  if (session.source === null || session.status === 'idle') return { ok: false, code: 'NO_SOURCE_TAB' };
  if (session.status === 'paused') return { ok: false, code: 'SESSION_PAUSED' };
  if (session.status !== 'active') return { ok: false, code: 'SESSION_NOT_ACTIVE' };
  if (captureInFlight) return { ok: false, code: 'BUSY' };
  if (activeTabId !== session.source.tabId) return { ok: false, code: 'TAB_NOT_ACTIVE' };
  if (nowMs - lastCaptureAtMs < minInterval) return { ok: false, code: 'RATE_LIMITED' };
  return { ok: true };
}
