import { useCallback, useEffect, useState } from 'react';
import { canSettle, createTrade, PaperTradeSchema, settleTrade, type PaperTrade, type TradeResult } from '../../journal/journal';
import type { AnalysisResult } from '../../types/market';

export const JOURNAL_KEY = 'chartsense.journal';

/** Keeps every valid stored trade; a corrupt entry is skipped and counted, never silently rewritten away. */
function parseStored(value: unknown): { trades: PaperTrade[]; invalid: unknown[] } {
  const items = Array.isArray(value) ? value : [];
  const trades: PaperTrade[] = [];
  const invalid: unknown[] = [];
  for (const item of items) {
    const parsed = PaperTradeSchema.safeParse(item);
    if (parsed.success) trades.push(parsed.data);
    else invalid.push(item);
  }
  return { trades, invalid };
}

export type Journal = {
  trades: PaperTrade[] | null;
  invalidCount: number;
  recordedSignalIds: Set<string>;
  record: (signal: AnalysisResult, stake: number, payoutFraction: number) => void;
  settle: (id: string, result: Exclude<TradeResult, 'OPEN'>) => void;
  clear: () => void;
};

/** Paper trades in chrome.storage.local (local only, never synced). */
export function useJournal(): Journal {
  const [state, setState] = useState<{ trades: PaperTrade[]; invalid: unknown[] } | null>(null);

  useEffect(() => {
    let alive = true;
    void chrome.storage.local.get(JOURNAL_KEY).then((stored) => alive && setState(parseStored(stored[JOURNAL_KEY])));
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && JOURNAL_KEY in changes) setState(parseStored(changes[JOURNAL_KEY]!.newValue));
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const write = useCallback((update: (trades: PaperTrade[]) => PaperTrade[]) => {
    // Re-read before writing so another open panel's changes are not lost.
    void chrome.storage.local.get(JOURNAL_KEY).then((stored) => {
      const current = parseStored(stored[JOURNAL_KEY]);
      const next = [...current.invalid, ...update(current.trades)];
      return chrome.storage.local.set({ [JOURNAL_KEY]: next });
    });
  }, []);

  return {
    trades: state?.trades ?? null,
    invalidCount: state?.invalid.length ?? 0,
    recordedSignalIds: new Set(state?.trades.map((t) => t.signalId)),
    record: (signal, stake, payoutFraction) =>
      write((ts) => (ts.some((t) => t.signalId === signal.id) ? ts : [...ts, createTrade(signal, stake, payoutFraction)])),
    settle: (id, result) => write((ts) => ts.map((t) => (t.id === id && canSettle(t) ? settleTrade(t, result) : t))),
    clear: () => void chrome.storage.local.remove(JOURNAL_KEY),
  };
}
