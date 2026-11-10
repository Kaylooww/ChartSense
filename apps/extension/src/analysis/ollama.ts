import { z } from 'zod';

/**
 * Optional, free, local vision via Ollama (D-020). The panel talks to Ollama on loopback only; the
 * manifest CSP allows no other network destination. Nothing is sent until the user presses a button,
 * and only the cropped chart (never the full tab screenshot) is sent.
 */
export const OLLAMA_URL = 'http://127.0.0.1:11434';
// Instruct builds answer fastest; the default `qwen3-vl:4b` tag is a thinking build (works with think: false, slower).
export const VISION_MODELS = ['qwen3-vl:4b-instruct', 'qwen3-vl:2b-instruct', 'qwen3-vl:4b'] as const;
export type VisionModel = (typeof VISION_MODELS)[number];

/**
 * Fixed vocabulary of visual patterns the model may report; the visual rule only understands these.
 * Definitions follow reference/stock_trends_buy_sell_guide.pdf (S9) and best_chart_patterns_trading_guide.pdf (S10). Pattern names ending in
 * _breakout / _breakdown mean the pattern has COMPLETED (price already broke its neckline or
 * boundary): the guide says a pattern is not a signal before that.
 */
export const PATTERN_DEFINITIONS = {
  higher_highs_higher_lows: 'recent swings make higher highs and higher lows (uptrend structure)',
  lower_highs_lower_lows: 'recent swings make lower highs and lower lows (downtrend structure)',
  sideways_range: 'price moves between a flat support floor and resistance ceiling',
  breakout_above_recent_range: 'the latest candles closed above the recent resistance or range top',
  breakdown_below_recent_range: 'the latest candles closed below the recent support or range bottom',
  pullback_resumed_up: 'in an uptrend, price dipped to support or the trend line, then the latest candles turned back up',
  pullback_resumed_down: 'in a downtrend, price bounced to resistance or the trend line, then the latest candles turned back down',
  double_bottom_breakout: 'two roughly equal lows, and price has now broken above the peak between them',
  double_top_breakdown: 'two roughly equal highs, and price has now broken below the dip between them',
  inverse_head_shoulders_breakout: 'three troughs with the middle lowest, and price has now broken above the neckline',
  head_shoulders_breakdown: 'three peaks with the middle highest, and price has now broken below the neckline',
  ascending_triangle_breakout: 'flat resistance with rising lows, and price has now closed above the resistance',
  descending_triangle_breakdown: 'flat support with falling highs, and price has now closed below the support',
  bull_flag_breakout: 'a sharp rise, a small downward or sideways pause, and price has now broken above the pause',
  bear_flag_breakdown: 'a sharp fall, a small upward or sideways pause, and price has now broken below the pause',
  cup_handle_breakout: 'a rounded base, a small pullback (handle), and price has now broken above the handle',
  falling_wedge_breakout: 'two downward-sloping lines that converge, and price has now closed above the upper line',
} as const;
export const VISUAL_PATTERNS = Object.keys(PATTERN_DEFINITIONS) as (keyof typeof PATTERN_DEFINITIONS)[];
export type VisualPattern = keyof typeof PATTERN_DEFINITIONS;
const STRUCTURES = ['higher_highs_higher_lows', 'lower_highs_lower_lows', 'sideways_range'] as const satisfies readonly VisualPattern[];
/** The latest move, asked as a required single choice and mapped onto the setup patterns. */
const LATEST_MOVES = {
  broke_above_recent_highs: 'breakout_above_recent_range',
  broke_below_recent_lows: 'breakdown_below_recent_range',
  pulled_back_then_turned_up: 'pullback_resumed_up',
  bounced_then_turned_down: 'pullback_resumed_down',
} as const satisfies Record<string, VisualPattern>;
const MOVE_PATTERNS: readonly string[] = Object.values(LATEST_MOVES);
const NON_PATTERN = [...STRUCTURES, ...MOVE_PATTERNS] as readonly string[];
/** Named chart patterns (flags, triangles, double tops...) left for the optional list. */
export const SETUP_PATTERNS = VISUAL_PATTERNS.filter((p) => !NON_PATTERN.includes(p));

/**
 * What the model is asked to return. Passed to Ollama as a JSON schema (structured output).
 * Structure and the latest move are required single choices: small models left optional lists
 * empty even on a clear uptrend, but answer a forced choice reliably (measured 2026-11-10, D-026, D-027).
 */
