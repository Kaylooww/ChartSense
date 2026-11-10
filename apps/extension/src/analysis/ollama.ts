import { z } from 'zod';

/**
 * Optional, free, local vision via Ollama (D-020). The panel talks to Ollama on loopback only; the
 * manifest CSP allows no other network destination. Nothing is sent until the user presses a button,
 * and only the cropped chart (never the full tab screenshot) is sent.
 */
export const OLLAMA_URL = 'http://127.0.0.1:11434';
export const VISION_MODELS = ['qwen3-vl:4b', 'qwen3-vl:2b'] as const;
export type VisionModel = (typeof VISION_MODELS)[number];

/** Fixed vocabulary of visual patterns the model may report; the visual rule only understands these. */
export const VISUAL_PATTERNS = [
  'higher_highs_higher_lows',
  'lower_highs_lower_lows',
  'sideways_range',
  'breakout_above_recent_range',
  'breakdown_below_recent_range',
  'pullback',
  'large_reversal_candle',
] as const;
export type VisualPattern = (typeof VISUAL_PATTERNS)[number];

/** What the model is asked to return. Passed to Ollama as a JSON schema (structured output). */
export const ModelObservationSchema = z.object({
  imageQuality: z.enum(['readable', 'poor', 'unreadable']),
  candlesVisible: z.boolean(),
  visibleTrend: z.enum(['upward_appearance', 'downward_appearance', 'sideways_appearance', 'unclear']),
  patterns: z.array(z.enum(VISUAL_PATTERNS)).max(VISUAL_PATTERNS.length),
  visibleTimeframeLabel: z.string().max(20).nullable(),
  notes: z.array(z.string().max(300)).max(5),
});

export type VisualObservation = z.infer<typeof ModelObservationSchema> & {
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

const PROMPT = [
  'This image is a cropped screenshot of a price chart. Describe only what is visibly shown.',
  'Do not estimate prices, indicator values (EMA, RSI, MACD), times, or future movement. Use no numbers in notes.',
  'If it is not a candlestick or price chart, or it is hard to read, say so with imageQuality and candlesVisible.',
  `patterns: only from [${VISUAL_PATTERNS.join(', ')}], only those clearly visible in the most recent candles; an empty list is fine.`,
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

export async function observeChart(opts: {
  pngBase64: string;
  capturedAt: string;
  model: VisionModel;
  signal: AbortSignal;
  fetchFn?: FetchFn;
  timeoutMs?: number;
  now?: () => Date;
}): Promise<ObserveOutcome> {
  const { pngBase64, capturedAt, model, signal, fetchFn = fetch, timeoutMs = 90_000, now = () => new Date() } = opts;
  const started = now();
  let res: Response;
  try {
    res = await fetchFn(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // First call also loads the model into memory, hence the long timeout.
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      body: JSON.stringify({
        model,
        stream: false,
        format: z.toJSONSchema(ModelObservationSchema),
        options: { temperature: 0 },
        messages: [{ role: 'user', content: PROMPT, images: [pngBase64] }],
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
  const parsed = ModelObservationSchema.safeParse(content);
  if (!parsed.success) return { ok: false, code: 'bad_response', message: 'The model reply did not match the expected fields.' };

  const { kept, dropped } = gateNotes(parsed.data.notes);
  const finished = now();
  return {
    ok: true,
    observation: {
      ...parsed.data,
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
