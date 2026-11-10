# ChartSense training and evaluation workspace

Phase T1 (2026-11-11): dataset creation, annotation validation, splits, baseline evaluation and a
leakage-free rule backtest. **No model has been trained yet**, and nothing here changes what the
extension does. See `finetune/README.md` for the (untested) fine-tuning plan and `reports/` for results.

The model only describes what it sees. BUY / SELL / UP / DOWN / WAIT is decided by the
extension's deterministic rule (`visual-v0.3`), which is evaluated separately. The model is never
trained to output prices, indicator values, confidence scores or trade decisions.

## What the model is asked (and what we label)

The extension asks the local model two questions per snapshot (`apps/extension/src/analysis/ollama.ts`):

1. **Whole crop** (`chart.png`, `PROMPT`, `ModelObservationSchema`): `imageQuality`, `candlesVisible`,
   `visibleTrend`, `structure` (one choice), `completedSetups` (named chart patterns), plus free-text
   `notes` and `visibleTimeframeLabel`.
2. **Newest-candles strip** (`recent.png` = right 30% of the crop, `MOVE_PROMPT`, `LatestMoveSchema`):
   `latestMove` (one choice).

A label (`lib/labels.mts`, `LabelsSchema`) is built from those same schemas: the five judgment fields
of question 1 plus `latestMove`. Notes and the timeframe label are not annotated. Because labels are
derived from the extension's schemas, a label is valid exactly when it is a valid model answer.

## Dataset layout

```
training/data/                 (git-ignored: real screenshots are private, synthetic is regenerable)
  synthetic/<id>/              chart.png, recent.png, example.json  (npm run training:synth)
  real/<id>/                   chart.png, recent.png, example.json  (npm run training:import)
  splits.json                  train / validation / test ids       (npm run training:split)
  sft/{train,validation}.jsonl fine-tuning records                  (npm run training:sft)
training/reports/              evaluation reports (committed)
```

`example.json` (validated by `ExampleSchema`):

| Field | Meaning |
|---|---|
| `id` | Folder name, lowercase `a-z0-9-` |
| `source` | `synthetic` or `user_export` |
| `group` | Chart session. A group never spans two splits |
| `time` | Capture time (synthetic: generation order); orders the chronological split |
| `chartTimeframeSec` | Candle length, or null |
| `labels` | Human-approved only: `null` until a person approves, then `{ imageQuality, candlesVisible, visibleTrend, structure, completedSetups, latestMove }` |
| `reviewStatus`, `reviewedAt`, `reviewNote` | Review state (absent = approved if labeled, else unlabeled) |
| `draft`, `autoLabelError` | Unverified model proposal / last failed auto-label attempt |
| `privacyReviewed` | Must be `true` |

### Synthetic data (labels by construction)

`lib/synth.mts` draws candlestick charts for eight scenarios whose labels are true by construction:
up breakout, down breakdown, uptrend pullback that resumed, downtrend bounce that resumed, top
turning down, bottom turning up, sideways range, and a "no chart" panel. Down scenarios are exact
mirror images of up scenarios, which exposes up/down bias. **Limits:** synthetic charts look nothing
like a real platform (no axes, overlays, avatars or watermarks), never contain named patterns
(flags, triangles...), and some labels are judgment calls (e.g. a bottom turning up is labeled a
downtrend with a "pulled back then turned up" latest move). They test the pipeline and give a
controlled baseline; they cannot show how a model does on real charts.

### Real data (opt-in export from the extension)

1. In the side panel, open **"show screenshot and selection"** and press **Prepare export of this crop**.
2. Check both images (the whole crop and the newest-candles strip, exactly what the model receives),
   tick the privacy box, and click **Save training file**. Only then is a file written, to your Downloads.
   The extension stores nothing and uploads nothing. The file holds the two images, capture time,
   timeframe and a session id: no URL, site, title, account data or labels.
3. `npm run training:import -- path/to/chartsense-training-*.json` unpacks it into `data/real/<id>/`.
4. Open `data/real/<id>/example.json` and replace `"labels": null` with your labels (see the table
   above; allowed values are the enums in `ollama.ts`). Label what is **visible**, and mark a
   pattern only if it has already completed.
5. `npm run training:validate` checks every example and lists the ones still needing labels.

Never add screenshots that show balances, usernames, account IDs or messages.

### Real data (supplied screenshot crops) and the review page

`npm run training:import-crops -- <folder>` imports a crop set in the `ChartSense_Real_Crops_330` layout
(`dataset/source_manifest.json`, `dataset/annotations_unreviewed.jsonl`, `dataset/images/`) into
`data/real/<id>/`, preparing both images exactly as the extension sends them (crop downscaled to
1024 px, newest 30% strip). Labels always start empty: that set's own `LABEL_SCHEMA.json` is an older
schema (`pullback`, `large_reversal_candle`, no `structure` / `latestMove`) and its fields are never
copied. The group is the **instrument**, so the EUR/USD line and candle screenshots (taken a minute
apart) and every overlapping crop of one screenshot stay in one split.

`npm run training:review` (options `-- --annotator <name> --model <ollama model>`) serves a labeling page
on http://127.0.0.1:5210/ showing both images and the allowed values with their definitions.

