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
| 4: Journal | Paper trades, settlement, P&L, export/import, strategy versions | Next |
| 5: Opt-in monitoring | Slow periodic capture with stale-data protection | **Done early** at owner's request (D-022); latency not yet benchmarked on a real model |
| 6: Optional service | Local OpenCV/FastAPI or opt-in vision model | Vision model done via Ollama directly (no service); OpenCV not started |

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

## Live local-AI monitoring (2026-11-10, owner reprioritized)

The owner asked for real-time website analysis instead of file uploads, which pulled Phase 3, the monitoring part of Phase 5 and the vision part of Phase 6 forward.

- [x] `analysis/ollama.ts`: connection check, `/api/chat` with a JSON-schema response format, Zod validation, digit-note gate, timeout and cancel.
- [x] `signals/visual.ts` (`visual-v0.1`): deterministic rule over visual observations, two-snapshot confirmation, stale-snapshot and horizon checks.
- [x] `sidepanel/hooks/useMonitor.ts`: single-flight capture, crop, model, rule loop; waits for region selection; restarts on input change.
- [x] Monitor tab: context form, model and interval, Ollama status and setup steps, last analysis / next capture, detected patterns, result card. OHLC import moved to the Developer tab.
- [x] CSP locked to loopback Ollama; security tests updated.
- [ ] Benchmark real `qwen3-vl:4b` latency and VRAM on the owner's RTX 4060 and tune the default interval.
- [ ] Measure how often the model's pattern readings are right (needs the Phase 4 journal).

## Phases 3 to 6

See `PROJECT_CONTEXT.md` section 12. Do not begin Phase 6, Supabase or authentication until Phases 2 to 5 work.
