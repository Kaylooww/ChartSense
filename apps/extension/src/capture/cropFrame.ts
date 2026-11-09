import { assessImageQuality, type ImageQuality } from '../analysis/imageQuality';
import type { CaptureFrame } from '../types/messages';
import type { ErrorCode, RelRect } from '../types/session';
import { toImagePixels, validateCrop, type PixelRect } from './cropMath';

export interface CropResult {
  /** PNG data URL of the cropped region, at the screenshot's native resolution. Kept in memory only. */
  dataUrl: string;
  px: PixelRect;
  quality: ImageQuality;
  /** ISO 8601 UTC time the source screenshot was captured. */
  capturedAt: string;
}

export type CropOutcome =
  | { ok: true; value: CropResult }
  | { ok: false; code: ErrorCode; detail?: string };

/**
 * Crops the chart region out of a full-tab screenshot, entirely in the browser. The selection is
 * relative (fractions of the frame), so it is mapped onto the screenshot's real pixel size here,
 * which makes it independent of panel width, page zoom and device pixel ratio.
 */
export async function cropFrame(frame: CaptureFrame, rel: RelRect): Promise<CropOutcome> {
  const image = new Image();
  image.src = frame.dataUrl;
  try {
    await image.decode();
  } catch {
    return { ok: false, code: 'IMAGE_DECODE_FAILED' };
  }

  const px = toImagePixels(rel, image.naturalWidth, image.naturalHeight);
  const validation = validateCrop(px, image.naturalWidth, image.naturalHeight);
  if (!validation.ok) return { ok: false, code: 'CROP_INVALID', detail: validation.reason };

  const canvas = document.createElement('canvas');
  canvas.width = px.w;
  canvas.height = px.h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { ok: false, code: 'IMAGE_DECODE_FAILED' };

  context.drawImage(image, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
  const quality = assessImageQuality(context.getImageData(0, 0, px.w, px.h));

  return {
    ok: true,
    value: { dataUrl: canvas.toDataURL('image/png'), px, quality, capturedAt: frame.capturedAt },
  };
}
