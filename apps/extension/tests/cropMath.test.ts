import { describe, expect, it } from 'vitest';
import {
  FULL_FRAME,
  MIN_CROP_PX,
  normalizeDrag,
  toImagePixels,
  toRelative,
  validateCrop,
} from '../src/capture/cropMath';

describe('normalizeDrag', () => {
  it('handles drags in any direction', () => {
    const forward = normalizeDrag({ x: 10, y: 20 }, { x: 110, y: 70 }, 400, 300);
    const backward = normalizeDrag({ x: 110, y: 70 }, { x: 10, y: 20 }, 400, 300);
    expect(forward).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    expect(backward).toEqual(forward);
  });

  it('clamps points that leave the preview', () => {
    expect(normalizeDrag({ x: -50, y: -10 }, { x: 500, y: 400 }, 400, 300)).toEqual({
      x: 0,
      y: 0,
      w: 400,
      h: 300,
    });
  });
});

describe('toRelative', () => {
  it('converts preview pixels to fractions', () => {
    expect(toRelative({ x: 100, y: 50, w: 200, h: 100 }, 400, 200)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('clamps width/height so the rectangle never leaves the frame', () => {
    const rel = toRelative({ x: 300, y: 150, w: 500, h: 500 }, 400, 200);
    expect(rel).toEqual({ x: 0.75, y: 0.75, w: 0.25, h: 0.25 });
  });

  it('rejects empty rectangles and empty previews', () => {
    expect(toRelative({ x: 10, y: 10, w: 0, h: 50 }, 400, 200)).toBeNull();
    expect(toRelative({ x: 10, y: 10, w: 50, h: 50 }, 0, 200)).toBeNull();
    expect(toRelative({ x: 10, y: 10, w: 50, h: 50 }, 400, Number.NaN)).toBeNull();
  });
});

describe('toImagePixels (zoom and device pixel ratio)', () => {
  const rel = { x: 0.25, y: 0.1, w: 0.5, h: 0.6 };

  it('maps the same relative region to the same area at 1x and 2x resolution', () => {
    const at1x = toImagePixels(rel, 1000, 500);
    const at2x = toImagePixels(rel, 2000, 1000);
    expect(at1x).toEqual({ x: 250, y: 50, w: 500, h: 300 });
    expect(at2x).toEqual({ x: 500, y: 100, w: 1000, h: 600 });
  });

  it('stays independent of how large the preview was drawn', () => {
    const fromSmallPreview = toRelative({ x: 50, y: 10, w: 100, h: 60 }, 200, 100)!;
    const fromLargePreview = toRelative({ x: 150, y: 30, w: 300, h: 180 }, 600, 300)!;
    expect(fromSmallPreview).toEqual(fromLargePreview);
    expect(toImagePixels(fromSmallPreview, 1920, 960)).toEqual(toImagePixels(fromLargePreview, 1920, 960));
  });

  it('returns whole pixels and never exceeds the image', () => {
    const px = toImagePixels({ x: 0.333, y: 0.333, w: 0.667, h: 0.667 }, 1001, 777);
    expect(Number.isInteger(px.x) && Number.isInteger(px.y) && Number.isInteger(px.w) && Number.isInteger(px.h)).toBe(true);
    expect(px.x + px.w).toBeLessThanOrEqual(1001);
    expect(px.y + px.h).toBeLessThanOrEqual(777);
  });

  it('covers the whole image for the full-frame rectangle', () => {
    expect(toImagePixels(FULL_FRAME, 1366, 768)).toEqual({ x: 0, y: 0, w: 1366, h: 768 });
  });
});

describe('validateCrop', () => {
  const ok = { x: 0, y: 0, w: MIN_CROP_PX.w, h: MIN_CROP_PX.h };

  it('accepts a crop at the minimum size', () => {
    expect(validateCrop(ok, 1000, 500)).toEqual({ ok: true });
  });

  it('rejects empty crops', () => {
    expect(validateCrop({ ...ok, w: 0 }, 1000, 500)).toEqual({ ok: false, reason: 'EMPTY' });
    expect(validateCrop({ ...ok, h: -4 }, 1000, 500)).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('rejects out-of-bounds and non-finite crops', () => {
    expect(validateCrop({ ...ok, x: 950 }, 1000, 500)).toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' });
    expect(validateCrop({ ...ok, y: -1 }, 1000, 500)).toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' });
    expect(validateCrop({ ...ok, w: Number.NaN }, 1000, 500)).toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' });
  });

  it('rejects crops smaller than the minimum', () => {
    expect(validateCrop({ ...ok, w: MIN_CROP_PX.w - 1 }, 1000, 500)).toEqual({ ok: false, reason: 'TOO_SMALL' });
    expect(validateCrop({ ...ok, h: MIN_CROP_PX.h - 1 }, 1000, 500)).toEqual({ ok: false, reason: 'TOO_SMALL' });
  });
});
