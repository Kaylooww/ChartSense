import type { ErrorCode } from '../types/session';

export interface ErrorCopy {
  title: string;
  /** What happened. */
  detail: string;
  /** What the user can do about it. */
  recovery: string;
}

export const ERROR_COPY: Record<ErrorCode, ErrorCopy> = {
  NO_SOURCE_TAB: {
    title: 'No tab authorized',
    detail: 'ChartSense only captures a tab you explicitly authorize.',
    recovery: 'Open your chart tab, then click the ChartSense icon in the Chrome toolbar.',
  },
  SESSION_NOT_ACTIVE: {
    title: 'No capture session running',
    detail: 'Capturing needs an active session that you started.',
    recovery: 'Press Start capture, then try again.',
  },
  SESSION_PAUSED: {
    title: 'Session paused',
    detail: 'Captures are blocked while the session is paused.',
    recovery: 'Press Resume to continue, or Stop to end the session.',
  },
  INVALID_STATE: {
    title: 'That action is not available right now',
    detail: 'The session is in a state where this control does not apply.',
    recovery: 'Check the session status shown above and try again.',
  },
  TAB_NOT_ACTIVE: {
    title: 'Chart tab is not in front',
    detail: 'Chrome can only capture the tab you are looking at. The authorized tab is in the background.',
    recovery: 'Switch back to the authorized chart tab, then capture again.',
  },
  SOURCE_NAVIGATED: {
    title: 'The authorized tab navigated away',
    detail: 'The tab loaded a different page or site, so ChartSense dropped its authorization and ended the session.',
    recovery: 'Go back to your chart, then click the ChartSense toolbar icon to authorize it again.',
  },
  SOURCE_CLOSED: {
    title: 'The authorized tab was closed',
    detail: 'The session ended and any captured frames were discarded.',
    recovery: 'Open your chart tab and click the ChartSense toolbar icon.',
  },
  PERMISSION_EXPIRED: {
    title: 'Capture permission expired',
    detail:
      'Chrome grants tab access only temporarily (activeTab) and revokes it when the page navigates. Clicking buttons inside this panel does not renew it.',
    recovery: 'Click the ChartSense icon in the Chrome toolbar while the chart tab is open, then Start capture again.',
  },
  UNCAPTURABLE_PAGE: {
    title: 'This page cannot be captured',
    detail: 'Chrome blocks capturing internal pages (chrome://), the Web Store and similar protected pages.',
    recovery: 'Open a normal http(s) chart page, such as the local mock chart, and click the toolbar icon there.',
  },
  RATE_LIMITED: {
    title: 'Capturing too quickly',
    detail: 'ChartSense limits captures to about one per second (Chrome allows at most two).',
    recovery: 'Wait a moment and capture again.',
  },
  BUSY: {
    title: 'A capture is already in progress',
    detail: 'Only one capture runs at a time so results cannot overlap or arrive out of order.',
    recovery: 'Wait for the current capture to finish.',
  },
  CAPTURE_FAILED: {
    title: 'Screenshot failed',
    detail: 'Chrome returned an error while capturing the tab.',
    recovery: 'Make sure the chart tab is visible and not minimized, then try again.',
  },
  NO_SELECTION: {
    title: 'No chart region selected',
    detail: 'Draw a rectangle around the chart on the captured frame so the rest of the page is ignored.',
    recovery: 'Drag on the preview to select the chart, or press Use full frame.',
  },
  SELECTION_STALE: {
    title: 'Page layout changed',
    detail: 'The page size or zoom changed since you selected the chart, so the old rectangle may no longer match the chart.',
    recovery: 'Select the chart region again on the new frame.',
  },
  CROP_INVALID: {
    title: 'Selection is too small or out of bounds',
    detail: 'The selected region is empty, outside the screenshot, or smaller than the minimum size.',
    recovery: 'Select a larger region that covers the chart.',
  },
  IMAGE_DECODE_FAILED: {
    title: 'Could not read the screenshot',
    detail: 'The captured image could not be decoded.',
    recovery: 'Capture again.',
  },
  BAD_REQUEST: {
    title: 'Invalid request',
    detail: 'The background worker rejected a malformed message.',
    recovery: 'Reload the extension from chrome://extensions and try again.',
  },
  UNTRUSTED_SENDER: {
    title: 'Request rejected',
    detail: 'The background worker only accepts messages from the ChartSense side panel.',
    recovery: 'Use the ChartSense side panel.',
  },
  INTERNAL: {
    title: 'Unexpected error',
    detail: 'Something went wrong inside the extension.',
    recovery: 'Try again. If it persists, reload the extension from chrome://extensions and check the service worker console.',
  },
};

/**
 * Maps the free-text error Chrome gives when `captureVisibleTab` rejects onto one of our codes.
 * Chrome's wording is not a stable API, so anything unrecognized falls back to CAPTURE_FAILED.
 */
export function classifyCaptureError(message: string): ErrorCode {
  const m = message.toLowerCase();
  if (m.includes('max_capture_visible_tab_calls_per_second') || m.includes('quota')) {
    return 'RATE_LIMITED';
  }
  if (
    m.includes('chrome://') ||
    m.includes('chrome-extension://') ||
    m.includes('extensions gallery') ||
    m.includes('chrome web store') ||
    m.includes('devtools://')
  ) {
    return 'UNCAPTURABLE_PAGE';
  }
  if (m.includes('no tab with id') || m.includes('no window with id') || m.includes('tab was closed')) {
    return 'SOURCE_CLOSED';
  }
  if (
    m.includes('activetab') ||
    m.includes('<all_urls>') ||
    m.includes('cannot access contents') ||
    m.includes('permission')
  ) {
    return 'PERMISSION_EXPIRED';
  }
  return 'CAPTURE_FAILED';
}