export const ModelObservationSchema = z.object({
  imageQuality: z.enum(['readable', 'poor', 'unreadable']),
  candlesVisible: z.boolean(),
  visibleTrend: z.enum(['upward_appearance', 'downward_appearance', 'sideways_appearance', 'unclear']),
  structure: z.enum([...STRUCTURES, 'unclear']),
  completedSetups: z.array(z.enum(SETUP_PATTERNS as [VisualPattern, ...VisualPattern[]])).max(SETUP_PATTERNS.length),
  visibleTimeframeLabel: z.string().max(20).nullable(),
  notes: z.array(z.string().max(300)).max(5),
});

/**
 * Second question, asked on a zoomed strip of only the newest candles: on the whole chart the model
 * just repeated the overall trend; on the strip it judged the latest move correctly (D-027).
 */
export const LatestMoveSchema = z.object({ latestMove: z.enum([...(Object.keys(LATEST_MOVES) as (keyof typeof LATEST_MOVES)[]), 'none']) });

export const MOVE_PROMPT = [
  'This image shows only the most recent candles at the right edge of a candlestick chart. Compare the last three candles with the candles before them.',
  'latestMove, choose exactly one:',
  // Guide S10: a break counts only with a candle close, not a brief wick.
  '- broke_above_recent_highs: a candle CLOSED (its body, not just a wick) above all earlier highs in this image',
  '- broke_below_recent_lows: a candle CLOSED (its body, not just a wick) below all earlier lows in this image',
  '- pulled_back_then_turned_up: price dipped and the last candles turned back up',
  '- bounced_then_turned_down: price rose briefly and the last candles turned back down',
  '- none: sideways, mixed, or not clear',
  'Ignore watermarks, labels and overlays. Reply only with JSON.',
].join('\n');

export type VisualObservation = Omit<z.infer<typeof ModelObservationSchema>, 'structure' | 'completedSetups'> & {
  /** Structure, latest move and completed setups, as one list for the visual rule. */
  patterns: VisualPattern[];
  source: 'visual_only';
  observationMethod: string;
  /** When the screenshot behind the crop was taken, ISO 8601 UTC. */
  capturedAt: string;
  observedAt: string;
  durationMs: number;
  /** Notes removed because they contained numbers the model cannot read reliably from pixels. */
  droppedNotes: number;
  reliableNumericOHLC: false;
  limitations: string[];
};

export type OllamaStatus =
  | { state: 'unreachable' } // not running, or Ollama refuses this extension's origin (the browser cannot tell which)
  | { state: 'model_missing'; installed: string[] }
  | { state: 'ready'; installed: string[] }
  | { state: 'error'; message: string };

export type ObserveOutcome =
  | { ok: true; observation: VisualObservation }
  | { ok: false; code: 'unreachable' | 'model_missing' | 'timeout' | 'aborted' | 'bad_response'; message: string };

type FetchFn = typeof fetch;

/** Exported so the training pipeline uses exactly what the extension sends (training/README.md). */
export const PROMPT = [
  'This image is a cropped screenshot of a candlestick price chart. Describe only what is visibly shown.',
  'Do not estimate prices, indicator values (EMA, RSI, MACD), times, or future movement. Use no numbers in notes.',
  // Explicit criteria: without them the model rated clean charts "poor" and everything "unclear" (D-026).
  'imageQuality: readable if individual candles can be told apart; poor only if blurry, tiny or mostly covered; unreadable if there is no chart.',
  'candlesVisible: true if candlesticks or price bars are visible.',
  'visibleTrend: the direction of the most recent part of the chart: upward_appearance, downward_appearance, sideways_appearance, or unclear.',
  'Ignore watermarks, labels and overlays; judge the candles. Look at the swing highs and swing lows of the most recent candles.',
  'structure: choose exactly one:',
  ...STRUCTURES.map((name) => `- ${name}: ${PATTERN_DEFINITIONS[name]}`),
  '- unclear: none of these clearly applies',
  'completedSetups: named chart patterns that have ALREADY completed in the latest candles; if a pattern is still forming, do not list it; an empty list is fine:',
  ...SETUP_PATTERNS.map((name) => `- ${name}: ${PATTERN_DEFINITIONS[name]}`),
  'visibleTimeframeLabel: the candle timeframe label exactly as printed on the image, or null if none is clearly legible.',
  'Reply only with JSON that matches the schema.',
].join('\n');

