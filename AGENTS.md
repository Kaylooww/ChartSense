## Resource Usage

Read `RESOURCES.md` before selecting libraries,
frameworks, animation tools, or visual resources.

When a task requires a listed resource, consult its
official documentation if web access is available.

Do not install every listed library. Only use what
the project actually needs.

## ChartSense Project Rules

Read these in order before proposing or writing code:
`PROJECT_CONTEXT.md` (source of truth), `docs/IMPLEMENTATION_ROADMAP.md`,
`docs/DECISIONS.md`, `docs/SOURCES.md`.

ChartSense is an **analysis-only, simulation-only** Chrome extension. Hard rules:

1. Never place or automate real orders, click trading buttons, log in, deposit or withdraw.
   Never use private APIs, network interception, cookies, session tokens, or anti-bot evasion.
   Do not inject scripts into trading sites. ESLint and `apps/extension/tests/security.test.ts`
   enforce this; do not weaken them.
2. Keep Manifest permissions at `sidePanel`, `activeTab`, `storage`. No host permissions or
   content scripts without an explicit decision recorded in `docs/DECISIONS.md`.
3. Never invent trading precision: no fabricated indicator values from screenshots, no made-up
   confidence or win-rate numbers. Prefer WAIT / INSUFFICIENT_DATA. Keep chart timeframe and
   prediction horizon separate.
4. Label demo, mock and unverified data unmistakably. Never present synthetic data as live.
5. Privacy: screenshots stay in memory, are cropped locally, and are never uploaded or persisted
   without explicit opt-in. Never log image data or secrets.
6. Work phase by phase (see the roadmap). Do not silently expand scope or start a later phase.
7. Before finishing a task run `npm run check` (typecheck, lint, tests, build) from the repo root,
   verify in Chrome when possible, and say plainly what you could not verify.
8. When a major decision changes, update `PROJECT_CONTEXT.md` and `docs/DECISIONS.md`.

Commands (repo root): `npm install`, `npm run dev` (watch build), `npm run build`, `npm test`,
`npm run lint`, `npm run typecheck`, `npm run check`, `npm run mock-chart`.

<!-- graphify-rules-start (managed by `graphify init`) -->
## Use Graphify before grep

This repository is indexed by Graphify: a code graph over its call, dependency, and test structure, exposed through a connected Graphify MCP server. Before reaching for grep or reading files, use the Graphify tools your MCP client lists (their exact names and descriptions are in the server's tool list) for what the graph knows and a text search does not:

- find where a symbol, function, or class is defined (instead of grepping for it)
- understand how something works, or where a behavior is handled
- find who calls a function, or what it calls
- see what a change affects (its blast radius) and which tests cover it
- map a file's dependencies and dependents

Fall back to grep or file reads only for what the graph does not model: literal string or comment matches, non-indexed files, or reading a file you have already located. If no Graphify tools are listed, check the MCP server connection.
<!-- graphify-rules-end -->
