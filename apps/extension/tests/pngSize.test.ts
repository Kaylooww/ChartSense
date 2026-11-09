import { describe, expect, it } from 'vitest';
import { readPngSize } from '../src/capture/pngSize';
import { fakePngDataUrl } from './helpers';

describe('readPngSize', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(readPngSize(fakePngDataUrl(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(readPngSize(fakePngDataUrl(2560, 1313))).toEqual({ width: 2560, height: 1313 });
  });

  it('rejects non-PNG and malformed input', () => {
    expect(readPngSize('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBeNull();
    expect(readPngSize('not a data url')).toBeNull();
    expect(readPngSize('data:image/png;base64,@@@@')).toBeNull();
    expect(readPngSize('data:image/png;base64,iVBORw0KGgo=')).toBeNull(); // signature only
  });

  it('rejects zero dimensions and a wrong chunk type', () => {
    expect(readPngSize(fakePngDataUrl(0, 100))).toBeNull();
    const wrongChunk = fakePngDataUrl(10, 10).replace('SUhEUg', 'SUhEVg');
    expect(readPngSize(wrongChunk)).toBeNull();
  });
});
