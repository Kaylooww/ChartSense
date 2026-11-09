import { useCallback, useEffect, useState } from 'react';
import { loadOnboardingAccepted, saveOnboardingAccepted } from '../../storage/chromeStorage';

/** `null` while loading, then whether the user has acknowledged the risk and privacy notice. */
export function useOnboarding(): { accepted: boolean | null; accept: () => void } {
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void loadOnboardingAccepted().then((value) => {
      if (alive) setAccepted(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const accept = useCallback(() => {
    setAccepted(true);
    void saveOnboardingAccepted();
  }, []);

  return { accepted, accept };
}
