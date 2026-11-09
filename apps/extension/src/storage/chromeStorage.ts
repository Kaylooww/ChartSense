import { z } from 'zod';
import { initialSession, SessionStateSchema, type SessionState } from '../types/session';

export const SESSION_KEY = 'chartsense.session';
export const ONBOARDING_KEY = 'chartsense.onboarding';

/** Bump when the risk/privacy text changes materially so users must re-acknowledge it. */
export const ONBOARDING_VERSION = 1;

/**
 * The capture session lives in `chrome.storage.session`: it survives service-worker restarts but
 * is wiped when the browser closes and is never synced. Screenshots are never stored here.
 */
export async function loadSession(): Promise<SessionState> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  const parsed = SessionStateSchema.safeParse(stored[SESSION_KEY]);
  return parsed.success ? parsed.data : initialSession();
}

export async function saveSession(state: SessionState): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: state });
}

export function parseSession(value: unknown): SessionState {
  const parsed = SessionStateSchema.safeParse(value);
  return parsed.success ? parsed.data : initialSession();
}

const OnboardingSchema = z.object({
  version: z.number().int(),
  acceptedAt: z.string(),
});

/** Non-secret preference stored locally: the user has read the risk and data-handling notice. */
export async function loadOnboardingAccepted(): Promise<boolean> {
  const stored = await chrome.storage.local.get(ONBOARDING_KEY);
  const parsed = OnboardingSchema.safeParse(stored[ONBOARDING_KEY]);
  return parsed.success && parsed.data.version >= ONBOARDING_VERSION;
}

export async function saveOnboardingAccepted(): Promise<void> {
  await chrome.storage.local.set({
    [ONBOARDING_KEY]: { version: ONBOARDING_VERSION, acceptedAt: new Date().toISOString() },
  });
}
