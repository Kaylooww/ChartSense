/**
 * Shrinks a PNG data URL so its longest side is at most `maxSide` and returns bare base64 (what
 * Ollama's `images` field expects). With `fromX` (0..1) only the part right of that fraction is kept:
 * the newest candles. Smaller images mean faster local inference; runs in memory only.
 */
export async function downscaleToBase64(dataUrl: string, maxSide = 1024, fromX = 0): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const sx = Math.floor(image.naturalWidth * fromX);
  const sw = Math.max(1, image.naturalWidth - sx);
  const scale = Math.min(1, maxSide / Math.max(sw, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d')?.drawImage(image, sx, 0, sw, image.naturalHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
}
