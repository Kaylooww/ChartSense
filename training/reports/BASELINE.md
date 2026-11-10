# Baseline before any training (2026-11-11)

All numbers are on **synthetic** charts (labels by construction, see `../README.md`). They show how
the untrained models behave on simple, clean charts; they do not predict performance on a real
trading platform, and they say nothing about whether signals make money.

## Qwen3-VL-2B-Instruct (`qwen3-vl:2b-instruct`, Ollama, think: false)

Test split: 24 examples (3 of each of the 8 scenarios), fingerprint `68b8cce5907a`.
Full report: `eval-qwen3-vl_2b-instruct-test-2026-11-10T16-05-29.json`.

| Metric | Value |
|---|---|
| Answered / invalid JSON | 24 / 24, **0.0%** invalid |
| imageQuality / candlesVisible | 87.5% / 87.5% |
| visibleTrend / structure | 75.0% / 75.0% |
| latestMove | **41.7%** |
| Pattern precision / recall (micro) | 57.1% / 71.8% |
| Rule decision agreement with gold (single snapshot) | **50.0%** |
| Latency per image, both questions | mean 3.5 s, p50 2.8 s, p95 8.3 s |

Per pattern: `higher_highs_higher_lows` P 69% R 100%, `lower_highs_lower_lows` P 82% R 100%,
`breakout_above_recent_range` P 33% R 100%, `breakdown_below_recent_range` P 100% R 33%,
`pullback_resumed_up` P 43% R 100%, `pullback_resumed_down` R 0%, `sideways_range` R 0%,
one false `bull_flag_breakout`.

Decision confusion (gold -> model): UP->UP 6, DOWN->DOWN 1, DOWN->NONE 5, NONE->UP 7, NONE->NONE 5.

**Reading:** the 2B model has a strong **upward bias**. On mirror-image charts it finds upward moves
but misses the matching downward ones, and it reports upward moves where there are none (7 of 24
images turn a no-signal chart into UP). It never recognises a sideways range or a bounce that turned
down. In the extension, the two-snapshot confirmation filters some of this, but the bias would make
UP signals far more frequent than DOWN.

## Qwen3-VL-4B-Instruct

Not measured: the Ollama desktop app shut down during the run (its log shows a normal shutdown, and
the version changed 0.40.15 -> 0.40.16, likely an update), so 22 of 24 requests failed. That run was
discarded. Rerun with `npm run training:eval -- --model qwen3-vl:4b-instruct` once Ollama is running.

## Rule backtest (no model involved)

`baseline-v0.1` walk-forward on a seeded random walk (3,000 bars, 5m candles, 15m horizon, no edge
by construction): 103 non-overlapping trades, 52.4% hit rate vs 55.6% break-even at 80% payout,
-5.8 units. This is consistent with no edge and no look-ahead (a leak would show as an implausibly
high hit rate). It is a sanity check of the harness, not evidence about real markets.

## Real crops, test split (2026-11-11): not a valid accuracy result

`qwen3-vl:2b-instruct` on `splits-real.json` test (30 crops, all USD/BRL from one screenshot, fingerprint
`e6b754855a03`): 100% on every field, 0% invalid JSON, rule decision `NONE -> NONE` on all 30, latency
mean 2.6 s / p95 2.9 s per image. Report: `eval-qwen3-vl_2b-instruct-real-test-2026-11-10T19-22-11.json`.

**This is agreement with itself, not accuracy.** All 330 real labels are the same model's drafts approved
unchanged (`editedFromDraft: false` for every row, approvals about one second apart). The labels have
no downward latest move at all (0 `broke_below_recent_lows`, 0 `bounced_then_turned_down`), matching the
upward bias seen on synthetic data, and the test split is one instrument from one moment. Re-review
the drafts (or label independently) and use independent capture sessions before quoting any accuracy.
The only usable numbers here are the invalid JSON rate and latency.
