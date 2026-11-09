import { beforeEach, describe, expect, it } from 'vitest';
import { createBackground, type BackgroundDeps } from '../src/background/handlers';
import { MIN_CAPTURE_INTERVAL_MS } from '../src/background/guards';
import type { Response } from '../src/types/messages';
import { initialSession, type SessionState } from '../src/types/session';
import { fakePngDataUrl } from './helpers';

const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const PANEL = `chrome-extension://${EXT}/sidepanel.html`;
const PANEL_SENDER = { id: EXT, url: PANEL };
const TAB = { id: 7, windowId: 1, url: 'http://127.0.0.1:5199/index.html', title: 'Mock chart' };

interface Harness {
  bg: ReturnType<typeof createBackground>;
  session: () => SessionState;
  setActiveTab: (id: number | undefined) => void;
  advance: (ms: number) => void;
  captureCalls: () => number;
  failNextCapture: (message: string) => void;
  holdCapture: () => { release: () => void };
  send: (message: unknown, sender?: { id?: string; url?: string }) => Promise<Response<unknown>>;
}

function harness(): Harness {
  let session = initialSession();
  let now = 1_000_000;
  let activeTabId: number | undefined = TAB.id;
  let calls = 0;
  let nextFailure: string | null = null;
  let gate: Promise<void> | null = null;

  const deps: BackgroundDeps = {
    extensionId: EXT,
    sidePanelUrl: PANEL,
    nowMs: () => now,
    loadSession: async () => structuredClone(session),
    saveSession: async (s) => {
      session = structuredClone(s);
    },
    getActiveTabId: async () => activeTabId,
    getZoom: async () => 1,
    captureVisibleTab: async () => {
      calls++;
      if (gate) await gate;
      if (nextFailure) {
        const message = nextFailure;
        nextFailure = null;
        throw new Error(message);
      }
      return fakePngDataUrl(1280, 720);
    },
  };

  const bg = createBackground(deps);
  return {
    bg,
    session: () => session,
    setActiveTab: (id) => {
      activeTabId = id;
    },
    advance: (ms) => {
      now += ms;
    },
    captureCalls: () => calls,
    failNextCapture: (message) => {
      nextFailure = message;
    },
    holdCapture: () => {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null;
          resolve();
        };
      });
      return { release };
    },
    send: (message, sender = PANEL_SENDER) => bg.handleMessage(message, sender),
  };
}

async function startedSession(h: Harness) {
  await h.bg.onToolbarClick(TAB);
  const started = await h.send({ type: 'START_SESSION' });
  expect(started.ok).toBe(true);
}

let h: Harness;
beforeEach(() => {
  h = harness();
});

describe('security boundary', () => {
  it('rejects messages from anything but the side panel', async () => {
    await startedSession(h);
    for (const sender of [
      { id: 'someone-else', url: PANEL },
      { id: EXT, url: 'https://broker.example/trade' },
      { url: PANEL },
      {},
    ]) {
      const result = await h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' }, sender);
      expect(result).toMatchObject({ ok: false, error: { code: 'UNTRUSTED_SENDER' } });
    }
    expect(h.captureCalls()).toBe(0);
  });

  it('rejects malformed requests without touching state', async () => {
    const before = h.session();
    for (const bad of [null, 'CAPTURE_ONCE', {}, { type: 'PLACE_ORDER' }, { type: 'CAPTURE_ONCE' }, { type: 'CAPTURE_ONCE', requestId: '' }, { type: 'SET_SELECTION', rel: { x: 2, y: 0, w: 1, h: 1 }, layout: { imageWidth: 1, imageHeight: 1, zoomFactor: 1 } }]) {
      const result = await h.send(bad);
      expect(result).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    }
    expect(h.session()).toEqual(before);
  });

  it('refuses to authorize browser-internal pages', async () => {
    await h.bg.onToolbarClick({ id: 1, windowId: 1, url: 'chrome://extensions', title: 'Extensions' });
    expect(h.session().status).toBe('idle');
    expect(h.session().source).toBeNull();
    expect(h.session().lastError?.code).toBe('UNCAPTURABLE_PAGE');
  });
});

