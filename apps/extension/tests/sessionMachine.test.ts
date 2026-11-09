import { describe, expect, it } from 'vitest';
import { transition, type SessionEvent } from '../src/background/sessionMachine';
import { initialSession, type SessionState, type SourceTab } from '../src/types/session';

const NOW = '2026-11-09T14:35:00.000Z';
const LAYOUT = { imageWidth: 1280, imageHeight: 720, zoomFactor: 1 };
const REL = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };

const source = (overrides: Partial<SourceTab> = {}): SourceTab => ({
  tabId: 7,
  windowId: 1,
  origin: 'http://127.0.0.1:5199',
  title: 'Mock chart',
  authorizedAt: NOW,
  ...overrides,
});

function run(events: SessionEvent[], from: SessionState = initialSession()): SessionState {
  return events.reduce((state, event) => transition(state, event, NOW).state, from);
}

const armed = () => run([{ type: 'TOOLBAR_CLICKED', source: source() }]);
const active = () => run([{ type: 'START' }], armed());

describe('session lifecycle', () => {
  it('starts idle with nothing authorized', () => {
    const s = initialSession();
    expect(s.status).toBe('idle');
    expect(s.source).toBeNull();
  });

  it('toolbar click authorizes a tab but does not start capturing', () => {
    const s = armed();
    expect(s.status).toBe('armed');
    expect(s.source?.tabId).toBe(7);
    expect(s.startedAt).toBeNull();
  });

  it('requires an explicit START before a session is active', () => {
    expect(transition(initialSession(), { type: 'START' }, NOW).accepted).toBe(false);
    const s = active();
    expect(s.status).toBe('active');
    expect(s.startedAt).toBe(NOW);
  });

  it('pauses and resumes only from the right states', () => {
    expect(transition(armed(), { type: 'PAUSE' }, NOW).accepted).toBe(false);
    const paused = run([{ type: 'PAUSE' }], active());
    expect(paused.status).toBe('paused');
    expect(transition(active(), { type: 'RESUME' }, NOW).accepted).toBe(false);
    expect(run([{ type: 'RESUME' }], paused).status).toBe('active');
  });

  it('STOP ends the session, keeps the tab authorized, and discards the selection', () => {
    const withSelection = run(
      [{ type: 'SELECTION_SET', rel: REL, layout: LAYOUT }, { type: 'CAPTURE_SUCCEEDED', layout: LAYOUT }],
      active(),
    );
    expect(withSelection.selection).not.toBeNull();
    const stopped = run([{ type: 'STOP' }], withSelection);
    expect(stopped.status).toBe('armed');
    expect(stopped.source?.tabId).toBe(7);
    expect(stopped.selection).toBeNull();
    expect(stopped.captureCount).toBe(0);
    expect(transition(stopped, { type: 'STOP' }, NOW).accepted).toBe(false);
  });

  it('counts successful captures only while active', () => {
    expect(run([{ type: 'CAPTURE_SUCCEEDED', layout: LAYOUT }], active()).captureCount).toBe(1);
    expect(transition(armed(), { type: 'CAPTURE_SUCCEEDED', layout: LAYOUT }, NOW).accepted).toBe(false);
  });
});

describe('losing the source tab', () => {
  it.each(['SOURCE_NAVIGATED', 'SOURCE_CLOSED', 'PERMISSION_EXPIRED'] as const)(
    '%s forgets the tab, ends the session and records why',
    (code) => {
      const withSelection = run([{ type: 'SELECTION_SET', rel: REL, layout: LAYOUT }], active());
      const lost = run([{ type: 'SOURCE_LOST', code }], withSelection);
      expect(lost.status).toBe('idle');
      expect(lost.source).toBeNull();
      expect(lost.selection).toBeNull();
      expect(lost.lastError?.code).toBe(code);
    },
  );

  it('ignores SOURCE_LOST when nothing is authorized', () => {
    expect(transition(initialSession(), { type: 'SOURCE_LOST', code: 'SOURCE_CLOSED' }, NOW).accepted).toBe(false);
  });
});

