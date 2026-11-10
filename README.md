# ChartSense

A local-first Chrome side-panel assistant for learning disciplined chart analysis. It looks at a chart tab **you** authorize, helps you crop the chart region, explains whether an UP / DOWN / WAIT setup exists in OHLC bars you import, and (in later phases) records paper trades to see whether any strategy has real, repeatable value.

> **Analysis and simulation only.** ChartSense never places orders, never clicks anything on a trading site, never logs in, and never claims a signal is profitable. Nothing here is financial advice. See [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).

## Status: v0.1.0 (Phases 0 to 2 + live local-AI monitoring)

| Works now | Not built yet |
|---|---|
| Manifest V3 extension with a dark React side panel | Screen interpretation (Phase 3) |
| Toolbar-click tab authorization (`activeTab`) | Paper-trading journal and statistics (Phase 4) |
| Start / Capture once / Pause / Resume / Stop session | Opt-in periodic monitoring (Phase 5) |
| Screenshot of the authorized tab, rate-limited, one at a time | Optional vision service (Phase 6) |
| Draw the chart region; crop is mapped to real screenshot pixels | |
| Re-select prompt when window size or zoom changes | |
| Cropped preview, timestamp, heuristic quality warnings | |
| Error banners with recovery steps | |
| Local synthetic mock chart page | |
| OHLC CSV/JSON import with strict validation | |
| EMA / RSI / MACD and the `baseline-v0.1` rule engine | |
| Result card: UP / DOWN / WAIT / INSUFFICIENT DATA with evidence, reason codes, source, time, horizon, version | |

**Live monitoring** captures the chart tab you authorize every few seconds, sends only the cropped chart to **Ollama on your own PC** (`qwen3-vl:4b`, free), and a fixed rule (`visual-v0.1`) turns the model's visual observations into UP / DOWN / WAIT / INSUFFICIENT DATA. No prices or indicator values are read from pixels and no confidence percentage is shown. Imported OHLC files are still supported, in the **Developer** tab, for testing the indicator rules.

## Tech stack

Chrome Manifest V3 · React 19 · TypeScript (strict) · Tailwind CSS 4 · Vite · Zod · Lucide icons · Vitest · ESLint

## Getting started

Prerequisites: Node.js 20 or newer (22 recommended, see `.nvmrc`) and desktop Google Chrome 116 or newer.

```bash
npm install          # installs the workspace
npm run check        # typecheck + lint + tests + production build
```

### Load the extension

1. `npm run build` (or `npm run dev` to rebuild on every save).
2. Open `chrome://extensions`, switch on **Developer mode**.
3. Click **Load unpacked** and choose `apps/extension/dist`.
4. Optional: pin ChartSense from the puzzle-piece menu so the icon is easy to click.
5. After code changes, press the reload icon on the ChartSense card.

### Try it on the mock chart

```bash
npm run mock-chart   # serves synthetic candles at http://127.0.0.1:5199/
```

1. Open `http://127.0.0.1:5199/` in a Chrome tab.
2. **Click the ChartSense toolbar icon on that tab.** This authorizes the tab and opens the side panel.
3. Read and accept the notice, then press **Start monitoring**.
4. Press **Capture once**. A full screenshot of the tab appears.
5. Drag over the chart (leave the sidebar out) or press **Use full frame**. The cropped preview, size and timestamp appear below.
6. Resize the browser window or change zoom, then **Capture once** again: the old rectangle turns dashed and asks you to select again.
7. Press **Stop**: frames and selection are discarded. Navigating the tab to another site or closing it also ends the session.

### Set up local AI (free, one time)

