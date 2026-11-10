import { z } from 'zod';

/**
 * One cropped chart, exported for annotation only when the user asks for it (D-029). Holds the two
 * images exactly as they are sent to the local model (downscaled whole crop + newest-candles strip),
 * the capture time and timeframe, and nothing else: no URL, site, title, account data or labels.
 * The file goes to the user's Downloads via a link they click; nothing is stored or uploaded.
 */
export const TrainingExportSchema = z
  .object({
    format: z.literal('chartsense-training-export'),
    version: z.literal(1),
    id: z.string().regex(/^real-[a-z0-9-]+$/),
    exportedAt: z.iso.datetime(),
    capturedAt: z.iso.datetime(),
    /** Capture session, so screenshots from one session stay in the same split. */
    group: z.string().min(1).max(100),
    chartTimeframeSec: z.number().int().positive().nullable(),
    privacyReviewed: z.literal(true),
    images: z.object({ chart: z.string().min(1), recent: z.string().min(1) }).strict(),
  })
  .strict();
export type TrainingExport = z.infer<typeof TrainingExportSchema>;

const compact = (iso: string) => iso.toLowerCase().replace(/[^0-9t]/g, '');

export function buildTrainingExport(input: {
  chart: string;
  recent: string;
  capturedAt: string;
  sessionStartedAt: string | null;
  chartTimeframeSec: number | null;
  now?: Date;
}): TrainingExport {
  return TrainingExportSchema.parse({
    format: 'chartsense-training-export',
    version: 1,
    id: `real-${compact(input.capturedAt)}`,
    exportedAt: (input.now ?? new Date()).toISOString(),
    capturedAt: input.capturedAt,
    group: `session-${compact(input.sessionStartedAt ?? input.capturedAt)}`,
    chartTimeframeSec: input.chartTimeframeSec,
    privacyReviewed: true,
    images: { chart: input.chart, recent: input.recent },
  });
}
