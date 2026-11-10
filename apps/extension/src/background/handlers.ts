import { ERROR_COPY, classifyCaptureError } from '../capture/errors';
import { readPngSize } from '../capture/pngSize';
import { fail, ok, RequestSchema } from '../types/messages';
import type { CaptureFrame, Response } from '../types/messages';
import type { ErrorCode, LayoutSignature, SessionState } from '../types/session';
import {
  checkCaptureAllowed,
  isCapturableUrl,
  isTrustedSender,
  originOf,
  type SenderLike,
} from './guards';
import { Mutex } from './mutex';
import { transition, type SessionEvent, type TransitionResult } from './sessionMachine';

/** Everything the background logic needs from the outside world, injected so it can be unit-tested. */
export interface BackgroundDeps {
  extensionId: string;
  /** Full URL of the side panel page, e.g. chrome-extension://<id>/sidepanel.html */
  sidePanelUrl: string;
  nowMs(): number;
  loadSession(): Promise<SessionState>;
  saveSession(state: SessionState): Promise<void>;
  /** The tab currently in front in the given window. */
  getActiveTabId(windowId: number): Promise<number | undefined>;
  getZoom(tabId: number): Promise<number>;
  /** Wraps chrome.tabs.captureVisibleTab(windowId, { format: 'png' }). */
  captureVisibleTab(windowId: number): Promise<string>;
}

export interface TabLike {
  id?: number | undefined;
  windowId?: number | undefined;
  url?: string | undefined;
  title?: string | undefined;
}

export interface TabChangeInfoLike {
  url?: string | undefined;
  status?: string | undefined;
}

const MAX_TITLE_LENGTH = 120;

