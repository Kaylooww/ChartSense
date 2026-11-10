import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { VISION_MODELS } from '../../analysis/ollama';
import { EMPTY_CONTEXT } from '../../components/ChartContextForm';
import { ChartContextSchema } from '../../types/market';

export const SETTINGS_KEY = 'chartsense.monitorSettings';

/** Non-secret preferences. Each field falls back to its default on its own, so one bad value never wipes the rest. */
export const MonitorSettingsSchema = z.object({
  context: ChartContextSchema.catch(EMPTY_CONTEXT),
  model: z.enum(VISION_MODELS).catch(VISION_MODELS[0]),
  intervalSec: z.number().int().min(5).max(60).catch(10),
  soundOn: z.boolean().catch(true),
  stake: z.number().positive().catch(1),
  payoutPct: z.number().positive().max(1000).catch(80),
});
export type MonitorSettings = z.infer<typeof MonitorSettingsSchema>;

export const DEFAULT_SETTINGS: MonitorSettings = MonitorSettingsSchema.parse({});

export function parseSettings(value: unknown): MonitorSettings {
  return MonitorSettingsSchema.parse(typeof value === 'object' && value !== null ? value : {});
}

/** Monitor preferences in chrome.storage.local. Loading them never starts monitoring. */
export function useMonitorSettings(): [MonitorSettings, (patch: Partial<MonitorSettings>) => void] {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    void chrome.storage.local.get(SETTINGS_KEY).then((stored) => alive && setSettings(parseSettings(stored[SETTINGS_KEY])));
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<MonitorSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      void chrome.storage.local.set({ [SETTINGS_KEY]: next });
      return next;
    });
  }, []);

  return [settings, update];
}
