import { detectLayoutChange } from '../capture/layout';
import { ERROR_COPY } from '../capture/errors';
import type {
  AppError,
  ErrorCode,
  LayoutSignature,
  RelRect,
  SessionState,
  SourceTab,
} from '../types/session';
import { initialSession } from '../types/session';

export type SessionEvent =
  | { type: 'TOOLBAR_CLICKED'; source: SourceTab }
  | { type: 'AUTHORIZE_REJECTED'; code: ErrorCode }
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'SOURCE_LOST'; code: 'SOURCE_NAVIGATED' | 'SOURCE_CLOSED' | 'PERMISSION_EXPIRED' }
  | { type: 'CAPTURE_SUCCEEDED'; layout: LayoutSignature }
  | { type: 'CAPTURE_FAILED'; code: ErrorCode }
  | { type: 'SELECTION_SET'; rel: RelRect; layout: LayoutSignature }
  | { type: 'SELECTION_CLEARED' }
  | { type: 'ERROR_CLEARED' };

export interface TransitionResult {
  state: SessionState;
  /** False when the event does not apply to the current status; `state` is then unchanged. */
  accepted: boolean;
}

function makeError(code: ErrorCode, at: string): AppError {
  return { code, message: ERROR_COPY[code].detail, at };
}

/**
 * Pure session reducer. Performs no I/O and reads no clock (the caller passes `nowIso`), which
 * keeps every lifecycle rule unit-testable.
 *
 * Privacy rules enforced here: Stop and any loss of the source tab clear the selection; a lost
 * source also forgets the tab entirely so authorization is never silently transferred.
 */
export function transition(state: SessionState, event: SessionEvent, nowIso: string): TransitionResult {
  const reject = (): TransitionResult => ({ state, accepted: false });
  const accept = (next: SessionState): TransitionResult => ({ state: next, accepted: true });

  switch (event.type) {
    case 'TOOLBAR_CLICKED': {
      const prev = state.source;
      const sameTab =
        prev !== null &&
        prev.tabId === event.source.tabId &&
        prev.origin === event.source.origin &&
        (state.status === 'active' || state.status === 'paused');
      if (sameTab) {
        // Re-authorizing the tab already in use keeps the running session.
        return accept({ ...state, source: event.source, lastError: null });
      }
      return accept({
        ...initialSession(),
        status: 'armed',
        source: event.source,
      });
    }

    case 'AUTHORIZE_REJECTED':
      return accept({ ...state, lastError: makeError(event.code, nowIso) });

    case 'START':
      if (state.status !== 'armed' || state.source === null) return reject();
      return accept({
        ...state,
        status: 'active',
        startedAt: nowIso,
        captureCount: 0,
        selection: null,
        selectionStale: null,
        lastError: null,
      });

    case 'PAUSE':
      if (state.status !== 'active') return reject();
      return accept({ ...state, status: 'paused' });

    case 'RESUME':
      if (state.status !== 'paused') return reject();
      return accept({ ...state, status: 'active', lastError: null });

    case 'STOP':
      if (state.status !== 'active' && state.status !== 'paused') return reject();
      // The tab stays authorized so the user can start a new session, but the old session's
      // selection and counters are discarded.
      return accept({
        ...state,
        status: 'armed',
        startedAt: null,
        captureCount: 0,
        selection: null,
        selectionStale: null,
        lastError: null,
      });

    case 'SOURCE_LOST':
      if (state.status === 'idle') return reject();
      return accept({ ...initialSession(), lastError: makeError(event.code, nowIso) });

    case 'CAPTURE_SUCCEEDED': {
      if (state.status !== 'active') return reject();
      let selectionStale = state.selectionStale;
      if (state.selection) {
        selectionStale = detectLayoutChange(state.selection.layout, event.layout);
      }
      return accept({
        ...state,
        captureCount: state.captureCount + 1,
        selectionStale,
        lastError: null,
      });
    }

    case 'CAPTURE_FAILED':
      if (state.status === 'idle') return reject();
      return accept({ ...state, lastError: makeError(event.code, nowIso) });

    case 'SELECTION_SET':
      if (state.status !== 'active' && state.status !== 'paused') return reject();
      return accept({
        ...state,
        selection: { rel: event.rel, layout: event.layout, setAt: nowIso },
        selectionStale: null,
        lastError: null,
      });

    case 'SELECTION_CLEARED':
      if (state.status === 'idle') return reject();
      return accept({ ...state, selection: null, selectionStale: null });

    case 'ERROR_CLEARED':
      return accept({ ...state, lastError: null });
  }
}
