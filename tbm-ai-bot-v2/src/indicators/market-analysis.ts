/**
 * BTZ Signal AI Bot
 * Market analysis primitives.
 *
 * These functions are deterministic and side-effect free. A market-data
 * adapter can pass candle closes into them without coupling indicators to
 * Telegram, the chart, or a broker SDK.
 */

export interface Candle {
    readonly time: number;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number;
}

export interface Signal {
    readonly asset: string;
    readonly direction: "CALL" | "PUT";
    readonly confidence: number;
    readonly timeframe: string;
    readonly entry: number;
    readonly reason: string;
}

export interface IndicatorResult {
    readonly rsi: number;
    readonly ema9: number;
    readonly ema21: number;
    readonly macd: number;
    readonly signal: number;
    readonly histogram: number;
}

export interface TrendResult {
    readonly trend: "UP" | "DOWN" | "SIDEWAYS";
    readonly strength: number;
}

export interface SupportResistanceResult {
    readonly support: number;
    readonly resistance: number;
}

export const TIMEFRAME = "M1";
export const MIN_CONFIDENCE = 90;
export const MAX_SPREAD = 0.0005;

export const REAL_MARKETS = [
    "EUR/USD",
    "GBP/USD",
    "USD/JPY",
    "USD/CHF",
    "AUD/USD",
    "NZD/USD",
    "USD/CAD",
    "EUR/JPY",
    "GBP/JPY",
    "GOLD/USD",
    "SILVER/USD",
    "OIL/USD",
] as const;

export const OTC_MARKETS = [
    "EUR/USD OTC",
    "GBP/USD OTC",
    "USD/JPY OTC",
    "AUD/USD OTC",
    "USD/CHF OTC",
    "NZD/USD OTC",
] as const;

function validPeriod(period: number): number {
    if (!Number.isFinite(period) || period <= 0) {
        throw new RangeError("Indicator period must be a positive number");
    }

    return Math.floor(period);
}

export function average(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function ema(values: number[], period: number): number {
    const result = calculateEMAArray(values, period);
    return result.at(-1) ?? 0;
}

/**
 * Uses Wilder's smoothing after the initial average gain/loss.
 * A neutral 50 is returned until enough candles exist.
 */
export function calculateRSI(closes: number[], period = 14): number {
    const length = validPeriod(period);
    if (closes.length <= length) {
        return 50;
    }

    let gain = 0;
    let loss = 0;

    for (let index = 1; index <= length; index += 1) {
        const current = closes[index] ?? 0;
        const previous = closes[index - 1] ?? current;
        const difference = current - previous;

        if (difference >= 0) {
            gain += difference;
        } else {
            loss += Math.abs(difference);
        }
    }

    let averageGain = gain / length;
    let averageLoss = loss / length;

    for (let index = length + 1; index < closes.length; index += 1) {
        const current = closes[index] ?? closes[index - 1] ?? 0;
        const previous = closes[index - 1] ?? current;
        const difference = current - previous;
        const currentGain = difference > 0 ? difference : 0;
        const currentLoss = difference < 0 ? Math.abs(difference) : 0;

        averageGain = ((averageGain * (length - 1)) + currentGain) / length;
        averageLoss = ((averageLoss * (length - 1)) + currentLoss) / length;
    }

    if (averageLoss === 0) {
        return averageGain === 0 ? 50 : 100;
    }

    const relativeStrength = averageGain / averageLoss;
    return Math.max(0, Math.min(100, 100 - (100 / (1 + relativeStrength))));
}

export function calculateEMAArray(values: number[], period: number): number[] {
    const length = validPeriod(period);
    if (values.length === 0) {
        return [];
    }

    const multiplier = 2 / (length + 1);
    const firstValue = values[0] ?? 0;
    const emaValues: number[] = [firstValue];

    for (let index = 1; index < values.length; index += 1) {
        const value = values[index] ?? emaValues[index - 1] ?? firstValue;
        const previous = emaValues[index - 1] ?? value;
        emaValues.push((value * multiplier) + (previous * (1 - multiplier)));
    }

    return emaValues;
}

export function calculateEMAValue(values: number[], period: number): number {
    return calculateEMAArray(values, period).at(-1) ?? 0;
}

export interface MACDResult {
    readonly macd: number;
    readonly signal: number;
    readonly histogram: number;
}

export function calculateMACD(closes: number[]): MACDResult {
    if (closes.length === 0) {
        return { macd: 0, signal: 0, histogram: 0 };
    }

    const fast = calculateEMAArray(closes, 12);
    const slow = calculateEMAArray(closes, 26);
    const macdLine = closes.map((_, index) => (fast[index] ?? 0) - (slow[index] ?? 0));
    const signalLine = calculateEMAArray(macdLine, 9);
    const macd = macdLine.at(-1) ?? 0;
    const signal = signalLine.at(-1) ?? 0;

    return {
        macd,
        signal,
        histogram: macd - signal,
    };
}

export function calculateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map((candle) => candle.close);
    const macd = calculateMACD(closes);

    return {
        rsi: calculateRSI(closes),
        ema9: calculateEMAValue(closes, 9),
        ema21: calculateEMAValue(closes, 21),
        macd: macd.macd,
        signal: macd.signal,
        histogram: macd.histogram,
    };
}

export function emaTrend(closes: number[]): TrendResult {
    if (closes.length === 0) {
        return { trend: "SIDEWAYS", strength: 50 };
    }

    const ema9 = calculateEMAValue(closes, 9);
    const ema21 = calculateEMAValue(closes, 21);
    const ema50 = calculateEMAValue(closes, 50);
    const ema200 = calculateEMAValue(closes, 200);
    let score = 0;

    if (ema9 > ema21) score += 1;
    if (ema21 > ema50) score += 1;
    if (ema50 > ema200) score += 1;

    if (score === 3) return { trend: "UP", strength: 100 };
    if (score === 2) return { trend: "UP", strength: 80 };
    if (score === 1) return { trend: "SIDEWAYS", strength: 50 };
    return { trend: "DOWN", strength: 100 };
}

export function detectTrend(candles: Candle[]): TrendResult {
    return emaTrend(candles.map((candle) => candle.close));
}

export function supportLevel(candles: Candle[]): number {
    const recent = candles.slice(-30);
    return recent.reduce(
        (support, candle) => Math.min(support, candle.low),
        recent[0]?.low ?? 0,
    );
}

export function resistanceLevel(candles: Candle[]): number {
    const recent = candles.slice(-30);
    return recent.reduce(
        (resistance, candle) => Math.max(resistance, candle.high),
        recent[0]?.high ?? 0,
    );
}

export function calculateSupportResistance(candles: Candle[]): SupportResistanceResult {
    return {
        support: supportLevel(candles),
        resistance: resistanceLevel(candles),
    };
}