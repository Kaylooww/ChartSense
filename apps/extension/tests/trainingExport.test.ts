import { describe, expect, it } from 'vitest';
import { buildTrainingExport, TrainingExportSchema } from '../src/capture/trainingExport';

describe('training export (opt-in, privacy-reviewed)', () => {
  const input = { chart: 'AAAA', recent: 'BBBB', capturedAt: '2026-11-10T15:18:16.123Z', sessionStartedAt: '2026-11-10T15:00:00.000Z', chartTimeframeSec: 60, now: new Date('2026-11-10T16:00:00Z') };

  it('contains only the two images, times, timeframe and session group', () => {
    const e = buildTrainingExport(input);
    expect(Object.keys(e).sort()).toEqual(['capturedAt', 'chartTimeframeSec', 'exportedAt', 'format', 'group', 'id', 'images', 'privacyReviewed', 'version']);
    expect(e).toMatchObject({ id: 'real-20261110t151816123', group: 'session-20261110t150000000', privacyReviewed: true });
  });

  it('rejects any extra field such as a site URL', () => {
    expect(TrainingExportSchema.safeParse({ ...buildTrainingExport(input), url: 'example.com' }).success).toBe(false);
  });
});
