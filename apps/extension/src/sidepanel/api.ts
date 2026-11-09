import type { Request, Response } from '../types/messages';

/** Sends a typed request to the background worker. Never throws: failures come back as `{ ok: false }`. */
export async function sendRequest<T>(request: Request): Promise<Response<T>> {
  try {
    const response = (await chrome.runtime.sendMessage(request)) as Response<T> | undefined;
    if (!response) {
      return { ok: false, error: { code: 'INTERNAL', message: 'The background worker did not answer.' } };
    }
    return response;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL',
        message: error instanceof Error ? error.message : 'Could not reach the background worker.',
      },
    };
  }
}