- **Auto-Label All** (D-031) asks the local Ollama model (default `qwen3-vl:2b-instruct`, editable on the
  page) the extension's two questions for every unlabeled or failed crop, one at a time, and saves the
  answer as a **draft** (`draft` in example.json: labels, timeframe label, notes, warnings, model, time,
  image hash). Progress shows on the page; **Cancel** stops after the current request; retries (0-5)
  cover timeouts and bad answers; a missing model stops the run. Each crop is saved as soon as it is
  done, so pressing the button again resumes. Crops that still fail are marked *failed*.
- A draft is **never** a label. Opening a drafted crop pre-fills the form; check every field, edit, then
  **Approve** (only this writes `labels`) or **Reject / needs correction** with a note. **Clear review**
  goes back to the draft. Filter the list by status: unlabeled, AI-labeled awaiting review, approved,
  rejected, failed.
- Line charts: `candlesVisible` is forced to false in drafts (with a warning) and cannot be approved as
  true. The prompts describe candles, so check quality and latestMove against the line yourself.
- **Export Verified Dataset** writes `data/exports/verified-<time>/` with `labels.jsonl`, `manifest.json`
  and `images/`: approved real crops only, each with its split from a chronological, group-aware split
  (every crop of one instrument/session in the same split), annotator, review time, draft model and
  whether you changed the draft.

Every approval is validated with `LabelsSchema`, and `labels` must be set exactly when the status is
approved. "Copy previous labels" pre-fills the form from your last approval; neighbouring crops end at
different candles, so check each field. When unsure, choose `unclear`, `none` or no setup.

**What the 330 crops are, and are not:** 11 screenshots taken within about two minutes on one day,
8 instruments, 9 candlestick + 2 line charts. They are 330 views of 11 moments, not 330 market
observations. A test split built from them (`npm run training:split -- --source real`, which writes
`splits-real.json`) holds one or two instruments, so per-crop accuracy on it is a pipeline check, not
evidence that a model generalizes. Benchmark with
`npm run training:eval -- --splits splits-real.json --model qwen3-vl:2b-instruct`.

**Missing before any claim of improvement:** independent capture sessions on other days and times;
more instruments per split; a balance of up, down and sideways labels (count them once labeled:
the 2B model's upward bias makes a lopsided test set misleading); completed named patterns (flags, triangles, double tops/bottoms); a chart where the newest
candles are the only move; different zoom levels and candle timeframes (only one crop shows a
printed timeframe); poor or unreadable captures (overlays, open menus, a half-loaded chart); and
synthetic and real data never mixed in one split. Real outcomes (did price go up after the snapshot?)
cannot be labeled from an image and are not part of this data.

## Splits

`npm run training:split` makes a **chronological, group-aware** 70/15/15 split of labeled examples:
whole sessions are assigned in time order, so no session is in two splits and every test example is
newer than every training example. Adding data changes the split, so compare models only on the same
split; each report records a test-set fingerprint.

## Evaluation

`npm run training:eval -- --model <ollama-model> [--split test] [--limit N]` runs each example
through the extension's real `observeChart` (same prompts, schemas, `think: false`, two questions)
and writes `reports/eval-<model>-<split>-<time>.json` with per-example rows and:

- field accuracy for each single-choice field (`structure` and `latestMove` included)
- per-pattern precision and recall, and micro averages
- invalid JSON rate (model answered but not in the schema) and connection error counts
- latency per image (both questions): mean, p50, p95
- rule decision agreement: the `visual-v0.3` decision from the model's answer vs from the gold labels
  (one snapshot, no confirmation), with a confusion table

A run where requests failed to reach the model is marked `-INCOMPLETE` and must not be compared.

## Rule backtest (separate from the model)

`npm run training:backtest -- --csv bars.csv --timeframe 300 --horizon 900 --payout 0.8` walk-forwards
`baseline-v0.1` over historical OHLC bars: at bar *t* the rule sees only bars up to *t* and the time
bar *t* closed; the outcome is judged at bar *t + horizon*; trades do not overlap. `--random-walk 3000`
runs it on a seeded random walk with **no edge**: a hit rate far from 50% there would indicate a bug or
look-ahead. The visual rule cannot be backtested this way until there are labeled screenshot sequences
with known outcomes; until then use the extension's paper-trading journal.

## Commands

| Command | Does |
|---|---|
| `npm run training:synth [-- --seeds 20]` | Regenerate synthetic examples (8 scenarios x seeds) |
| `npm run training:import -- <files>` | Unpack extension training exports into `data/real/` |
| `npm run training:validate` | Validate all examples; list unlabeled ones |
| `npm run training:split` | Write `data/splits.json` |
| `npm run training:eval -- --model <name>` | Evaluate a model on the test split |
| `npm run training:sft` | Write fine-tuning JSONL from train + validation only |
| `npm run training:backtest -- ...` | Leakage-free walk-forward of `baseline-v0.1` |
| `npm run training:typecheck` / `training:test` | Part of `npm run check` |

Scripts run TypeScript directly with Node (type stripping) through `scripts/register.mjs`, which only
adds `.ts` to the extension's extension-less imports. No extra dependencies.