describe('authorization is never silently transferred', () => {
  it('clicking the icon on a different tab replaces the source and resets the session', () => {
    const next = run([{ type: 'TOOLBAR_CLICKED', source: source({ tabId: 99, origin: 'https://other.example' }) }], active());
    expect(next.status).toBe('armed');
    expect(next.source?.tabId).toBe(99);
    expect(next.selection).toBeNull();
  });

  it('clicking the icon again on the same tab keeps a running session', () => {
    const refreshed = run([{ type: 'TOOLBAR_CLICKED', source: source({ authorizedAt: '2026-11-09T14:40:00.000Z' }) }], active());
    expect(refreshed.status).toBe('active');
    expect(refreshed.source?.authorizedAt).toBe('2026-11-09T14:40:00.000Z');
  });

  it('same tab id but a different origin counts as a different site', () => {
    const next = run([{ type: 'TOOLBAR_CLICKED', source: source({ origin: 'https://evil.example' }) }], active());
    expect(next.status).toBe('armed');
  });
});

describe('chart selection', () => {
  it('stores a selection with the layout it was drawn on', () => {
    const s = run([{ type: 'SELECTION_SET', rel: REL, layout: LAYOUT }], active());
    expect(s.selection?.rel).toEqual(REL);
    expect(s.selection?.layout).toEqual(LAYOUT);
  });

  it('refuses a selection when no session is running', () => {
    expect(transition(armed(), { type: 'SELECTION_SET', rel: REL, layout: LAYOUT }, NOW).accepted).toBe(false);
  });

  it('marks the selection stale when a later frame has a different layout', () => {
    const s = run(
      [
        { type: 'SELECTION_SET', rel: REL, layout: LAYOUT },
        { type: 'CAPTURE_SUCCEEDED', layout: { ...LAYOUT, imageWidth: 1000 } },
      ],
      active(),
    );
    expect(s.selectionStale).toBe('SIZE_CHANGED');
  });

  it('keeps the selection valid when the layout is unchanged', () => {
    const s = run([{ type: 'SELECTION_SET', rel: REL, layout: LAYOUT }, { type: 'CAPTURE_SUCCEEDED', layout: LAYOUT }], active());
    expect(s.selectionStale).toBeNull();
  });

  it('a new selection clears the stale flag', () => {
    const stale = run(
      [{ type: 'SELECTION_SET', rel: REL, layout: LAYOUT }, { type: 'CAPTURE_SUCCEEDED', layout: { ...LAYOUT, zoomFactor: 1.5 } }],
      active(),
    );
    expect(stale.selectionStale).toBe('ZOOM_CHANGED');
    const fixed = run([{ type: 'SELECTION_SET', rel: REL, layout: { ...LAYOUT, zoomFactor: 1.5 } }], stale);
    expect(fixed.selectionStale).toBeNull();
  });
});

describe('errors', () => {
  it('records and clears the last error', () => {
    const failed = run([{ type: 'CAPTURE_FAILED', code: 'TAB_NOT_ACTIVE' }], active());
    expect(failed.lastError?.code).toBe('TAB_NOT_ACTIVE');
    expect(failed.status).toBe('active');
    expect(run([{ type: 'ERROR_CLEARED' }], failed).lastError).toBeNull();
  });

  it('a successful capture clears an earlier error', () => {
    const s = run([{ type: 'CAPTURE_FAILED', code: 'RATE_LIMITED' }, { type: 'CAPTURE_SUCCEEDED', layout: LAYOUT }], active());
    expect(s.lastError).toBeNull();
  });

  it('rejecting an uncapturable page does not authorize anything', () => {
    const s = run([{ type: 'AUTHORIZE_REJECTED', code: 'UNCAPTURABLE_PAGE' }]);
    expect(s.status).toBe('idle');
    expect(s.source).toBeNull();
    expect(s.lastError?.code).toBe('UNCAPTURABLE_PAGE');
  });
});
