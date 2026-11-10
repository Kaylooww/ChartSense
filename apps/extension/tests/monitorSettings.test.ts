import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../src/sidepanel/hooks/useMonitorSettings';

describe('parseSettings', () => {
  it('defaults everything when nothing is stored; the horizon is never pre-filled', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.context.predictionHorizonSec).toBeNull();
    expect(DEFAULT_SETTINGS.intervalSec).toBe(10);
  });

  it('keeps valid fields and replaces only the invalid ones', () => {
    const s = parseSettings({ model: 'removed-model:1b', intervalSec: 2, stake: 5, soundOn: false, context: { ...DEFAULT_SETTINGS.context, assetLabel: 'EUR/USD' } });
    expect(s.model).toBe(DEFAULT_SETTINGS.model);
    expect(s.intervalSec).toBe(10);
    expect(s.stake).toBe(5);
    expect(s.soundOn).toBe(false);
    expect(s.context.assetLabel).toBe('EUR/USD');
  });
});
