# Ready-to-paste prompts for a coding AI

Always start by reading `PROJECT_CONTEXT.md`, `AGENTS.md`, `docs/IMPLEMENTATION_ROADMAP.md`,
`docs/SOURCES.md` and `docs/DECISIONS.md`. Then paste the prompt for the phase you want.

## Phase 0 + 1 (already implemented in v0.1.0)

> Read the project docs. Implement Phase 0 and Phase 1 only: a working Chrome MV3 extension with
> React/TypeScript/Tailwind, dark side panel, user-authorized visible-tab capture, screenshot preview,
> crop selection, Start/Stop state handling, helpful errors, and a local mock chart test page. Do not
> invent profitable signals and do not implement any broker integration or trade execution. Include a
> README with exact tested setup/run/build/load-unpacked instructions, lint/types/tests, and record any
> browser permission limitation. Do not claim success without actual code and verification. Report files
> changed, commands run, test outcomes and the next step.

## Phase 2: deterministic analysis (next)

> Read the project docs, then implement **Phase 2 only** as described in `docs/IMPLEMENTATION_ROADMAP.md`.
> Build OHLC bar validation, EMA/RSI/MACD indicators checked against hand-computed values, and the
> `baseline-v0.1` rule engine returning UP / DOWN / WAIT / INSUFFICIENT_DATA with evidence, reason codes,
> source type, timestamp, horizon and strategy version. Add synthetic OHLC fixtures covering: clear
> uptrend with confirmed breakout, contradictory trend, too few bars, unsorted/duplicate timestamps and
> invalid high/low. Replace the "Analysis: not built yet" card in the side panel with a structured result
> card and add the chart-context form (asset label, instrument type, chart timeframe and a *separate*
> prediction horizon) plus OHLC file import. Never derive indicator values from a screenshot, never emit a
> confidence percentage, and keep timeframe and horizon distinct. Run `npm run check`, test the unpacked
> extension in Chrome with the mock chart, update the roadmap and `docs/DECISIONS.md`, and report what you
> verified and what you could not.
