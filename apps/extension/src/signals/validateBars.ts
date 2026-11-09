import { CandleSchema, type Candle } from '../types/market';

export type BarIssueCode =
  | 'NO_BARS'
  | 'BAD_BAR'
  | 'NON_POSITIVE_PRICE'
  | 'INVALID_HIGH_LOW'
  | 'UNSORTED_TIMESTAMPS'
  | 'DUPLICATE_TIMESTAMPS'
  | 'TIMEFRAME_MISMATCH'
  | 'MISSING_BARS'
  | 'FUTURE_BARS'
  | 'TOO_FEW_BARS';

export type BarIssue = { code: BarIssueCode; message: string };

export type ValidatedBars =
  | { ok: true; bars: Candle[]; formingBarExcluded: boolean }
  | { ok: false; issues: BarIssue[] };

/** Reports at most a few row numbers per issue so a broken file stays readable. */
function rows(indexes: number[]): string {
  const shown = indexes.slice(0, 5).map((i) => i + 1).join(', ');
  return indexes.length > 5 ? `${shown} and ${indexes.length - 5} more` : shown;
}

/**
 * Checks imported bars before any indicator sees them. Every problem is collected (not just the
 * first) so the user can fix the file in one go. `time` is the bar open time; a bar whose close
 * time (open + timeframe) is after `now` is still forming. A forming last bar is dropped; any
 * earlier bar in the future is an error.
 */
export function validateBars(raw: unknown[], timeframeSec: number, minBars: number, now: Date): ValidatedBars {
  if (raw.length === 0) return { ok: false, issues: [{ code: 'NO_BARS', message: 'The file contains no bars.' }] };

  const issues: BarIssue[] = [];
  const bars: Candle[] = [];
  const bad: number[] = [];
  raw.forEach((row, i) => {
    const parsed = CandleSchema.safeParse(row);
    if (parsed.success) bars.push(parsed.data);
    else bad.push(i);
  });
  if (bad.length > 0) {
    issues.push({
      code: 'BAD_BAR',
      message: `Rows ${rows(bad)} are missing a field, have a non-numeric price, or a time that is not ISO 8601 UTC / epoch seconds.`,
    });
    return { ok: false, issues };
  }

  const nonPositive: number[] = [];
  const badRange: number[] = [];
  bars.forEach((b, i) => {
    if (Math.min(b.open, b.high, b.low, b.close) <= 0) nonPositive.push(i);
    if (b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close) || b.high < b.low) badRange.push(i);
  });
  if (nonPositive.length) issues.push({ code: 'NON_POSITIVE_PRICE', message: `Rows ${rows(nonPositive)} have a price of zero or less.` });
  if (badRange.length) {
    issues.push({ code: 'INVALID_HIGH_LOW', message: `Rows ${rows(badRange)} break high >= max(open, close) or low <= min(open, close).` });
  }

  const times = bars.map((b) => Date.parse(b.time));
  const stepMs = timeframeSec * 1000;
  const unsorted: number[] = [];
  const duplicate: number[] = [];
  const offGrid: number[] = [];
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const delta = times[i]! - times[i - 1]!;
    if (delta < 0) unsorted.push(i);
    else if (delta === 0) duplicate.push(i);
    else if (delta % stepMs !== 0) offGrid.push(i);
    else if (delta > stepMs) gaps.push(i);
  }
  if (unsorted.length) issues.push({ code: 'UNSORTED_TIMESTAMPS', message: `Rows ${rows(unsorted)} are earlier than the row before them.` });
  if (duplicate.length) issues.push({ code: 'DUPLICATE_TIMESTAMPS', message: `Rows ${rows(duplicate)} repeat the previous timestamp.` });
  // Out-of-order rows also produce bogus gaps, so only report spacing once the order is right.
  if (offGrid.length && !unsorted.length) {
    issues.push({
      code: 'TIMEFRAME_MISMATCH',
      message: `Rows ${rows(offGrid)} are not spaced in steps of the selected chart timeframe (${timeframeSec}s).`,
    });
  }
  if (gaps.length && !unsorted.length) issues.push({ code: 'MISSING_BARS', message: `Bars are missing before rows ${rows(gaps)}.` });

  const nowMs = now.getTime();
  const future = times.flatMap((t, i) => (t + stepMs > nowMs && i < times.length - 1 ? [i] : []));
  if (future.length) issues.push({ code: 'FUTURE_BARS', message: `Rows ${rows(future)} have not closed yet or are in the future.` });

  if (issues.length) return { ok: false, issues };

  const formingBarExcluded = times[times.length - 1]! + stepMs > nowMs;
  const complete = formingBarExcluded ? bars.slice(0, -1) : bars;
  if (complete.length < minBars) {
    return {
      ok: false,
      issues: [
        {
          code: 'TOO_FEW_BARS',
          message: `${complete.length} complete bars; baseline-v0.1 needs at least ${minBars} for the slow EMA and its warm-up.`,
        },
      ],
    };
  }
  return { ok: true, bars: complete, formingBarExcluded };
}
