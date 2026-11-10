import { describe, expect, it } from 'vitest';
import { checkOllama, gateNotes, observeChart } from '../src/analysis/ollama';

type Call = { url: string; init?: RequestInit };

/** A stand-in for fetch that records calls and returns a canned response. No network is used. */
function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const reply = (content: unknown) => json({ message: { role: 'assistant', content: JSON.stringify(content) }, done: true });
const imagesOf = (call: Call) => (JSON.parse(String(call.init!.body)) as { messages: { images: string[] }[] }).messages[0]!.images;
/** Answers the whole-chart question with `main` and the newest-candles strip ('BBBB') with `move`. */
const twoStep = (main: unknown, move: unknown = { latestMove: 'pulled_back_then_turned_up' }) =>
  fakeFetch((call) => reply(imagesOf(call)[0] === 'BBBB' ? move : main));

const GOOD = {
  imageQuality: 'readable',
  candlesVisible: true,
  visibleTrend: 'upward_appearance',
  structure: 'higher_highs_higher_lows',
  completedSetups: ['bull_flag_breakout'],
  visibleTimeframeLabel: '5m',
  notes: ['recent candles slope upward', 'price near 1.1050 resistance'],
};

const t0 = new Date('2026-11-10T08:00:00Z');
const t1 = new Date('2026-11-10T08:00:04Z');
const clock = () => {
  const times = [t0, t1];
  return () => times.shift() ?? t1;
};

describe('checkOllama', () => {
  it('reports ready when the model is installed and only calls loopback', async () => {
    const { fn, calls } = fakeFetch(() => json({ models: [{ name: 'qwen3-vl:4b-instruct' }, { name: 'llama3:8b' }] }));
    expect(await checkOllama('qwen3-vl:4b-instruct', fn)).toEqual({ state: 'ready', installed: ['qwen3-vl:4b-instruct', 'llama3:8b'] });
    expect(calls.map((c) => c.url)).toEqual(['http://127.0.0.1:11434/api/tags']);
  });

  it('reports a missing model with what is installed', async () => {
    const { fn } = fakeFetch(() => json({ models: [{ name: 'qwen3-vl:2b-instruct' }] }));
    expect(await checkOllama('qwen3-vl:4b-instruct', fn)).toEqual({ state: 'model_missing', installed: ['qwen3-vl:2b-instruct'] });
  });

  it('reports unreachable when fetch fails (not running, or origin refused by CORS)', async () => {
    const { fn } = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await checkOllama('qwen3-vl:4b-instruct', fn)).toEqual({ state: 'unreachable' });
  });

  it('reports an error for HTTP failures and malformed replies', async () => {
    expect((await checkOllama('qwen3-vl:4b-instruct', fakeFetch(() => json({}, 403)).fn)).state).toBe('error');
    expect((await checkOllama('qwen3-vl:4b-instruct', fakeFetch(() => json({ nope: 1 })).fn)).state).toBe('error');
  });
});

describe('gateNotes', () => {
  it('drops any note containing a digit', () => {
    expect(gateNotes(['looks upward', 'RSI about 70', 'support near 1.10'])).toEqual({ kept: ['looks upward'], dropped: 2 });
  });
});

describe('observeChart', () => {
  const base = { pngBase64: 'AAAA', recentBase64: 'BBBB', capturedAt: '2026-11-10T07:59:58Z', model: 'qwen3-vl:4b-instruct' as const };

  it('asks about the whole crop, then the newest-candles strip, and returns a gated visual-only observation', async () => {
    const { fn, calls } = twoStep(GOOD);
    const out = await observeChart({ ...base, signal: new AbortController().signal, fetchFn: fn, now: clock() });
    expect(calls[0]!.url).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(String(calls[0]!.init!.body)) as Record<string, unknown> & { messages: { images: string[] }[] };
    expect(body.model).toBe('qwen3-vl:4b-instruct');
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false); // thinking builds are far too slow for short horizons
    expect(body.messages[0]!.images).toEqual(['AAAA']);
    expect(body.format).toMatchObject({ type: 'object', required: expect.arrayContaining(['visibleTrend', 'structure', 'completedSetups', 'notes']) });
    expect(calls).toHaveLength(2);
    expect(imagesOf(calls[1]!)).toEqual(['BBBB']);
    expect(JSON.parse(String(calls[1]!.init!.body)).format).toMatchObject({ required: ['latestMove'] });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.observation).toMatchObject({
      source: 'visual_only',
      observationMethod: 'ollama:qwen3-vl:4b-instruct',
      visibleTrend: 'upward_appearance',
      patterns: ['higher_highs_higher_lows', 'pullback_resumed_up', 'bull_flag_breakout'],
      notes: ['recent candles slope upward'],
      droppedNotes: 1,
      reliableNumericOHLC: false,
      capturedAt: base.capturedAt,
      observedAt: t1.toISOString(),
      durationMs: 4000,
    });
    expect(JSON.stringify(out.observation)).not.toMatch(/"[a-z]*(confidence|probability|direction|signal|status)[a-z]*"\s*:/i);
  });

  it('rejects replies that are not JSON or do not match the schema', async () => {
    const notJson = fakeFetch(() => json({ message: { content: 'The chart goes up!' } })).fn;
    const wrong = twoStep({ ...GOOD, visibleTrend: 'BUY NOW', confidence: 0.95 }).fn;
    const unknownPattern = twoStep({ ...GOOD, completedSetups: ['cup_and_handle'] }).fn;
    const badMove = twoStep(GOOD, { latestMove: 'to_the_moon' }).fn;
    for (const fetchFn of [notJson, wrong, unknownPattern, badMove]) {
      const out = await observeChart({ ...base, signal: new AbortController().signal, fetchFn });
      expect(out).toMatchObject({ ok: false, code: 'bad_response' });
    }
  });

  it('adds no pattern when the latest move is none', async () => {
    const out = await observeChart({ ...base, signal: new AbortController().signal, fetchFn: twoStep({ ...GOOD, completedSetups: [] }, { latestMove: 'none' }).fn });
    expect(out.ok && out.observation.patterns).toEqual(['higher_highs_higher_lows']);
  });

  it('maps 404 to model_missing and network failure to unreachable', async () => {
    const missing = await observeChart({ ...base, signal: new AbortController().signal, fetchFn: fakeFetch(() => json({ error: 'model not found' }, 404)).fn });
    expect(missing).toMatchObject({ ok: false, code: 'model_missing' });
    const down = await observeChart({ ...base, signal: new AbortController().signal, fetchFn: fakeFetch(() => Promise.reject(new TypeError('Failed to fetch'))).fn });
    expect(down).toMatchObject({ ok: false, code: 'unreachable' });
  });

  it('distinguishes user cancel from timeout', async () => {
    const hang = fakeFetch(
      (call) =>
        new Promise<Response>((_, reject) => call.init!.signal!.addEventListener('abort', () => reject(call.init!.signal!.reason))),
    ).fn;
    const controller = new AbortController();
    const pending = observeChart({ ...base, signal: controller.signal, fetchFn: hang });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: 'aborted' });
    expect(await observeChart({ ...base, signal: new AbortController().signal, fetchFn: hang, timeoutMs: 20 })).toMatchObject({
      ok: false,
      code: 'timeout',
    });
  });
});
