import { useEffect, useState } from 'react';
import type { SourceTab } from '../../types/session';

/**
 * Whether the authorized tab is the one currently in front. Chrome can only capture the visible tab,
 * so the panel disables capturing while the chart tab is in the background.
 * Returns null when there is no source tab or the state is not known yet.
 */
export function useSourceVisible(source: SourceTab | null): boolean | null {
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const windowId = source?.windowId ?? null;

  useEffect(() => {
    if (windowId === null) return;
    let alive = true;

    void chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
      if (alive) setActiveTabId(tab?.id ?? null);
    });

    const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
      if (info.windowId === windowId) setActiveTabId(info.tabId);
    };
    chrome.tabs.onActivated.addListener(onActivated);

    return () => {
      alive = false;
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, [windowId]);

  if (source === null || activeTabId === null) return null;
  return activeTabId === source.tabId;
}
