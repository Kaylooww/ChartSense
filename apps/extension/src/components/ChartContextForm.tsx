import { formatDuration } from '../sidepanel/format';
import type { ChartContext, InstrumentType } from '../types/market';

const TIMEFRAMES = [5, 10, 15, 30, 60, 300, 900, 1800, 3600, 14_400, 86_400];
const HORIZONS = [30, 60, 120, 300, 600, 900, 1800, 3600, 14_400, 86_400];

const field = 'w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50';
const label = 'space-y-1 text-xs text-zinc-400';

export const EMPTY_CONTEXT: ChartContext = {
  assetLabel: '',
  instrumentType: 'fixed_expiry_demo',
  chartTimeframeSec: null,
  predictionHorizonSec: null, // never defaulted from the timeframe
};

/** Asset, instrument, chart timeframe and a separate prediction horizon, all chosen by the user. */
export function ChartContextForm({
  value,
  onChange,
  disabled = false,
}: {
  value: ChartContext;
  onChange: (patch: Partial<ChartContext>) => void;
  disabled?: boolean;
}) {
  const seconds = (v: string) => (v === '' ? null : Number(v));
  return (
    <fieldset disabled={disabled} className="grid grid-cols-2 gap-2">
      <label className={`${label} col-span-2`}>
        <span>Asset label</span>
        <input
          className={field}
          value={value.assetLabel}
          maxLength={40}
          placeholder="e.g. EUR/USD"
          onChange={(e) => onChange({ assetLabel: e.target.value })}
        />
      </label>
      <label className={`${label} col-span-2`}>
        <span>Instrument type</span>
        <select className={field} value={value.instrumentType} onChange={(e) => onChange({ instrumentType: e.target.value as InstrumentType })}>
          <option value="fixed_expiry_demo">Fixed-expiry (demo) · UP / DOWN / WAIT</option>
          <option value="conventional_demo">Conventional (demo) · BUY / SELL / WAIT</option>
        </select>
      </label>
      <label className={label}>
        <span>Chart timeframe (one candle)</span>
        <select className={field} value={value.chartTimeframeSec ?? ''} onChange={(e) => onChange({ chartTimeframeSec: seconds(e.target.value) })}>
          <option value="">Choose…</option>
          {TIMEFRAMES.map((s) => (
            <option key={s} value={s}>
              {formatDuration(s)}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        <span>Prediction horizon</span>
        <select className={field} value={value.predictionHorizonSec ?? ''} onChange={(e) => onChange({ predictionHorizonSec: seconds(e.target.value) })}>
          <option value="">Choose…</option>
          {HORIZONS.map((s) => (
            <option key={s} value={s}>
              {formatDuration(s)}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
