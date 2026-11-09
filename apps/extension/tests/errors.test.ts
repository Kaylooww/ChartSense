import { describe, expect, it } from 'vitest';
import { classifyCaptureError, ERROR_COPY } from '../src/capture/errors';
import { ERROR_CODES } from '../src/types/session';

describe('classifyCaptureError', () => {
  it.each([
    ["Either the '<all_urls>' or 'activeTab' permission is required.", 'PERMISSION_EXPIRED'],
    ["The 'activeTab' permission is not in effect because this extension has not been in invoked.", 'PERMISSION_EXPIRED'],
    ['Cannot access contents of the page. Extension manifest must request permission to access the respective host.', 'PERMISSION_EXPIRED'],
    ['This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.', 'RATE_LIMITED'],
    ['Cannot access contents of url "chrome://extensions/". Extension manifest must request permission to access this host.', 'UNCAPTURABLE_PAGE'],
    ['The extensions gallery cannot be scripted.', 'UNCAPTURABLE_PAGE'],
    ['No tab with id: 42.', 'SOURCE_CLOSED'],
    ['No window with id: 7.', 'SOURCE_CLOSED'],
    ['Something nobody has seen before', 'CAPTURE_FAILED'],
  ])('maps %j to %s', (message, code) => {
    expect(classifyCaptureError(message)).toBe(code);
  });
});

describe('ERROR_COPY', () => {
  it('has user-facing text with a recovery step for every error code', () => {
    for (const code of ERROR_CODES) {
      const copy = ERROR_COPY[code];
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.detail.length).toBeGreaterThan(0);
      expect(copy.recovery.length).toBeGreaterThan(0);
    }
  });
});
