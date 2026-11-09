import type { RelRect } from '../types/session';

/** Pixel rectangle. All values are integers when produced by `toImagePixels`. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Smallest crop (in screenshot pixels) the app will accept. Smaller crops are rejected. */
export const MIN_CROP_PX = { w: 120, h: 80 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Turns two drag points (any direction) into a normalized rectangle clamped to the preview. */
export function normalizeDrag(a: Point, b: Point, previewW: number, previewH: number): PixelRect {
  const x0 = clamp(Math.min(a.x, b.x), 0, previewW);
  const y0 = clamp(Math.min(a.y, b.y), 0, previewH);
  const x1 = clamp(Math.max(a.x, b.x), 0, previewW);
  const y1 = clamp(Math.max(a.y, b.y), 0, previewH);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Converts a rectangle in preview (CSS) pixels to fractions of the preview. Because the preview
 * keeps the screenshot's aspect ratio, these fractions are the same fractions of the original
 * screenshot, regardless of panel width, zoom or device pixel ratio.
 * Returns null for an empty or invalid preview/rectangle.
 */
export function toRelative(rect: PixelRect, previewW: number, previewH: number): RelRect | null {
  if (!(previewW > 0) || !(previewH > 0)) return null;
  const x = clamp(rect.x / previewW, 0, 1);
  const y = clamp(rect.y / previewH, 0, 1);
  const w = clamp(rect.w / previewW, 0, 1 - x);
  const h = clamp(rect.h / previewH, 0, 1 - y);
  if (!(w > 0) || !(h > 0)) return null;
  return { x, y, w, h };
}

/**
 * Maps a relative rectangle onto the original screenshot in whole device pixels, clamped to the
 * image. Edges are rounded independently so adjacent regions never overlap or leave gaps.
 */
export function toImagePixels(rel: RelRect, imageW: number, imageH: number): PixelRect {
  const x0 = clamp(Math.round(rel.x * imageW), 0, imageW);
  const y0 = clamp(Math.round(rel.y * imageH), 0, imageH);
  const x1 = clamp(Math.round((rel.x + rel.w) * imageW), 0, imageW);
  const y1 = clamp(Math.round((rel.y + rel.h) * imageH), 0, imageH);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The full frame as a relative rectangle (used by the "Use full frame" shortcut). */
export const FULL_FRAME: RelRect = { x: 0, y: 0, w: 1, h: 1 };

export type CropValidation =
  | { ok: true }
  | { ok: false; reason: 'EMPTY' | 'OUT_OF_BOUNDS' | 'TOO_SMALL' };

export function validateCrop(px: PixelRect, imageW: number, imageH: number): CropValidation {
  if (![px.x, px.y, px.w, px.h].every(Number.isFinite)) return { ok: false, reason: 'OUT_OF_BOUNDS' };
  if (px.w <= 0 || px.h <= 0) return { ok: false, reason: 'EMPTY' };
  if (px.x < 0 || px.y < 0 || px.x + px.w > imageW || px.y + px.h > imageH) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' };
  }
  if (px.w < MIN_CROP_PX.w || px.h < MIN_CROP_PX.h) return { ok: false, reason: 'TOO_SMALL' };
  return { ok: true };
}
