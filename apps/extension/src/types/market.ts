import { z } from 'zod';

export const DIRECTIONS = ['UP', 'DOWN', 'WAIT', 'INSUFFICIENT_DATA', 'ERROR'] as const;
export const DirectionSchema = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof DirectionSchema>;

export const DataSourceSchema = z.enum(['visual_only', 'imported_ohlc', 'authorized_feed', 'demo_fixture']);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const InstrumentTypeSchema = z.enum(['fixed_expiry_demo', 'conventional_demo']);
export type InstrumentType = z.infer<typeof InstrumentTypeSchema>;

/**
 * One OHLC bar. `time` is the bar's OPEN time, ISO 8601 UTC. Zod 4 `z.number()` rejects NaN and
 * Infinity, so a parsed candle always has finite prices. Price relationships are checked in
 * `signals/validateBars.ts` so they can be reported with reason codes.
 */
export const CandleSchema = z.object({
  time: z.iso.datetime(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nonnegative().optional(),
});
export type Candle = z.infer<typeof CandleSchema>;

/** What the user told us about the chart. Timeframe and horizon are separate on purpose. */
export const ChartContextSchema = z.object({
  assetLabel: z.string().trim().max(40),
  instrumentType: InstrumentTypeSchema,
  /** Seconds represented by one candle. */
  chartTimeframeSec: z.number().int().positive().nullable(),
  /** Seconds over which an UP/DOWN outcome would be judged. Never derived from the timeframe. */
  predictionHorizonSec: z.number().int().positive().nullable(),
});
export type ChartContext = z.infer<typeof ChartContextSchema>;

export const IndicatorSnapshotSchema = z.object({
  emaFast: z.number(),
  emaSlow: z.number(),
  rsi: z.number(),
  macd: z.number(),
  macdSignal: z.number(),
  macdHistogram: z.number(),
});
export type IndicatorSnapshot = z.infer<typeof IndicatorSnapshotSchema>;

export const AnalysisResultSchema = z.object({
  id: z.string(),
  status: DirectionSchema,
  source: DataSourceSchema,
  instrumentType: InstrumentTypeSchema,
  assetLabel: z.string(),
  chartTimeframeSec: z.number().nullable(),
  predictionHorizonSec: z.number().nullable(),
  /** When the engine ran, ISO 8601 UTC. */
  analyzedAt: z.string(),
  /** Open time of the newest bar used, ISO 8601 UTC. The result describes the series as of this bar. */
  lastBarTime: z.string().nullable(),
  barCount: z.number().int().nonnegative(),
  strategyVersion: z.string(),
  parameters: z.record(z.string(), z.number()),
  barDataVerified: z.boolean(),
  reasonCodes: z.array(z.string()),
  evidence: z.array(z.string()),
  missingFields: z.array(z.string()),
  assumptions: z.array(z.string()),
  explanation: z.string(),
  /** Only present when computed from validated bars. */
  indicators: IndicatorSnapshotSchema.nullable(),
  isSimulation: z.literal(true),
  actionableAsOrder: z.literal(false),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
