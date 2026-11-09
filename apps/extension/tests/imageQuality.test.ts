import { describe, expect, it } from 'vitest';
import { assessImageQuality, type RgbaImage } from '../src/analysis/imageQuality';

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const codes = (img: RgbaImage) => assessImageQuality(img).warnings.map((w) => w.code);

describe('assessImageQuality', () => {
  it('flags a uniform image as low contrast and low detail', () => {
    expect(codes(image(300, 200, () => [20, 20, 20]))).toEqual(['LOW_CONTRAST', 'LOW_DETAIL']);
  });

  it('passes a high-detail image', () => {
    const checker = image(300, 200, (x, y) => ((x + y) % 2 === 0 ? [240, 240, 240] : [10, 10, 10]));
    expect(codes(checker)).toEqual([]);
  });

  it('passes a chart-like image with sharp bars on a dark background', () => {
    const chart = image(300, 200, (x, y) => {
      const bar = Math.floor(x / 10) % 2 === 0 && y > 40 + (Math.floor(x / 10) * 7) % 90;
      return bar ? [52, 211, 153] : [11, 18, 32];
    });
    expect(codes(chart)).toEqual([]);
  });

  it('flags crops below the minimum size', () => {
    const tiny = image(60, 40, (x, y) => ((x + y) % 2 === 0 ? [255, 255, 255] : [0, 0, 0]));
    expect(codes(tiny)).toContain('TOO_SMALL');
  });

  it('flags a smooth gradient as low detail without calling it blank', () => {
    // A smooth horizontal ramp (0..179) has real contrast but almost no fine detail.
    const gradient = image(300, 200, (x) => {
      const v = Math.floor(x * 0.6);
      return [v, v, v];
    });
    const result = codes(gradient);
    expect(result).toContain('LOW_DETAIL');
    expect(result).not.toContain('LOW_CONTRAST');
  });

  it('does not crash on empty input', () => {
    const quality = assessImageQuality({ data: new Uint8ClampedArray(0), width: 0, height: 0 });
    expect(quality.warnings.map((w) => w.code)).toContain('TOO_SMALL');
  });
});
