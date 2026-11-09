import { MIN_CROP_PX } from '../capture/cropMath';

/** Minimal shape of the browser's `ImageData`, so this module is testable without a DOM. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type QualityWarningCode = 'TOO_SMALL' | 'LOW_CONTRAST' | 'LOW_DETAIL';

export interface QualityWarning {
  code: QualityWarningCode;
  message: string;
}

export interface ImageStats {
  meanLuma: number;
  lumaStdDev: number;
  /** Variance of a 4-neighbour Laplacian over luma; a rough sharpness/detail measure. */
  edgeVariance: number;
}

export interface ImageQuality {
  stats: ImageStats;
  warnings: QualityWarning[];
}

/**
 * Heuristic thresholds. These are NOT calibrated against real broker charts; they only catch
 * obviously bad crops (blank, uniform, tiny). Passing every check does not mean the chart is
 * readable, and the UI says so.
 */
export const QUALITY_THRESHOLDS = {
  minLumaStdDev: 6,
  minEdgeVariance: 12,
} as const;

function lumaOf(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
}

export function computeStats(img: RgbaImage): ImageStats {
  const { data, width, height } = img;
  const n = width * height;
  if (n === 0 || data.length < n * 4) return { meanLuma: 0, lumaStdDev: 0, edgeVariance: 0 };

  const luma = new Float32Array(n);
  let sum = 0;
  for (let p = 0; p < n; p++) {
    const l = lumaOf(data, p * 4);
    luma[p] = l;
    sum += l;
  }
  const mean = sum / n;

  let sq = 0;
  for (let p = 0; p < n; p++) {
    const d = luma[p]! - mean;
    sq += d * d;
  }
  const lumaStdDev = Math.sqrt(sq / n);

  let edgeVariance = 0;
  if (width >= 3 && height >= 3) {
    let lapSum = 0;
    let lapSq = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const lap = 4 * luma[i]! - luma[i - 1]! - luma[i + 1]! - luma[i - width]! - luma[i + width]!;
        lapSum += lap;
        lapSq += lap * lap;
        count++;
      }
    }
    const lapMean = lapSum / count;
    edgeVariance = lapSq / count - lapMean * lapMean;
  }

  return { meanLuma: mean, lumaStdDev, edgeVariance };
}

export function assessImageQuality(img: RgbaImage): ImageQuality {
  const stats = computeStats(img);
  const warnings: QualityWarning[] = [];

  if (img.width < MIN_CROP_PX.w || img.height < MIN_CROP_PX.h) {
    warnings.push({
      code: 'TOO_SMALL',
      message: `Crop is ${img.width}×${img.height}px; chart details may be unreadable below ${MIN_CROP_PX.w}×${MIN_CROP_PX.h}px.`,
    });
  }
  if (stats.lumaStdDev < QUALITY_THRESHOLDS.minLumaStdDev) {
    warnings.push({
      code: 'LOW_CONTRAST',
      message: 'Region is nearly uniform. It may be blank, covered by a dialog, or not a chart.',
    });
  }
  if (stats.edgeVariance < QUALITY_THRESHOLDS.minEdgeVariance) {
    warnings.push({
      code: 'LOW_DETAIL',
      message: 'Very little fine detail. The view may be blurry, zoomed out too far, or empty. (Heuristic, uncalibrated.)',
    });
  }

  return { stats, warnings };
}
