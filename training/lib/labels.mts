import { z } from 'zod';
import { LatestMoveSchema, ModelObservationSchema, patternsFrom, type VisualPattern } from '../../apps/extension/src/analysis/ollama.ts';

/**
 * Gold labels for one example. Built from the extension's own two structured-output schemas, so a
 * label is valid exactly when it is a valid model answer: the five judgment fields of the main
 * (whole-chart) schema plus `latestMove` from the newest-candles strip schema. Notes and the
 * timeframe label are not annotated (free text / not used by the rule).
 */
export const LabelsSchema = ModelObservationSchema.pick({
  imageQuality: true,
  candlesVisible: true,
  visibleTrend: true,
  structure: true,
  completedSetups: true,
})
  .extend({ latestMove: LatestMoveSchema.shape.latestMove })
  .strict();
export type Labels = z.infer<typeof LabelsSchema>;

export const REVIEW_STATUSES = ['unlabeled', 'draft', 'approved', 'rejected', 'failed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** A model's proposed annotation, kept apart from `labels` with its provenance. */
export const DraftSchema = z
  .object({
    labels: LabelsSchema,
    /** Free-text fields of the same model answer (not labels, shown to the reviewer). */
    visibleTimeframeLabel: z.string().max(20).nullable(),
    notes: z.array(z.string().max(300)).max(5),
    /** Things the reviewer should check, e.g. a candlestick answer on a line chart that was corrected. */
    warnings: z.array(z.string()),
    model: z.string(),
    createdAt: z.iso.datetime(),
    /** sha256 of chart.png + recent.png the model saw, so a draft is tied to its images. */
    imageSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type Draft = z.infer<typeof DraftSchema>;

export const statusOf = (e: { labels: unknown; reviewStatus?: ReviewStatus }): ReviewStatus => e.reviewStatus ?? (e.labels ? 'approved' : 'unlabeled');

/** One example = a folder with chart.png (whole crop), recent.png (newest-candles strip) and example.json. */
export const ExampleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** user_export: saved from the side panel. user_crop: crops of screenshots the user supplied (training:import-crops). */
    source: z.enum(['synthetic', 'user_export', 'user_crop']),
    /** Examples from the same chart session share a group and are never split across train/val/test. */
    group: z.string().min(1),
    /** Capture time (synthetic: generation order). Orders the chronological split. */
    time: z.iso.datetime(),
    chartTimeframeSec: z.number().int().positive().nullable(),
    /** Synthetic only: how the chart was constructed. */
    scenario: z.string().optional(),
    /** user_crop only: where the crop came from (instrument, chart style, screenshot id). Not shown to the model. */
    origin: z.object({ instrument: z.string(), chartStyle: z.string(), sourceId: z.string() }).strict().optional(),
    /** Human-verified labels only: null until a person approves. Model drafts never go here. */
    labels: LabelsSchema.nullable(),
    annotator: z.string().optional(),
    /** Review state (absent on older files: approved if labeled, else unlabeled; see statusOf). */
    reviewStatus: z.enum(REVIEW_STATUSES).optional(),
    reviewedAt: z.iso.datetime().optional(),
    /** Why a draft was rejected / what needs correcting. */
    reviewNote: z.string().max(500).optional(),
    /** Unverified model proposal (npm run training:review, Auto-Label All). Never used as a label. */
    draft: DraftSchema.optional(),
    /** Last failed auto-label attempt. */
    autoLabelError: z.object({ code: z.string(), message: z.string(), attempts: z.number().int().positive(), model: z.string(), at: z.iso.datetime() }).strict().optional(),
    privacyReviewed: z.literal(true),
  })
  .strict()
  .refine((e) => (e.labels !== null) === (statusOf(e) === 'approved'), { message: 'labels must be set exactly when reviewStatus is approved' });
export type Example = z.infer<typeof ExampleSchema>;

export const goldPatterns = (l: Labels): VisualPattern[] => patternsFrom(l.structure, l.latestMove, l.completedSetups);

/** The model answers exactly as the extension would parse them, for SFT targets. */
export function targetsFor(l: Labels) {
  const main = ModelObservationSchema.parse({
    imageQuality: l.imageQuality,
    candlesVisible: l.candlesVisible,
    visibleTrend: l.visibleTrend,
    structure: l.structure,
    completedSetups: l.completedSetups,
    visibleTimeframeLabel: null,
    notes: [],
  });
  const move = LatestMoveSchema.parse({ latestMove: l.latestMove });
  return { main, move };
}