export function createBackground(deps: BackgroundDeps) {
  const mutex = new Mutex();
  let captureInFlight = false;
  let lastCaptureAtMs = 0;

  const nowIso = () => new Date(deps.nowMs()).toISOString();

  /** Runs a reducer event against the persisted session. Callers must hold the mutex. */
  async function apply(event: SessionEvent): Promise<TransitionResult> {
    const current = await deps.loadSession();
    const result = transition(current, event, nowIso());
    if (result.accepted) await deps.saveSession(result.state);
    return result;
  }

  async function command(event: SessionEvent): Promise<Response<SessionState>> {
    return mutex.run(async () => {
      if (event.type === 'START') {
        const current = await deps.loadSession();
        if (current.source === null) {
          return fail('NO_SOURCE_TAB', ERROR_COPY.NO_SOURCE_TAB.recovery);
        }
      }
      const result = await apply(event);
      if (!result.accepted) return fail('INVALID_STATE', ERROR_COPY.INVALID_STATE.detail);
      return ok(result.state);
    });
  }

  async function captureOnce(requestId: string): Promise<Response<CaptureFrame>> {
    // Step 1 (locked): decide whether a capture is allowed and claim the single capture slot.
    const claim = await mutex.run(async () => {
      const session = await deps.loadSession();
      const source = session.source;
      let activeTabId: number | undefined;
      if (source) {
        try {
          activeTabId = await deps.getActiveTabId(source.windowId);
        } catch {
          activeTabId = undefined;
        }
      }
      const gate = checkCaptureAllowed({
        session,
        activeTabId,
        captureInFlight,
        nowMs: deps.nowMs(),
        lastCaptureAtMs,
      });
      if (!gate.ok) {
        // BUSY is transient and must not clobber the status of the capture that is running.
        if (gate.code !== 'BUSY') await apply({ type: 'CAPTURE_FAILED', code: gate.code });
        return { ok: false as const, code: gate.code };
      }
      if (source === null) return { ok: false as const, code: 'NO_SOURCE_TAB' as ErrorCode };
      captureInFlight = true;
      lastCaptureAtMs = deps.nowMs();
      return { ok: true as const, source };
    });

    if (!claim.ok) return fail(claim.code, ERROR_COPY[claim.code].detail);

    // Step 2 (unlocked): the actual screenshot. Stop/Pause can still be processed meanwhile.
    let dataUrl = '';
    let zoomFactor = 1;
    let failureCode: ErrorCode | null = null;
    try {
      dataUrl = await deps.captureVisibleTab(claim.source.windowId);
      zoomFactor = await deps.getZoom(claim.source.tabId).catch(() => 1);
    } catch (error) {
      failureCode = classifyCaptureError(error instanceof Error ? error.message : String(error));
    }

    // Step 3 (locked): re-validate, because the session may have changed during step 2.
    return mutex.run(async () => {
      captureInFlight = false;

      if (failureCode !== null) {
        if (failureCode === 'PERMISSION_EXPIRED' || failureCode === 'SOURCE_CLOSED') {
          await apply({ type: 'SOURCE_LOST', code: failureCode });
        } else {
          await apply({ type: 'CAPTURE_FAILED', code: failureCode });
        }
        return fail(failureCode, ERROR_COPY[failureCode].detail);
      }

      const session = await deps.loadSession();
      const stillSame =
        session.status === 'active' &&
        session.source !== null &&
        session.source.tabId === claim.source.tabId &&
        session.source.authorizedAt === claim.source.authorizedAt;
      if (!stillSame) {
        // Discard: never hand back a frame for a session the user has already ended or changed.
        return fail(
          'SESSION_NOT_ACTIVE',
          'The session ended or changed while the screenshot was being taken. The frame was discarded.',
        );
      }

      const size = readPngSize(dataUrl);
      if (size === null) {
        await apply({ type: 'CAPTURE_FAILED', code: 'CAPTURE_FAILED' });
        return fail('CAPTURE_FAILED', 'Chrome returned an image ChartSense could not read.');
      }

      const layout: LayoutSignature = {
        imageWidth: size.width,
        imageHeight: size.height,
        zoomFactor,
      };
      await apply({ type: 'CAPTURE_SUCCEEDED', layout });
      return ok<CaptureFrame>({ requestId, dataUrl, capturedAt: nowIso(), layout });
    });
  }

  async function handleMessage(raw: unknown, sender: SenderLike): Promise<Response<unknown>> {
    if (!isTrustedSender(sender, deps.extensionId, deps.sidePanelUrl)) {
      return fail('UNTRUSTED_SENDER', ERROR_COPY.UNTRUSTED_SENDER.detail);
    }
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) return fail('BAD_REQUEST', ERROR_COPY.BAD_REQUEST.detail);
    const request = parsed.data;

    switch (request.type) {
      case 'GET_SESSION':
        return mutex.run(async () => ok(await deps.loadSession()));
      case 'START_SESSION':
        return command({ type: 'START' });
      case 'PAUSE_SESSION':
        return command({ type: 'PAUSE' });
      case 'RESUME_SESSION':
        return command({ type: 'RESUME' });
      case 'STOP_SESSION':
        return command({ type: 'STOP' });
      case 'CLEAR_ERROR':
        return command({ type: 'ERROR_CLEARED' });
      case 'SET_SELECTION':
        return command({ type: 'SELECTION_SET', rel: request.rel, layout: request.layout });
      case 'CLEAR_SELECTION':
        return command({ type: 'SELECTION_CLEARED' });
      case 'CAPTURE_ONCE':
        return captureOnce(request.requestId);
    }
  }

  /** Toolbar icon click: the user's explicit act of authorizing this tab. */
  async function onToolbarClick(tab: TabLike): Promise<void> {
    if (tab.id === undefined || tab.windowId === undefined) return;
    const { id: tabId, windowId } = tab;
    await mutex.run(async () => {
      const origin = isCapturableUrl(tab.url) && tab.url ? originOf(tab.url) : null;
      if (origin === null) {
        await apply({ type: 'AUTHORIZE_REJECTED', code: 'UNCAPTURABLE_PAGE' });
        return;
      }
      await apply({
        type: 'TOOLBAR_CLICKED',
        source: {
          tabId,
          windowId,
          origin,
          title: (tab.title ?? '').slice(0, MAX_TITLE_LENGTH),
          authorizedAt: nowIso(),
        },
      });
    });
  }

  /** Ends the session if the authorized tab navigates to another site or loses access. */
  async function onTabUpdated(
    tabId: number,
    changeInfo: TabChangeInfoLike,
    tab: TabLike,
  ): Promise<void> {
    await mutex.run(async () => {
      const session = await deps.loadSession();
      if (session.status === 'idle' || session.source === null || session.source.tabId !== tabId) return;

      const navigating = changeInfo.url !== undefined || changeInfo.status === 'loading';
      if (!navigating) return;

      const url = changeInfo.url ?? tab.url;
      // Without access Chrome hides the URL: the temporary permission was revoked by navigation.
      if (url === undefined) {
        await apply({ type: 'SOURCE_LOST', code: 'SOURCE_NAVIGATED' });
        return;
      }
      const origin = isCapturableUrl(url) ? originOf(url) : null;
      if (origin === null || origin !== session.source.origin) {
        await apply({ type: 'SOURCE_LOST', code: 'SOURCE_NAVIGATED' });
      }
    });
  }

  async function onTabRemoved(tabId: number): Promise<void> {
    await mutex.run(async () => {
      const session = await deps.loadSession();
      if (session.status === 'idle' || session.source?.tabId !== tabId) return;
      await apply({ type: 'SOURCE_LOST', code: 'SOURCE_CLOSED' });
    });
  }

  /** Closing the side panel pauses an active session, so reopening it never resumes capture silently. */
  async function onPanelClosed(): Promise<void> {
    await mutex.run(async () => {
      await apply({ type: 'PAUSE' }); // rejected (no-op) unless the session is active
    });
  }

  return { handleMessage, onToolbarClick, onTabUpdated, onTabRemoved, onPanelClosed };
}

export type Background = ReturnType<typeof createBackground>;
