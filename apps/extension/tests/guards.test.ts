import { describe, expect, it } from 'vitest';
import {
  checkCaptureAllowed,
  isCapturableUrl,
  isTrustedSender,
  MIN_CAPTURE_INTERVAL_MS,
  originOf,
} from '../src/background/guards';
import { initialSession, type SessionState } from '../src/types/session';

const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const PANEL = `chrome-extension://${EXT}/sidepanel.html`;

describe('isTrustedSender', () => {
  it('accepts the extension side panel', () => {
    expect(isTrustedSender({ id: EXT, url: PANEL }, EXT, PANEL)).toBe(true);
    expect(isTrustedSender({ id: EXT, url: `${PANEL}?x=1` }, EXT, PANEL)).toBe(true);
  });

  it('rejects other extensions, web pages, missing ids and missing urls', () => {
    expect(isTrustedSender({ id: 'other', url: PANEL }, EXT, PANEL)).toBe(false);
    expect(isTrustedSender({ id: EXT, url: 'https://broker.example/trade' }, EXT, PANEL)).toBe(false);
    expect(isTrustedSender({ url: PANEL }, EXT, PANEL)).toBe(false);
    expect(isTrustedSender({ id: EXT }, EXT, PANEL)).toBe(false);
    expect(isTrustedSender({ id: EXT, url: `${PANEL}.evil.html` }, EXT, PANEL)).toBe(false);
    expect(isTrustedSender({ id: '', url: PANEL }, '', PANEL)).toBe(false);
  });
});

describe('isCapturableUrl / originOf', () => {
  it('allows ordinary web pages', () => {
    expect(isCapturableUrl('https://example.com/chart')).toBe(true);
    expect(isCapturableUrl('http://127.0.0.1:5199/')).toBe(true);
    expect(isCapturableUrl('file:///tmp/chart.html')).toBe(true);
  });

  it('blocks browser-internal, store and malformed URLs', () => {
    for (const url of ['chrome://extensions', 'chrome-extension://abc/page.html', 'about:blank', 'devtools://devtools/x', 'view-source:https://a.b', 'javascript:alert(1)', 'data:text/html,hi', 'nonsense', '', undefined]) {
      expect(isCapturableUrl(url)).toBe(false);
    }
  });

  it('returns a stable origin and a fixed label for file pages', () => {
    expect(originOf('https://example.com:8443/a/b?c=d')).toBe('https://example.com:8443');
    expect(originOf('file:///tmp/a.html')).toBe('file://');
    expect(originOf('not a url')).toBeNull();
  });
});

describe('checkCaptureAllowed', () => {
  const source = { tabId: 5, windowId: 1, origin: 'https://a.example', title: 't', authorizedAt: '2026-11-09T00:00:00.000Z' };
  const active: SessionState = { ...initialSession(), status: 'active', source };
  const base = { session: active, activeTabId: 5, captureInFlight: false, nowMs: 10_000, lastCaptureAtMs: 0 };

  it('allows a capture for an active session on the front tab', () => {
    expect(checkCaptureAllowed(base)).toEqual({ ok: true });
  });

  it('blocks when nothing is authorized', () => {
    expect(checkCaptureAllowed({ ...base, session: initialSession() })).toEqual({ ok: false, code: 'NO_SOURCE_TAB' });
  });

  it('blocks when the session has not been started', () => {
    expect(checkCaptureAllowed({ ...base, session: { ...active, status: 'armed' } })).toEqual({ ok: false, code: 'SESSION_NOT_ACTIVE' });
  });

  it('blocks while paused', () => {
    expect(checkCaptureAllowed({ ...base, session: { ...active, status: 'paused' } })).toEqual({ ok: false, code: 'SESSION_PAUSED' });
  });

  it('blocks when the authorized tab is not in front', () => {
    expect(checkCaptureAllowed({ ...base, activeTabId: 99 })).toEqual({ ok: false, code: 'TAB_NOT_ACTIVE' });
    expect(checkCaptureAllowed({ ...base, activeTabId: undefined })).toEqual({ ok: false, code: 'TAB_NOT_ACTIVE' });
  });

  it('blocks overlapping captures', () => {
    expect(checkCaptureAllowed({ ...base, captureInFlight: true })).toEqual({ ok: false, code: 'BUSY' });
  });

  it('rate limits captures to at most one per interval, well under Chrome’s 2/s', () => {
    expect(MIN_CAPTURE_INTERVAL_MS).toBeGreaterThanOrEqual(500);
    expect(checkCaptureAllowed({ ...base, nowMs: 1_000, lastCaptureAtMs: 1_000 - (MIN_CAPTURE_INTERVAL_MS - 1) })).toEqual({ ok: false, code: 'RATE_LIMITED' });
    expect(checkCaptureAllowed({ ...base, nowMs: 5_000, lastCaptureAtMs: 5_000 - MIN_CAPTURE_INTERVAL_MS })).toEqual({ ok: true });
  });
});