describe('capture permission handling', () => {
  it('cannot capture before the user authorizes a tab', async () => {
    const result = await h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' });
    expect(result).toMatchObject({ ok: false, error: { code: 'NO_SOURCE_TAB' } });
    expect(h.captureCalls()).toBe(0);
  });

  it('cannot capture until Start is pressed', async () => {
    await h.bg.onToolbarClick(TAB);
    const result = await h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' });
    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_NOT_ACTIVE' } });
    expect(h.captureCalls()).toBe(0);
  });

  it('cannot capture while paused', async () => {
    await startedSession(h);
    await h.send({ type: 'PAUSE_SESSION' });
    const result = await h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' });
    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_PAUSED' } });
    expect(h.captureCalls()).toBe(0);
  });

  it('returns a frame with provenance for an active session', async () => {
    await startedSession(h);
    const result = await h.send({ type: 'CAPTURE_ONCE', requestId: 'req-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const frame = result.data as { requestId: string; dataUrl: string; capturedAt: string; layout: unknown };
    expect(frame.requestId).toBe('req-1');
    expect(frame.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(frame.capturedAt).toBe(new Date(1_000_000).toISOString());
    expect(frame.layout).toEqual({ imageWidth: 1280, imageHeight: 720, zoomFactor: 1 });
    expect(h.session().captureCount).toBe(1);
  });

  it('does not capture when the authorized tab is in the background', async () => {
    await startedSession(h);
    h.setActiveTab(99);
    const result = await h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' });
    expect(result).toMatchObject({ ok: false, error: { code: 'TAB_NOT_ACTIVE' } });
    expect(h.captureCalls()).toBe(0);
    // The session itself survives: switching back makes capturing possible again.
    expect(h.session().status).toBe('active');
  });

  it('treats an expired activeTab permission as loss of access and ends the session', async () => {
    await startedSession(h);
    h.failNextCapture("Either the '<all_urls>' or 'activeTab' permission is required.");
    const result = await h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' });
    expect(result).toMatchObject({ ok: false, error: { code: 'PERMISSION_EXPIRED' } });
    expect(h.session().status).toBe('idle');
    expect(h.session().source).toBeNull();
    expect(h.session().lastError?.code).toBe('PERMISSION_EXPIRED');
  });

  it('keeps the session after a non-permission failure', async () => {
    await startedSession(h);
    h.failNextCapture('Something odd happened');
    const result = await h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' });
    expect(result).toMatchObject({ ok: false, error: { code: 'CAPTURE_FAILED' } });
    expect(h.session().status).toBe('active');
  });

  it('rate limits rapid captures', async () => {
    await startedSession(h);
    expect((await h.send({ type: 'CAPTURE_ONCE', requestId: 'a' })).ok).toBe(true);
    h.advance(MIN_CAPTURE_INTERVAL_MS - 1);
    expect(await h.send({ type: 'CAPTURE_ONCE', requestId: 'b' })).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(h.captureCalls()).toBe(1);
    h.advance(1);
    expect((await h.send({ type: 'CAPTURE_ONCE', requestId: 'c' })).ok).toBe(true);
    expect(h.captureCalls()).toBe(2);
  });
});

describe('concurrency and stale results', () => {
  it('rejects a second capture while one is running', async () => {
    await startedSession(h);
    const hold = h.holdCapture();
    const first = h.send({ type: 'CAPTURE_ONCE', requestId: 'first' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await h.send({ type: 'CAPTURE_ONCE', requestId: 'second' });
    expect(second).toMatchObject({ ok: false, error: { code: 'BUSY' } });
    hold.release();
    expect((await first).ok).toBe(true);
    expect(h.captureCalls()).toBe(1);
  });

  it('discards the frame if the user presses Stop while the screenshot is being taken', async () => {
    await startedSession(h);
    const hold = h.holdCapture();
    const pending = h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await h.send({ type: 'STOP_SESSION' });
    hold.release();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_NOT_ACTIVE' } });
    expect(h.session().status).toBe('armed');
    expect(h.session().captureCount).toBe(0);
  });

  it('discards the frame if the session was restarted on another tab meanwhile', async () => {
    await startedSession(h);
    const hold = h.holdCapture();
    const pending = h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await h.bg.onToolbarClick({ id: 42, windowId: 1, url: 'https://other.example/', title: 'Other' });
    hold.release();
    expect(await pending).toMatchObject({ ok: false, error: { code: 'SESSION_NOT_ACTIVE' } });
  });
});

describe('tab events', () => {
  it('ends the session when the authorized tab is closed', async () => {
    await startedSession(h);
    await h.bg.onTabRemoved(TAB.id);
    expect(h.session().status).toBe('idle');
    expect(h.session().lastError?.code).toBe('SOURCE_CLOSED');
  });

  it('ignores other tabs being closed', async () => {
    await startedSession(h);
    await h.bg.onTabRemoved(12345);
    expect(h.session().status).toBe('active');
  });

  it('ends the session when the authorized tab navigates to a different site', async () => {
    await startedSession(h);
    await h.bg.onTabUpdated(TAB.id, { url: 'https://other.example/' }, { url: 'https://other.example/' });
    expect(h.session().status).toBe('idle');
    expect(h.session().source).toBeNull();
    expect(h.session().lastError?.code).toBe('SOURCE_NAVIGATED');
  });

  it('keeps the session for same-site navigation (single-page apps)', async () => {
    await startedSession(h);
    await h.bg.onTabUpdated(TAB.id, { url: 'http://127.0.0.1:5199/other' }, { url: 'http://127.0.0.1:5199/other' });
    expect(h.session().status).toBe('active');
  });

  it('ends the session when a page load starts and Chrome has hidden the URL (access revoked)', async () => {
    await startedSession(h);
    await h.bg.onTabUpdated(TAB.id, { status: 'loading' }, {});
    expect(h.session().status).toBe('idle');
    expect(h.session().lastError?.code).toBe('SOURCE_NAVIGATED');
  });

  it('ignores title/favicon updates and updates on other tabs', async () => {
    await startedSession(h);
    await h.bg.onTabUpdated(TAB.id, {}, { url: TAB.url });
    await h.bg.onTabUpdated(555, { url: 'https://other.example/' }, {});
    expect(h.session().status).toBe('active');
  });
});

describe('selection', () => {
  const layout = { imageWidth: 1280, imageHeight: 720, zoomFactor: 1 };
  const rel = { x: 0.1, y: 0.1, w: 0.6, h: 0.6 };

  it('stores a selection and flags it stale after the page layout changes', async () => {
    await startedSession(h);
    await h.send({ type: 'SET_SELECTION', rel, layout: { ...layout, imageWidth: 1100 } });
    h.advance(MIN_CAPTURE_INTERVAL_MS);
    await h.send({ type: 'CAPTURE_ONCE', requestId: 'r1' }); // mock frame is 1280 wide
    expect(h.session().selectionStale).toBe('SIZE_CHANGED');
  });

  it('rejects a selection when no session is running', async () => {
    await h.bg.onToolbarClick(TAB);
    expect(await h.send({ type: 'SET_SELECTION', rel, layout })).toMatchObject({ ok: false, error: { code: 'INVALID_STATE' } });
  });

  it('Stop discards the selection', async () => {
    await startedSession(h);
    await h.send({ type: 'SET_SELECTION', rel, layout });
    expect(h.session().selection).not.toBeNull();
    await h.send({ type: 'STOP_SESSION' });
    expect(h.session().selection).toBeNull();
  });
});
