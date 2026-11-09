import { z } from 'zod';
import {
  LayoutSignatureSchema,
  RelRectSchema,
  type ErrorCode,
  type LayoutSignature,
} from './session';

/** Requests the side panel may send to the background service worker. Validated with Zod on receipt. */
export const RequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GET_SESSION') }),
  z.object({ type: z.literal('START_SESSION') }),
  z.object({ type: z.literal('PAUSE_SESSION') }),
  z.object({ type: z.literal('RESUME_SESSION') }),
  z.object({ type: z.literal('STOP_SESSION') }),
  z.object({ type: z.literal('CLEAR_ERROR') }),
  z.object({ type: z.literal('CAPTURE_ONCE'), requestId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('SET_SELECTION'),
    rel: RelRectSchema,
    layout: LayoutSignatureSchema,
  }),
  z.object({ type: z.literal('CLEAR_SELECTION') }),
]);
export type Request = z.infer<typeof RequestSchema>;

export interface CaptureFrame {
  /** Echo of the request id so the panel can discard stale responses. */
  requestId: string;
  /** PNG data URL of the whole visible tab. Held in memory only; never persisted. */
  dataUrl: string;
  /** ISO 8601 UTC */
  capturedAt: string;
  layout: LayoutSignature;
}

export type Failure = { code: ErrorCode; message: string };
export type Response<T> = { ok: true; data: T } | { ok: false; error: Failure };

export function ok<T>(data: T): Response<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string): { ok: false; error: Failure } {
  return { ok: false, error: { code, message } };
}