1. Install Ollama for Windows from <https://ollama.com/download/windows> and run `ollama pull qwen3-vl:4b` (about 3.3 GB; use `qwen3-vl:2b` if 4B is too slow).
2. Allow the extension: in PowerShell, `setx OLLAMA_ORIGINS "chrome-extension://<extension id>"` (the panel's setup steps show your exact id), then quit Ollama from the tray and start it again.
3. In the panel press **Check Ollama**. It should say "Connected · qwen3-vl:4b installed".

Without this, monitoring still runs but every result is INSUFFICIENT DATA with "Not reachable". It never guesses a signal.

### Monitor a chart

1. Open the chart tab, click the ChartSense toolbar icon, accept the notice.
2. In **Live analysis** fill in asset, instrument, chart timeframe and prediction horizon (these are separate; the horizon is never guessed), and choose the interval.
3. Press **Start monitoring**. One screenshot appears: drag over the chart only (leave balances and account details out).
4. ChartSense now recaptures and analyzes at the interval. A new setup first shows WAIT ("waiting for the next snapshot to confirm it"); UP / DOWN appears only if the next snapshot agrees.
5. Press **Pause** or **Stop** (or close the panel) to end it. Resizing or zooming the page asks you to select the region again.

### Try the OHLC rule engine (Developer tab)

1. In the **Developer** tab's OHLC test bench enter an asset label (e.g. `MOCK/USD`), chart timeframe **5m** and a prediction horizon (e.g. **15m**). The horizon is never filled in for you.
2. Choose a file from `fixtures/ohlc/` and press **Analyze bars**. `uptrend-breakout.csv` gives UP, `contradictory-trend.csv` WAIT, the other three INSUFFICIENT DATA. See `fixtures/ohlc/README.md`.
3. Switch the instrument to Conventional: the same UP reads BUY. Change any input and the old result is cleared.

Import format: CSV with header `time,open,high,low,close[,volume]` (or a JSON array of the same objects). `time` is the bar **open** time in ISO 8601 UTC or epoch seconds. Rows must be sorted, unique and exactly one timeframe apart, with at least 150 complete bars.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Watch build into `apps/extension/dist` |
| `npm run build` | Typecheck, then production build |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint (also bans script injection, request interception, cookies, `eval`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | All of the above |
| `npm run mock-chart` | Local synthetic chart page on 127.0.0.1:5199 |

## Project structure

```text
.
├── PROJECT_CONTEXT.md           # source of truth for the product
├── AGENTS.md  RESOURCES.md      # rules for AI coding agents, vetted resource list
├── docs/                        # roadmap, decisions, sources, AI prompts
├── reference/                   # user-supplied trading guide (PDF)
├── fixtures/
│   ├── charts/mock-chart/       # synthetic candlestick page (never real data)
│   └── ohlc/                    # synthetic OHLC fixtures with expected results
└── apps/extension/
    ├── manifest.json  sidepanel.html  vite.config.ts
    ├── public/icons/
    ├── scripts/                 # serve-mock-chart.mjs, gen-ohlc-fixtures.mjs
    ├── src/
    │   ├── background/          # service worker: handlers, session reducer, guards, mutex
    │   ├── sidepanel/           # React app, hooks (session, capture flow, crop)
    │   ├── components/          # UI components
    │   ├── capture/             # crop math, layout detection, PNG size, error copy, cropFrame
    │   ├── analysis/            # image-quality heuristics, Ollama client
    │   ├── storage/             # chrome.storage wrappers
    │   ├── signals/             # OHLC parser, bar validator, indicators, baseline-v0.1, visual-v0.1
    │   ├── types/               # Zod schemas: session, messages, market data
    │   ├── journal/             # empty until Phase 4
    └── tests/
```

## How capture stays safe

- **You authorize each tab** by clicking the toolbar icon (Chrome's temporary `activeTab` grant). The panel's own buttons cannot grant access.
- **You start each session** and take each screenshot; nothing runs in the background.
- Only the tab in front can be captured. A different tab, a cross-site navigation, a closed tab or a lost permission ends or blocks the session with a clear message.
- Screenshots live in the panel's memory only and are cleared on Stop. Nothing is uploaded or written to disk. Only the site's origin and a truncated page title are kept, in session storage.
- The manifest requests only `sidePanel`, `activeTab` and `storage`: no host permissions, no content scripts.

## Known limitations

- **Toolbar click required.** `activeTab` access is temporary. A page reload or navigation usually revokes it, and Chrome reports "permission expired". Click the toolbar icon on the chart tab again, then Start monitoring.
- **Visible tab only.** Chrome captures only the tab in front in its window. If you detach the chart into another window, authorize it there.
- Capture works only on normal `http(s)` pages (and `file://` if you enable file access); Chrome blocks `chrome://` pages and the Web Store.
- The image-quality checks are rough, uncalibrated heuristics.
- Start / Pause / Stop control a session. There is no automatic scanning yet.
- Only desktop Chrome is supported.
- `visual-v0.1` relies on a vision model that can misread charts; its rules are untested hypotheses. Real `qwen3-vl:4b` speed on your GPU is not yet measured; if a cycle takes longer than the interval, monitoring simply slows down.
- `baseline-v0.1` thresholds are untested hypotheses. Imports with session/weekend gaps are rejected. Results describe the bars as of their last bar; there is no live-data staleness check yet. The prediction horizon is recorded but not modelled beyond requiring at least one candle.

### What was verified (2026-11-09)

- `npm run check` passes: typecheck, lint, 110 unit tests, production build.
- Loaded unpacked in Chrome 153 (headless, automated): service worker starts, panel renders with no console errors, onboarding gate works, capture and crop produce the expected pixel region, rate limiting, stale-selection prompt after a window resize, Stop clears frames and selection, and cross-site navigation ends the session. Without a real toolbar click, Chrome denies the capture and the panel shows "Capture permission expired".
- **Not verified automatically:** the real toolbar-icon click granting `activeTab` and opening the side panel (headless Chrome cannot click the toolbar). Please run the "Try it on the mock chart" steps once by hand in a normal Chrome window.

### What was verified for live monitoring (2026-11-10)

- `npm run check` passes: typecheck, lint, 161 unit tests, production build.
- Chrome 156 (headless, DevTools protocol), with `Extensions.triggerAction` standing in for the toolbar click: tab authorized, Start monitoring, region dragged, automatic recapture every 5 s, only the 603x583 crop sent (never the full tab), first snapshot WAIT (awaiting confirmation), second UP, notes with numbers hidden, Ollama stopped mid-run gives INSUFFICIENT DATA "Not reachable", Stop ends the loop and clears frames. This used a **stand-in Ollama server** returning a canned observation.
- Against the real Ollama 0.40.15 on this PC (no model pulled, `OLLAMA_ORIGINS` not set): Ollama returns 403 to the extension, and the panel shows "Not reachable", the setup steps and INSUFFICIENT DATA.
- **Not verified:** a real `qwen3-vl:4b` answer, its latency and VRAM use on the RTX 4060, how often its pattern readings are right, and use on a real trading site.

### What was verified for Phase 2 (2026-11-09)

- `npm run check` passes: typecheck, lint, 138 unit tests (28 new for parsing, validation, indicators and the rule engine), production build.
- Loaded unpacked in Chrome 156 (headless, driven over the DevTools protocol) next to the mock chart page: the panel imported each fixture and showed UP / WAIT / INSUFFICIENT DATA as listed in `fixtures/ohlc/README.md`, listed missing context fields when the form was empty, showed BUY in conventional mode, cleared the result on input change, and logged no console errors or warnings.
- **Not verified:** the Phase 2 card by hand in a normal Chrome window, and keyboard/screen-reader use of the new form.

## AI-assisted development

Initialized from [ProjectTemplate](https://github.com/Kaylooww/ProjectTemplate). See `AGENTS.md`, `RESOURCES.md` and `docs/AI_BUILD_PROMPT.md`.

## Author

[Kaylooww](https://github.com/Kaylooww)
