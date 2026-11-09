import { useEffect, useState } from 'react';
import { parseSession, SESSION_KEY } from '../../storage/chromeStorage';
import type { SessionState } from '../../types/session';
import { sendRequest } from '../api';

/**
 * The background worker owns the session. The panel reads it once, then follows
 * `chrome.storage.session` changes, so the UI stays correct if the worker restarts.
 */
export function useSession(): SessionState | null {
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    let alive = true;

    void sendRequest<SessionState>({ type: 'GET_SESSION' }).then((response) => {
      if (alive && response.ok) setSession(response.data);
    });

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      const change = changes[SESSION_KEY];
      if (areaName === 'session' && change) setSession(parseSession(change.newValue));
    };
    chrome.storage.onChanged.addListener(onChanged);

    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return session;
}
