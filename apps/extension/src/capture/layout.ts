import type { LayoutSignature, SelectionStaleReason } from '../types/session';

const ZOOM_EPSILON = 0.001;

/**
 * Compares the layout a selection was drawn on with the layout of a newer frame.
 * Returns why the selection can no longer be trusted, or null if it is still valid.
 *
 * A change in screenshot pixel size covers browser-window resizes, side-panel width changes and
 * device-pixel-ratio changes (e.g. moving the window to another monitor). A zoom change moves the
 * chart inside the viewport even when the pixel size is unchanged.
 */
export function detectLayoutChange(
  previous: LayoutSignature,
  next: LayoutSignature,
): SelectionStaleReason | null {
  if (previous.imageWidth !== next.imageWidth || previous.imageHeight !== next.imageHeight) {
    return 'SIZE_CHANGED';
  }
  if (Math.abs(previous.zoomFactor - next.zoomFactor) > ZOOM_EPSILON) return 'ZOOM_CHANGED';
  return null;
}
