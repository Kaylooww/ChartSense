# OHLC fixtures (SYNTHETIC)

Clearly synthetic 5-minute bars for testing `baseline-v0.1`. **Not market data.** Each file starts
with a `# SYNTHETIC ...` comment, which makes the side panel label it `demo_fixture`.

Regenerate (deterministic): `node apps/extension/scripts/gen-ohlc-fixtures.mjs`

Format: `time,open,high,low,close`; `time` is the bar open time, ISO 8601 UTC.

| File | Bars | Expected result (timeframe 5m, horizon >= 5m) |
|---|---|---|
| `uptrend-breakout.csv` | 200 | UP: `TREND_UP`, `BREAKOUT_CONFIRMED` |
| `contradictory-trend.csv` | 200 | WAIT: `TREND_CONFLICT` (EMA20 > EMA50 but lower highs/lows) |
| `too-few-bars.csv` | 40 | INSUFFICIENT_DATA: `TOO_FEW_BARS` |
| `unsorted-duplicate.csv` | 201 | INSUFFICIENT_DATA: `UNSORTED_TIMESTAMPS`, `DUPLICATE_TIMESTAMPS` |
| `invalid-high-low.csv` | 200 | INSUFFICIENT_DATA: `INVALID_HIGH_LOW` (rows 121, 161) |

These expectations are asserted in `apps/extension/tests/baseline.test.ts`.
