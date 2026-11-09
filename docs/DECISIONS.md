# Architecture decisions (as implemented)

Record each major decision here and keep `PROJECT_CONTEXT.md` consistent. Newest at the bottom.

## D-001: Plain Vite multi-entry build, not a Chrome-extension Vite plugin
**Decision:** `vite.config.ts` builds two entries (`sidepanel.html`, `src/background/index.ts`), emits `manifest.json`, and keeps the service worker file name fixed (`background.js`).
**Why:** fewer moving parts and no plugin tied to a specific Vite version. **Trade-off:** no hot reload; use `npm run dev` (watch build) and press reload on `chrome://extensions`.

## D-002: npm workspace with a single package
**Decision:** root `package.json` with `workspaces: ["apps/*"]`; only `apps/extension` exists. Root scripts forward to it.
**Why:** matches the target layout and lets `packages/strategy-core` be split out later without moving files.

## D-003: Toolbar click is the authorization step
**Decision:** `chrome.action.onClicked` (a user gesture) grants `activeTab`, records the tab as the *source*, and opens the side panel. There is no `openPanelOnActionClick`.
**Why:** PROJECT_CONTEXT.md section 10 says buttons inside the panel must not be assumed to renew `activeTab`. Only the origin and a truncated title of the tab are stored (never the full URL).

## D-004: Session state in `chrome.storage.session`; screenshots never persisted
**Decision:** the background worker owns the session (pure reducer in `sessionMachine.ts`, persisted in `chrome.storage.session`). Frames live only in the side panel's React state.
**Why:** the MV3 service worker can be stopped at any time; session storage survives that, is cleared on browser exit and is never synced. All writes go through a mutex so concurrent events cannot interleave.

## D-005: Start/Pause/Stop control a capture *session*, not a scan loop
**Decision:** Start = explicit consent for this session; Capture once = one screenshot; periodic scanning is deferred to Phase 5.
**Why:** PROJECT_CONTEXT.md phases periodic monitoring last and requires explicit consent each session.

## D-006: Capture is split into claim / screenshot / finalize
**Decision:** a capture is validated and claimed under the lock, the screenshot is taken outside it, and the result is re-validated under the lock before returning. If the session changed meanwhile (Stop, new tab) the frame is discarded.
**Why:** Stop must stay responsive, overlapping captures must be rejected (not queued), and stale frames must never be shown as current.

## D-007: Layout signature = screenshot pixel size + zoom factor
**Decision:** the stored chart selection is relative (0..1) and carries the frame's pixel size and `tabs.getZoom()` value. A later frame with a different signature marks the selection stale.
**Why:** detects window/side-panel resizes, DPR changes and zoom changes without injecting scripts into the page to read `devicePixelRatio`.

## D-008: PNG size is read from the IHDR header
**Decision:** `capture/pngSize.ts` parses width/height from the first bytes of the data URL instead of decoding the image in the service worker.
**Why:** cheap, testable, and keeps the worker free of DOM image decoding.

## D-009: Zod validates every message and stored session
**Decision:** requests are parsed with `RequestSchema`; stored session state is parsed with `SessionStateSchema` and falls back to an empty session if invalid. The sender must be the extension's own side panel URL.

## D-010: Security rules enforced by tests and lint
**Decision:** ESLint bans `chrome.scripting`, `debugger`, `webRequest`, `declarativeNetRequest`, `cookies`, `webNavigation`, `eval` and `new Function`; `tests/security.test.ts` asserts the manifest permission list and scans `src/` for trading/automation/network patterns.
**Why:** turns PROJECT_CONTEXT.md section 0 rule 4 and the section 10 checklist into failing tests if violated.

## D-011: UI built with plain Tailwind + Lucide icons; no shadcn/ui yet
**Decision:** Phase 1 has a handful of simple components, so no component library was added (RESOURCES.md: "do not install every listed library"). Lucide is used for icons, as RESOURCES.md specifies.
**Revisit:** when Phase 2/4 need forms and tables, adopt shadcn/ui per RESOURCES.md.

## D-012: Image-quality checks are rough heuristics
**Decision:** `analysis/imageQuality.ts` flags only tiny, uniform or very low-detail crops. Thresholds are uncalibrated and the UI says so.

## D-013: Strategy engine is pure TypeScript inside the extension
**Decision:** parsing, validation, indicators and `baseline-v0.1` live in `apps/extension/src/signals/` as pure functions; no `packages/strategy-core` yet and no new dependencies.
**Why:** one consumer so far; PROJECT_CONTEXT.md section 7 says split only when useful.

## D-014: Strict bar validation; any gap means INSUFFICIENT_DATA
**Decision:** `time` is the bar **open** time in UTC. Rows must be sorted, unique and spaced exactly one chart timeframe apart; missing bars, off-grid spacing, bad high/low, non-positive or non-finite prices all return INSUFFICIENT_DATA with the offending row numbers. A last bar whose close time is after "now" is dropped as still forming; an earlier unclosed bar is an error. Minimum 150 complete bars (EMA50 seed + 100-bar warm-up, seed weight under 2%).
**Trade-off:** real exports with weekend or session gaps are rejected. Revisit with an explicit session calendar if imports need it.

## D-015: Analysis is "as of the last bar"; no live staleness gate in Phase 2
**Decision:** results carry `analyzedAt` and `lastBarTime` and say they describe the series as of its last bar, not the live market. Imported history is not rejected for being old.
**Why:** Phase 2 only has imported/synthetic history, which is always "stale" by wall clock; a staleness threshold belongs with live data (Phase 5).

## D-016: Timeframe and horizon are separate inputs; horizon has no default
**Decision:** both are chosen by the user. A horizon shorter than one candle returns WAIT (`HORIZON_SHORTER_THAN_TIMEFRAME`); bars whose spacing does not match the chosen timeframe return INSUFFICIENT_DATA (`TIMEFRAME_MISMATCH`).

## D-017: RSI and MACD can only veto
**Decision:** a candidate needs trend agreement (EMA order + swing structure) **and** a confirmed setup (two closes beyond the 20-bar range, or an EMA20 retest that resumed). RSI (70/30) and MACD histogram sign can only turn it into WAIT. No score or confidence is produced.

## D-018: Demo fixtures are self-labelled
**Decision:** a CSV comment line containing "SYNTHETIC" sets the source to `demo_fixture`; any other file is `imported_ohlc` and the card says its source is not verified. The label can only become more cautious. Imported bars stay in panel memory and are never stored.

## D-019: Still no shadcn/ui
**Decision:** the Phase 2 form is four native inputs and a file input styled with Tailwind; adding shadcn/ui for that was not justified (revisits D-011 again for the Phase 4 journal tables).