export async function checkOllama(model: VisionModel, fetchFn: FetchFn = fetch, timeoutMs = 3000): Promise<OllamaStatus> {
  let res: Response;
  try {
    res = await fetchFn(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { state: 'unreachable' };
  }
  if (!res.ok) return { state: 'error', message: `Ollama answered HTTP ${res.status}.` };
  const parsed = z.object({ models: z.array(z.object({ name: z.string() })) }).safeParse(await res.json().catch(() => null));
  if (!parsed.success) return { state: 'error', message: 'Unexpected reply from /api/tags.' };
  const installed = parsed.data.models.map((m) => m.name);
  return installed.includes(model) ? { state: 'ready', installed } : { state: 'model_missing', installed };
}

/** Removes any note with a digit: the model may not invent prices or indicator values. */
export function gateNotes(notes: string[]): { kept: string[]; dropped: number } {
  const kept = notes.filter((n) => !/\d/.test(n));
  return { kept, dropped: notes.length - kept.length };
}

/** Structure, latest move and named setups as one de-duplicated list (shared with the training metrics). */
export function patternsFrom(
  structure: z.infer<typeof ModelObservationSchema>['structure'],
  latestMove: z.infer<typeof LatestMoveSchema>['latestMove'],
  completedSetups: VisualPattern[],
): VisualPattern[] {
  return [
    ...new Set<VisualPattern>([
      ...(structure === 'unclear' ? [] : [structure]),
      ...(latestMove === 'none' ? [] : [LATEST_MOVES[latestMove]]),
      ...completedSetups,
    ]),
  ];
}

type Chat<T> = { ok: true; data: T } | Extract<ObserveOutcome, { ok: false }>;

/** One structured-output request to Ollama, validated with `schema`. */
async function chat<T>(
  opts: { model: VisionModel; signal: AbortSignal; fetchFn: FetchFn; timeoutMs: number },
  schema: z.ZodType<T>,
  prompt: string,
  image: string,
): Promise<Chat<T>> {
  const { model, signal, fetchFn, timeoutMs } = opts;
  let res: Response;
  try {
    res = await fetchFn(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // First call also loads the model into memory, hence the long timeout.
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      body: JSON.stringify({
        model,
        think: false,
        stream: false,
        format: z.toJSONSchema(schema),
        options: { temperature: 0 },
        messages: [{ role: 'user', content: prompt, images: [image] }],
      }),
    });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'TimeoutError') return { ok: false, code: 'timeout', message: `No answer within ${timeoutMs / 1000}s.` };
    if (name === 'AbortError') return { ok: false, code: 'aborted', message: 'Cancelled.' };
    return { ok: false, code: 'unreachable', message: 'Could not reach Ollama.' };
  }
  if (res.status === 404) return { ok: false, code: 'model_missing', message: `Model ${model} is not installed.` };
  if (!res.ok) return { ok: false, code: 'bad_response', message: `Ollama answered HTTP ${res.status}.` };

  let content: unknown;
  try {
    const body = (await res.json()) as { message?: { content?: unknown } };
    content = JSON.parse(String(body.message?.content));
  } catch {
    return { ok: false, code: 'bad_response', message: 'The model did not return valid JSON.' };
  }
  const parsed = schema.safeParse(content);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: 'bad_response', message: 'The model reply did not match the expected fields.' };
}

/**
 * Two questions per snapshot: the whole crop (quality, trend, structure, named patterns), then a
 * zoomed strip of the newest candles (latest move). Both must succeed.
 */
export async function observeChart(opts: {
  pngBase64: string;
  /** Zoomed right-edge strip of the same crop: the newest candles. */
  recentBase64: string;
  capturedAt: string;
  model: VisionModel;
  signal: AbortSignal;
  fetchFn?: FetchFn;
  timeoutMs?: number;
  now?: () => Date;
}): Promise<ObserveOutcome> {
  const { pngBase64, recentBase64, capturedAt, model, signal, fetchFn = fetch, timeoutMs = 90_000, now = () => new Date() } = opts;
  const started = now();
  const req = { model, signal, fetchFn, timeoutMs };
  const main = await chat(req, ModelObservationSchema, PROMPT, pngBase64);
  if (!main.ok) return main;
  const move = await chat(req, LatestMoveSchema, MOVE_PROMPT, recentBase64);
  if (!move.ok) return move;

  const { structure, completedSetups, ...seen } = main.data;
  const patterns = patternsFrom(structure, move.data.latestMove, completedSetups);
  const { kept, dropped } = gateNotes(seen.notes);
  const finished = now();
  return {
    ok: true,
    observation: {
      ...seen,
      patterns,
      notes: kept,
      droppedNotes: dropped,
      source: 'visual_only',
      observationMethod: `ollama:${model}`,
      capturedAt,
      observedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      reliableNumericOHLC: false,
      limitations: [
        'Visual description by a local model; it can misread charts.',
        'No prices, candle values or indicators were taken from the image.',
        'Patterns are visual estimates; the visual rule, not the model, decides UP / DOWN / WAIT.',
      ],
    },
  };
}
