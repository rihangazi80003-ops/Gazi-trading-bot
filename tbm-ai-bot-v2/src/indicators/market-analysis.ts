/**
 * TBM AI BOT V2
 * Market Analysis Engine
 * Part-1
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  asset: string;
  direction: "CALL" | "PUT";
  confidence: number;
  timeframe: string;
  entry: number;
  reason: string;
}

export interface IndicatorResult {
  rsi: number;
  ema9: number;
  ema21: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface TrendResult {
  trend: "UP" | "DOWN" | "SIDEWAYS";
  strength: number;
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
  "OIL/USD"
];

export const OTC_MARKETS = [
  "EUR/USD OTC",
  "GBP/USD OTC",
  "USD/JPY OTC",
  "AUD/USD OTC",
  "USD/CHF OTC",
  "NZD/USD OTC"
];

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);

  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }

  return result;
}

export function calculateRSI(
  closes: number[],
  period = 14
): number {

  if (closes.length <= period) return 50;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= period; i++) {

    const diff = closes[i] - closes[i - 1];

    if (diff >= 0)
      gain += diff;
    else
      loss += Math.abs(diff);

  }

  gain /= period;
  loss /= period;

  if (loss === 0) return 100;

  const rs = gain / loss;

  return 100 - 100 / (1 + rs);
}
/* ============================================================
   PART-2
   EMA + MACD ENGINE
============================================================ */

export function calculateEMAArray(
  values: number[],
  period: number
): number[] {

  if (values.length === 0) return [];

  const multiplier = 2 / (period + 1);

  const ema: number[] = [];

  ema[0] = values[0];

  for (let i = 1; i < values.length; i++) {

    ema[i] =
      values[i] * multiplier +
      ema[i - 1] * (1 - multiplier);

  }

  return ema;
}

export function calculateEMAValue(
  values: number[],
  period: number
): number {

  const result = calculateEMAArray(values, period);

  return result[result.length - 1];
}

export interface MACDResult {

  macd: number;

  signal: number;

  histogram: number;

}

export function calculateMACD(
  closes: number[]
): MACDResult {

  const ema12 = calculateEMAArray(closes, 12);

  const ema26 = calculateEMAArray(closes, 26);

  const macdLine: number[] = [];

  for (let i = 0; i < closes.length; i++) {

    macdLine.push(ema12[i] - ema26[i]);

  }

  const signalLine = calculateEMAArray(macdLine, 9);

  const macd =
    macdLine[macdLine.length - 1];

  const signal =
    signalLine[signalLine.length - 1];

  return {

    macd,

    signal,

    histogram: macd - signal

  };

}

export function emaTrend(

  closes: number[]

): TrendResult {

  const ema9 = calculateEMAValue(closes, 9);

  const ema21 = calculateEMAValue(closes, 21);

  const ema50 = calculateEMAValue(closes, 50);

  const ema200 = calculateEMAValue(closes, 200);

  let score = 0;

  if (ema9 > ema21) score++;

  if (ema21 > ema50) score++;

  if (ema50 > ema200) score++;

  if (score >= 3) {

    return {

      trend: "UP",

      strength: 100

    };

  }

  if (score === 2) {

    return {

      trend: "UP",

      strength: 80

    };

  }

  if (score === 1) {

    return {

      trend: "SIDEWAYS",

      strength: 50

    };

  }

  return {

    trend: "DOWN",

    strength: 100

  };

}
/* ==========================================================
   PART-3
   ADVANCED TREND ANALYSIS
========================================================== */

export function detectTrend(
    candles: Candle[]
): TrendResult {

    const closes = candles.map(c => c.close);

    const ema9 = ema(closes,9);
    const ema21 = ema(closes,21);
    const ema50 = ema(closes,50);

    let trend:"UP"|"DOWN"|"SIDEWAYS"="SIDEWAYS";
    let strength=50;

    if(
        ema9>ema21 &&
        ema21>ema50
    ){
        trend="UP";
        strength=92;
    }

    else if(
        ema9<ema21 &&
        ema21<ema50
    ){
        trend="DOWN";
        strength=92;
    }

    else{

        trend="SIDEWAYS";
        strength=35;

    }

    return{
        trend,
        strength
    };

}


/* ==========================================================
SUPPORT
========================================================== */

export function supportLevel(
candles:Candle[]
){

const lows=candles
.slice(-30)
.map(c=>c.low);

return Math.min(...lows);

}


/* ==========================================================
RESISTANCE
========================================================== */

export function resistanceLevel(
candles:Candle[]
){

const highs=candles
.slice(-30)
.map(c=>c.high);

return Math.max(...highs);

}


/* ==========================================================
VOLUME FILTER
========================================================== */

export function volumeFilter(
candles:Candle[]
){

const volumes=candles.map(c=>c.volume);

const avg=average(volumes);

const current=volumes[
volumes.length-1
];

return current>=avg;

}


/* ==========================================================
SIDEWAYS FILTER
========================================================== */

export function isSideways(
candles:Candle[]
){

const high=resistanceLevel(candles);

const low=supportLevel(candles);

const range=high-low;

const price=
candles[candles.length-1].close;

return(
range<
price*0.0015
);

}