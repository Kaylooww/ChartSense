import { z } from 'zod';

/**
 * Error codes shared by the background worker and the side panel.
 * Human-readable text for each code lives in `capture/errors.ts`.
 */
export const ERROR_CODES = [
  'NO_SOURCE_TAB',
  'SESSION_NOT_ACTIVE',
  'SESSION_PAUSED',
  'INVALID_STATE',
  'TAB_NOT_ACTIVE',
  'SOURCE_NAVIGATED',
  'SOURCE_CLOSED',
  'PERMISSION_EXPIRED',
  'UNCAPTURABLE_PAGE',
  'RATE_LIMITED',
  'BUSY',
  'CAPTURE_FAILED',
  'NO_SELECTION',
  'SELECTION_STALE',
  'CROP_INVALID',
  'IMAGE_DECODE_FAILED',
  'BAD_REQUEST',
  'UNTRUSTED_SENDER',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const AppErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().max(500),
  /** ISO 8601 UTC */
  at: z.string(),
});
export type AppError = z.infer<typeof AppErrorSchema>;

/** A rectangle expressed as fractions (0..1) of the captured frame, so it is resolution independent. */
export const RelRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .refine((r) => r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9, {
    message: 'Rectangle extends beyond the frame',
  });
export type RelRect = z.infer<typeof RelRectSchema>;

/**
 * What the page layout looked like when a frame was captured. If any of these change, a stored
 * chart selection can no longer be trusted and the user must select the chart region again.
 */
export const LayoutSignatureSchema = z.object({
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  zoomFactor: z.number().positive(),
});
export type LayoutSignature = z.infer<typeof LayoutSignatureSchema>;

export const StoredSelectionSchema = z.object({
  rel: RelRectSchema,
  layout: LayoutSignatureSchema,
  /** ISO 8601 UTC */
  setAt: z.string(),
});
export type StoredSelection = z.infer<typeof StoredSelectionSchema>;

export const SelectionStaleReasonSchema = z.enum(['SIZE_CHANGED', 'ZOOM_CHANGED']);
export type SelectionStaleReason = z.infer<typeof SelectionStaleReasonSchema>;

/**
 * The tab the user authorized by clicking the toolbar icon. Only the origin and a truncated title
 * are kept (never the full URL).
 */
export const SourceTabSchema = z.object({
  tabId: z.number().int(),
  windowId: z.number().int(),
  origin: z.string().max(300),
  title: z.string().max(120),
  /** ISO 8601 UTC */
  authorizedAt: z.string(),
});
export type SourceTab = z.infer<typeof SourceTabSchema>;

/**
 * idle   - no tab authorized.
 * armed  - a tab is authorized (toolbar click) but no capture session is running.
 * active - the user pressed Start; Capture once is allowed.
 * paused - session kept, captures blocked until Resume.
 */
export const SessionStatusSchema = z.enum(['idle', 'armed', 'active', 'paused']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionStateSchema = z.object({
  version: z.literal(1),
  status: SessionStatusSchema,
  source: SourceTabSchema.nullable(),
  /** ISO 8601 UTC, set when Start is pressed. */
  startedAt: z.string().nullable(),
  captureCount: z.number().int().nonnegative(),
  selection: StoredSelectionSchema.nullable(),
  selectionStale: SelectionStaleReasonSchema.nullable(),
  lastError: AppErrorSchema.nullable(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export function initialSession(): SessionState {
  return {
    version: 1,
    status: 'idle',
    source: null,
    startedAt: null,
    captureCount: 0,
    selection: null,
    selectionStale: null,
    lastError: null,
  };
}
