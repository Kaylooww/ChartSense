import { describe, expect, it } from 'vitest';
import { detectLayoutChange } from '../src/capture/layout';

const base = { imageWidth: 1280, imageHeight: 720, zoomFactor: 1 };

describe('detectLayoutChange', () => {
  it('returns null for an identical layout', () => {
    expect(detectLayoutChange(base, { ...base })).toBeNull();
  });

  it('flags a changed screenshot size (window, side panel or DPR change)', () => {
    expect(detectLayoutChange(base, { ...base, imageWidth: 1100 })).toBe('SIZE_CHANGED');
    expect(detectLayoutChange(base, { ...base, imageHeight: 700 })).toBe('SIZE_CHANGED');
    expect(detectLayoutChange(base, { imageWidth: 2560, imageHeight: 1440, zoomFactor: 1 })).toBe('SIZE_CHANGED');
  });

  it('flags a zoom change even when the pixel size is the same', () => {
    expect(detectLayoutChange(base, { ...base, zoomFactor: 1.25 })).toBe('ZOOM_CHANGED');
  });

  it('ignores floating point noise in zoom', () => {
    expect(detectLayoutChange(base, { ...base, zoomFactor: 1.0000001 })).toBeNull();
  });
});
