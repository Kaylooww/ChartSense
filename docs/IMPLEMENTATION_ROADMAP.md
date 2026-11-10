# Implementation Roadmap

Phases are sequential and each must be independently demonstrable (see `PROJECT_CONTEXT.md` section 12).
Update the status column and the checklists as work lands. Do not start a phase before the previous
one meets its completion criteria.

| Phase | Deliverable | Status |
|---|---|---|
| 0: Foundation | Vite + React + TypeScript + Tailwind MV3 extension, lint, tests, side panel shell | **Done** (v0.1.0) |
| 1: Capture | Permission-aware screenshot, crop tool, source checks, error UI, mock chart page | **Done** (v0.1.0) |
| 2: Deterministic analysis | OHLC import/validation, tested indicators, structured UP/DOWN/WAIT result | **Done** (v0.1.0) |
| 3: Screen interpretation | Image-quality and label recognition, observation vs OHLC separation | **Done, with local AI** (D-020, D-021) |
| 4: Journal | Paper trades, settlement, P&L, export/import, strategy versions | **Done** (D-023; manual settlement, export only) |
| 5: Opt-in monitoring | Slow periodic capture with stale-data protection | **Done** (D-022, D-025; benchmarked on the owner's RTX 4060) |
| 6: Optional service | Local OpenCV/FastAPI or opt-in vision model | Optional. Vision model already done via Ollama directly (no service); OpenCV only if journal results justify it |

---

## Phase 0: Foundation (done)

- [x] npm workspace (`apps/extension`), Node >= 20.
- [x] Vite multi-entry build: `sidepanel.html` and a non-hashed `background.js` service worker.
- [x] Manifest V3 with only `sidePanel`, `activeTab`, `storage`; strict CSP; no host permissions or content scripts.
- [x] React 19 + TypeScript (strict) + Tailwind CSS 4 dark side panel.
- [x] ESLint (including a ban on `chrome.scripting`, `debugger`, `webRequest`, `cookies`, ...), Vitest, `npm run check`.
- [x] Onboarding / risk notice gate and About tab.

**Completion criteria met:** builds to `apps/extension/dist`, loads unpacked, panel opens with no console errors.

## Phase 1: Capture (done)

- [x] Toolbar icon click = explicit tab authorization (`activeTab`) and opens the side panel.
- [x] Session lifecycle: Start capture / Capture once / Pause / Resume / Stop (pure reducer, unit-tested).
- [x] `captureVisibleTab` in the service worker only when: session active, authorized tab in front, no capture in flight, >= 1 s since the last one.
- [x] Chart-region selector on the captured frame; relative rectangle mapped to real screenshot pixels (DPR/zoom independent).
- [x] Re-selection required when screenshot size or zoom changes.
- [x] Cropped preview with timestamp, size, source type (`visual_only`) and heuristic quality warnings.
- [x] Abort/discard on Stop, tab close, cross-site navigation, lost permission; stale in-flight frames are dropped.
- [x] Error banner with a recovery step for every error code.
- [x] Local synthetic mock chart page (`npm run mock-chart`).
- [x] Tests: crop math, layout detection, PNG header parsing, session reducer, guards, background handlers, manifest/source security scan.

**Known limitations (see README):** Start/Stop control a capture *session*; there is no automatic periodic scanning until Phase 5. The toolbar-click `activeTab` flow can only be fully verified by hand in a normal Chrome window.

## Phase 2: Deterministic analysis (done)

Goal: a verified rule engine on **imported or synthetic OHLC bars**, never on screenshot guesses.

- [x] `types/market.ts`: `Candle`, `DataSource`, `InstrumentType`, `ChartContext`, `AnalysisResult` (Zod schemas, per section 8 of PROJECT_CONTEXT.md).
- [x] `signals/parseOhlc.ts`: CSV/JSON import with size and row caps; ISO 8601 UTC or epoch-second bar open times.
- [x] `signals/validateBars.ts`: finite prices, positive prices, `high >= max(open, close)`, `low <= min(open, close)`, sorted unique timestamps, spacing equal to the chart timeframe (gaps rejected), minimum 150 bars, forming last bar dropped, unclosed earlier bars rejected.
- [x] `signals/indicators.ts`: EMA (SMA seed), Wilder RSI, MACD, tested against hand-computed fractions.
- [x] `signals/baseline.ts` (`baseline-v0.1`): EMA20/EMA50 trend + 10-bar swing structure, 2-close confirmed breakout of the 20-bar range or EMA20 retest, RSI/MACD as veto-only filters, versioned parameters, reason codes. Output UP / DOWN / WAIT / INSUFFICIENT_DATA with evidence, missing fields, assumptions, source type and timestamps. No confidence numbers.
- [x] `fixtures/ohlc/`: synthetic CSVs from `apps/extension/scripts/gen-ohlc-fixtures.mjs` (uptrend + breakout, contradictory trend, too few bars, unsorted/duplicate timestamps, invalid high/low).
- [x] Side panel: chart context form (asset label, instrument type, chart timeframe, **separate** prediction horizon with no default), OHLC file import, structured result card replacing the Phase 1 placeholder. Changing any input clears the old result.
- [x] Tests: indicators, validator, parser, baseline fixtures, mirrored DOWN case, contract (source/timestamp/version/no confidence key), timeframe vs horizon, forming bar.

**Completion criteria met:** fixture bars give a deterministic, explained result; incomplete or invalid bars give INSUFFICIENT_DATA; every result card shows source, analysis time, as-of bar, timeframe, horizon and strategy version. Verified in Chrome 156 (see README).

**Known limitations:** the analysis describes the series as of its last bar; there is no live staleness gate yet (no live feed exists). The horizon is recorded and must be at least one candle, but baseline-v0.1 does not otherwise model it. No volatility/gap-instability filter. Thresholds are hypotheses, not validated settings.

## Phase 3: Screen interpretation (done, with local AI)

On 2026-11-10 the owner asked for live website analysis instead of file uploads, so Phase 3 was built around an optional local vision model (D-020, D-021) instead of hand-written image parsing.

- [x] `analysis/ollama.ts`: connection check, `/api/chat` with a JSON-schema response format, `think: false`, Zod validation, fixed pattern vocabulary, notes with digits hidden, timeout and cancel.
- [x] `signals/visual.ts` (`visual-v0.1`): deterministic rule over visual observations (trend + structure + breakout on two consecutive snapshots), stale-snapshot and horizon checks; WAIT / INSUFFICIENT_DATA otherwise.
- [x] Visual observations kept separate from OHLC: `source: visual_only`, no indicator values, no confidence.
- [x] CSP locked to loopback Ollama; security tests updated (D-020).
- [x] `visual-v0.2`: setups from the stock-trends guide (S9), forced-choice structure, explicit prompt criteria (D-026).
- [x] Latest move asked on a zoomed strip of the newest candles; fixes the model never reporting a setup (D-027).
- [x] `visual-v0.3`: falling wedge and close-not-wick rule from the best-chart-patterns guide (S10); overextended filter rejected as biased (D-028).
- [ ] Measure how often the model's pattern readings are right (use the Phase 4 journal).

## Phase 4: Journal (done)

- [x] `journal/journal.ts`: trade schema, create (UP/DOWN only, expiry = entry + horizon), settle (refused before expiry), stats (hit rate, break-even, net P&L, drawdown, sample warning, groups), CSV export. Unit-tested.
- [x] `hooks/useJournal.ts`: chrome.storage.local, validated on read, corrupt entries kept and reported, not overwritten.
- [x] Monitor tab: stake + payout inputs and "Record paper trade" on UP / DOWN; Journal tab with settle buttons, stats, export, delete.
- [x] Signal tone + flash, collapsed screenshot after selection, `think: false` (D-024).
- [ ] Import of exported journals.
- [ ] Optional: settle from verified prices once an authorized price source exists.

**Verified:** Chrome 156 with a stand-in Ollama: UP signal recorded, OPEN with countdown, settle buttons only after expiry, Won gives 100% hit rate vs 55.6% break-even at 80% payout, +0.80 units.

## Phase 5: Opt-in monitoring (done)

- [x] `hooks/useMonitor.ts`: Start monitoring runs capture -> crop -> model -> rule, one cycle at a time (no overlap, no queue), waits for a region selection, restarts and hides old results when region, context, interval or model change (D-022).
- [x] Back-off: after consecutive model failures the wait doubles up to 60 s; one success resets it (`monitorTiming.ts`, tested).
- [x] Chart tab in the background: cycles are skipped with a clear status, no capture errors.
- [x] Closing the side panel pauses the session; reopening never resumes capture by itself (port + `onPanelClosed`, tested).
- [x] Settings (context, model, interval, sound, stake, payout) saved locally; each bad value falls back on its own.
- [x] Stale data: snapshot older than half the horizon -> WAIT; Stop / navigation / tab close / lost permission end monitoring.
- [x] Signal tone + flash only when a direction appears or flips (alert throttle).
- [x] Benchmark (2026-11-10, owner's RTX 4060, installed `qwen3-vl:4b` with `think: false`): 15 s first answer, then 10 to 11 s; GPU memory peak about 6.1 GB of 8 GB (about 4.8 GB for the model). Default interval stays 10 s; horizons of 30 s or more pass the stale check.
- [ ] Benchmark the `qwen3-vl:4b-instruct` build once pulled.

**Verified in Chrome 156 (automated, stand-in Ollama):** monitoring captures every 5 s, closing the panel turns "Capturing" into "Paused", settings come back after reopening, Stop ends everything.

## Phase 6 (optional)

Only if journal results show the visual signals need better recognition: local OpenCV or a different model. Do not add Supabase or authentication.
