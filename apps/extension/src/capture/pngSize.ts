/**
 * Reads the pixel dimensions of a PNG data URL from its IHDR chunk without decoding the image.
 * `chrome.tabs.captureVisibleTab` is asked for PNG, so the header is always available.
 * Returns null if the data is not a well-formed PNG data URL.
 */
export function readPngSize(dataUrl: string): { width: number; height: number } | null {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) return null;

  // The signature (8 bytes) + IHDR length/type (8) + width/height (8) = 24 bytes -> 32 base64 chars.
  const head = dataUrl.slice(prefix.length, prefix.length + 32);
  let bytes: Uint8Array;
  try {
    const binary = atob(head);
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length < 24) return null;

  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => bytes[i] === b)) return null;
  // Bytes 12..15 must spell "IHDR".
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== 'IHDR') return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) return null;
  return { width, height };
}
