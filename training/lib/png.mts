import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** Minimal RGBA image + PNG encoder, so synthetic charts need no image library or browser. */
export type Rgba = { width: number; height: number; data: Uint8Array };

export function blank(width: number, height: number, [r, g, b]: [number, number, number]): Rgba {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
  return { width, height, data };
}

export function fillRect(img: Rgba, x: number, y: number, w: number, h: number, [r, g, b]: [number, number, number]): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(img.width, Math.round(x + Math.max(1, w)));
  const y1 = Math.min(img.height, Math.round(y + Math.max(1, h)));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) img.data.set([r, g, b, 255], (yy * img.width + xx) * 4);
}

/** Same as the extension's strip: keep everything right of `fromX` (0..1) of the width. */
export function cropRight(img: Rgba, fromX: number): Rgba {
  const sx = Math.floor(img.width * fromX);
  const width = Math.max(1, img.width - sx);
  const data = new Uint8Array(width * img.height * 4);
  for (let y = 0; y < img.height; y++) data.set(img.data.subarray((y * img.width + sx) * 4, (y * img.width + sx + width) * 4), y * width * 4);
  return { width, height: img.height, data };
}

export function encodePng(img: Rgba): Buffer {
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1); // filter byte 0
  const chunk = (type: string, body: Buffer) => {
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    typed.copy(out, 4);
    out.writeUInt32BE(crc32(typed), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Decodes 8-bit RGB/RGBA non-interlaced PNGs (what screenshot tools write); anything else throws. */
export function decodePng(png: Buffer): Rgba {
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('not a PNG');
  let width = 0, height = 0, colorType = 0;
  const idat: Buffer[] = [];
  for (let p = 8; p < png.length; ) {
    const len = png.readUInt32BE(p);
    const type = png.toString('ascii', p + 4, p + 8);
    const body = png.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9]!;
      if (body[8] !== 8 || (colorType !== 2 && colorType !== 6) || body[12] !== 0) throw new Error('unsupported PNG (need 8-bit RGB/RGBA, not interlaced)');
    } else if (type === 'IDAT') idat.push(body);
    p += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp]! : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (pred === undefined) throw new Error(`bad PNG filter ${filter}`);
      px[y * stride + x] = (line[x]! + pred) & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) data.set([px[j]!, px[j + 1]!, px[j + 2]!, bpp === 4 ? px[j + 3]! : 255], i * 4);
  return { width, height, data };
}

/** Like the extension's downscale: longest side at most `maxSide` (area average), never upscaled. */
export function fitWithin(img: Rgba, maxSide = 1024): Rgba {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1) return img;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * img.width) / width), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / width));
      const y0 = Math.floor((y * img.height) / height), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / height));
      const sum = [0, 0, 0, 0];
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) for (let k = 0; k < 4; k++) sum[k]! += img.data[(yy * img.width + xx) * 4 + k]!;
      const n = (x1 - x0) * (y1 - y0);
      data.set(sum.map((s) => Math.round(s / n)), (y * width + x) * 4);
    }
  return { width, height, data };
}
