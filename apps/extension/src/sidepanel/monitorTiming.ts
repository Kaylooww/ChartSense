export const MAX_BACKOFF_MS = 60_000;

/**
 * Delay before the next monitoring cycle. Normally the next capture starts `intervalSec` after the
 * previous one started (at least 1 s after it ended). After consecutive model failures the delay
 * doubles each time, up to 60 s, so a stopped Ollama is not hammered; one success resets it.
 */
export function nextDelayMs(intervalSec: number, elapsedMs: number, consecutiveFailures: number): number {
  const base = Math.max(intervalSec * 1000 - elapsedMs, 1000);
  if (consecutiveFailures <= 0) return base;
  return Math.max(base, Math.min(MAX_BACKOFF_MS, intervalSec * 1000 * 2 ** consecutiveFailures));
}
