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

## D-020: Optional local vision via Ollama on loopback; network locked to it
**Decision (owner request, 2026-11-10):** the side panel calls Ollama at `http://127.0.0.1:11434` (`qwen3-vl:4b`, or `qwen3-vl:2b` if 4B is too slow). The manifest CSP now has `connect-src 'self' http://127.0.0.1:11434`, so no other network destination is possible, and `tests/security.test.ts` asserts that exact CSP and that the only URL in `src/` is that one. No host permission was added: the user allows the extension in Ollama by setting `OLLAMA_ORIGINS=chrome-extension://<id>`. Only the cropped, downscaled chart is sent. No paid API, no cloud.
**Why:** free and local, as the owner requires; least privilege. **Trade-off:** setup needs one environment variable; until then Ollama answers 403 and the browser reports it as unreachable (verified against Ollama 0.40.15).

## D-021: Screenshot-based signals via the deterministic `visual-v0.1` rule
**Decision (owner request):** live monitoring may show UP / DOWN from screenshots, but the model only reports constrained visual observations (trend appearance, a fixed list of patterns, image quality). `signals/visual.ts`, not the model, decides: UP needs an upward appearance + higher highs/lows + a visible breakout on **two consecutive snapshots of the same region**; DOWN is symmetric. Anything else is WAIT; unreadable charts, model failures and missing context are INSUFFICIENT_DATA; a snapshot older than half the horizon is WAIT. Notes containing digits are hidden, no prices or indicator values are ever derived from pixels, and no confidence is produced. Result `source` is `visual_only`.
**Why:** the owner wants real-time website analysis instead of file uploads. This changes PROJECT_CONTEXT.md FR-03/FR-04, which previously limited screenshots to WAIT / INSUFFICIENT DATA. **Risk:** vision models misread charts; the rule is an uncalibrated hypothesis and must be judged by paper trading (Phase 4).

## D-022: Monitoring is a side-panel loop tied to the session; OHLC import moved to a Developer tab
**Decision:** Start monitoring = start session; the panel then captures, crops, analyzes and waits, one cycle at a time (next start = interval after the previous start, at least 1 s after it ends), so requests never overlap or queue. Pause, Stop, tab navigation/close, lost permission or closing the panel end it; a background tab only skips cycles. A new region, context, interval or model restarts the loop and hides the old result. The loop waits (no recapture) until a region is selected. Default interval 10 s, configurable 5 to 60 s. The Phase 2 OHLC file import is now the **Developer** tab's test bench, not part of monitoring.
**Why:** panel-driven timers stop when the panel closes (no hidden background surveillance) and avoid MV3 service-worker lifetime issues.

## D-023: Paper-trading journal in chrome.storage.local with manual, post-expiry settlement
**Decision:** the user records a paper trade from an UP / DOWN signal (button, never automatic), entering a simulated stake and the payout their platform shows. Expiry = record time + prediction horizon. Settlement is manual (Won / Lost / Tie / Can't verify) and is refused before expiry, so the outcome cannot be entered early. "Can't verify" is UNVERIFIED and excluded from hit rate and P&L. Stats: counts, hit rate, break-even hit rate 1 / (1 + avg payout), net P&L in stake units, max drawdown, per strategy + timeframe/horizon groups, and a sample-size warning under 30 and 200 decided trades. Export as JSON or CSV via a link the user clicks; delete all with confirmation.
**Why:** visual-only signals have no verified price feed, so automatic settlement would mean inventing prices (PROJECT_CONTEXT.md allows manual settlement in the MVP). `chrome.storage.local` instead of IndexedDB: the `storage` permission already exists and a trade is about 1 KB (fine for thousands). **Trade-off:** results are self-reported; no import yet.

## D-024: Faster model answers, signal alerts, collapsed screenshot
**Decision:** requests send `think: false`; the model list prefers `qwen3-vl:4b-instruct` / `qwen3-vl:2b-instruct` and keeps the thinking-build `qwen3-vl:4b` as a fallback (measured 10.5 to 16 s per answer on the owner's RTX 4060 with `think: false`, 23 s without). A new UP / DOWN (first appearance or flip, not every repeat) plays a short locally generated tone (toggle) and flashes the card (skipped with reduced motion). After a region is selected, the screenshot and crop preview collapse into a "show screenshot" section.

## D-025: Monitoring hardening (Phase 5)
**Decision:** (1) The side panel keeps a `chrome.runtime` port open; when it disconnects (panel closed) the background pauses an active session, so reopening the panel never resumes capture silently. The panel reconnects the port if Chrome restarts the service worker. (2) After consecutive model failures the next cycle waits `interval * 2^failures`, capped at 60 s. (3) While the authorized tab is in the background, cycles are skipped with a status message instead of failing captures. (4) Monitor settings are stored in `chrome.storage.local`; each field falls back to its default on its own; loading them never starts monitoring. (5) Default interval stays 10 s, based on the measured 10 to 11 s per answer on the owner's RTX 4060.
**Why:** PROJECT_CONTEXT.md requires no silent restarts after service-worker interruptions, visible and stoppable monitoring, and not hammering an unavailable service.

