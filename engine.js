/**
 * FINORIX AI - Prediction Engine
 * Version: 2.0
 *
 * Features:
 * - EMA 9 / 21 / 50
 * - RSI 14
 * - MACD
 * - ADX
 * - Bollinger Bands
 * - ATR
 * - Support / Resistance
 * - Market Structure
 * - Candle Confirmation
 * - Volume confirmation when available
 * - Trend / Sideways / Breakout regime detection
 * - No-trade filters
 * - Conservative confidence calculation
 */

class BTZEngine {

    constructor() {

        this.config = {

            emaFast: 9,
            emaMedium: 21,
            emaSlow: 50,

            rsiPeriod: 14,
            macdFast: 12,
            macdSlow: 26,
            macdSignal: 9,

            adxPeriod: 14,
            atrPeriod: 14,
            bbPeriod: 20,

            minCandles: 60,

            sidewaysAdx: 18,
            strongTrendAdx: 25,

            minBodyRatio: 0.25,

            minConfidence: 62,
            strongConfidence: 78,
            maxConfidence: 92

        };

        this.weights = {

            trend: 22,
            momentum: 16,
            macd: 12,
            structure: 14,
            supportResistance: 10,
            volatility: 8,
            candle: 10,
            volume: 4,
            regime: 4

        };
    }


    // =========================================================
    // BASIC HELPERS
    // =========================================================

    clamp(value, min, max) {

        return Math.max(min, Math.min(max, value));

    }


    last(array) {

        return array[array.length - 1];

    }


    average(array) {

        if (!array.length) return 0;

        return array.reduce((a, b) => a + b, 0) / array.length;

    }


    standardDeviation(array) {

        if (!array.length) return 0;

        const avg = this.average(array);

        const variance =
            array.reduce((sum, value) => {
                return sum + Math.pow(value - avg, 2);
            }, 0) / array.length;

        return Math.sqrt(variance);

    }


    // =========================================================
    // EMA
    // =========================================================

    calculateEMA(data, period) {

        if (!data || data.length === 0) return [];

        if (data.length < period) {

            return new Array(data.length).fill(
                this.average(data)
            );

        }

        const multiplier = 2 / (period + 1);

        const ema = [];

        let seed = this.average(
            data.slice(0, period)
        );

        ema.push(seed);

        for (let i = period; i < data.length; i++) {

            const value =
                (data[i] - ema[ema.length - 1]) *
                multiplier +
                ema[ema.length - 1];

            ema.push(value);

        }

        // Align array length with original data
        const padding = new Array(
            data.length - ema.length
        ).fill(seed);

        return padding.concat(ema);

    }


    // =========================================================
    // RSI
    // =========================================================

    calculateRSI(closes, period = 14) {

        if (!closes || closes.length < period + 1) {

            return 50;

        }

        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {

            const change =
                closes[i] - closes[i - 1];

            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }

        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        for (
            let i = period + 1;
            i < closes.length;
            i++
        ) {

            const change =
                closes[i] - closes[i - 1];

            const gain =
                change > 0 ? change : 0;

            const loss =
                change < 0 ? Math.abs(change) : 0;

            avgGain =
                ((avgGain * (period - 1)) + gain) /
                period;

            avgLoss =
                ((avgLoss * (period - 1)) + loss) /
                period;

        }

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;

        return 100 - (100 / (1 + rs));

    }


    // =========================================================
    // MACD
    // =========================================================

    calculateMACD(closes) {

        const fast =
            this.calculateEMA(
                closes,
                this.config.macdFast
            );

        const slow =
            this.calculateEMA(
                closes,
                this.config.macdSlow
            );

        const macdLine = [];

        for (let i = 0; i < closes.length; i++) {

            macdLine.push(
                fast[i] - slow[i]
            );

        }

        const signalLine =
            this.calculateEMA(
                macdLine,
                this.config.macdSignal
            );

        const histogram =
            macdLine[macdLine.length - 1] -
            signalLine[signalLine.length - 1];

        return {

            macd:
                macdLine[macdLine.length - 1],

            signal:
                signalLine[signalLine.length - 1],

            histogram

        };

    }


    // =========================================================
    // ATR
    // =========================================================

    calculateATR(highs, lows, closes, period = 14) {

        if (closes.length < 2) return 0;

        const trueRanges = [];

        for (let i = 1; i < closes.length; i++) {

            const tr = Math.max(

                highs[i] - lows[i],

                Math.abs(
                    highs[i] - closes[i - 1]
                ),

                Math.abs(
                    lows[i] - closes[i - 1]
                )

            );

            trueRanges.push(tr);

        }

        if (trueRanges.length < period) {

            return this.average(trueRanges);

        }

        return this.average(
            trueRanges.slice(-period)
        );

    }


    // =========================================================
    // ADX
    // =========================================================

    calculateADX(highs, lows, closes, period = 14) {

        if (closes.length < period + 2) {

            return {
                adx: 0,
                plusDI: 0,
                minusDI: 0
            };

        }

        let trSum = 0;
        let plusSum = 0;
        let minusSum = 0;

        for (
            let i = 1;
            i <= period;
            i++
        ) {

            const upMove =
                highs[i] - highs[i - 1];

            const downMove =
                lows[i - 1] - lows[i];

            const tr = Math.max(

                highs[i] - lows[i],

                Math.abs(
                    highs[i] - closes[i - 1]
                ),

                Math.abs(
                    lows[i] - closes[i - 1]
                )

            );

            trSum += tr;

            if (
                upMove > downMove &&
                upMove > 0
            ) {

                plusSum += upMove;

            }

            if (
                downMove > upMove &&
                downMove > 0
            ) {

                minusSum += downMove;

            }

        }

        if (trSum === 0) {

            return {
                adx: 0,
                plusDI: 0,
                minusDI: 0
            };

        }

        const plusDI =
            100 * plusSum / trSum;

        const minusDI =
            100 * minusSum / trSum;

        const denominator =
            plusDI + minusDI;

        const dx =
            denominator === 0
                ? 0
                : 100 *
                  Math.abs(
                      plusDI - minusDI
                  ) /
                  denominator;

        return {

            adx: dx,
            plusDI,
            minusDI

        };

    }


    // =========================================================
    // BOLLINGER BANDS
    // =========================================================

    calculateBollinger(closes, period = 20) {

        if (closes.length < period) {

            return null;

        }

        const values =
            closes.slice(-period);

        const middle =
            this.average(values);

        const sd =
            this.standardDeviation(values);

        return {

            middle,

            upper:
                middle + (2 * sd),

            lower:
                middle - (2 * sd),

            width:
                middle === 0
                    ? 0
                    : (4 * sd) / middle

        };

    }


    // =========================================================
    // SUPPORT / RESISTANCE
    // =========================================================

    calculateSupportResistance(
        highs,
        lows,
        closes
    ) {

        const lookback =
            Math.min(30, closes.length);

        const recentHighs =
            highs.slice(-lookback);

        const recentLows =
            lows.slice(-lookback);

        const resistance =
            Math.max(...recentHighs);

        const support =
            Math.min(...recentLows);

        const price =
            this.last(closes);

        const range =
            resistance - support;

        let position = "MIDDLE";

        if (range > 0) {

            const relative =
                (price - support) / range;

            if (relative < 0.20) {

                position = "NEAR_SUPPORT";

            } else if (relative > 0.80) {

                position = "NEAR_RESISTANCE";

            }

        }

        return {

            support,
            resistance,
            range,
            position

        };

    }


    // =========================================================
    // CANDLE ANALYSIS
    // =========================================================

    analyzeLastCandles(
        opens,
        highs,
        lows,
        closes
    ) {

        const i = closes.length - 1;

        const open = opens[i];
        const high = highs[i];
        const low = lows[i];
        const close = closes[i];

        const range =
            high - low;

        const body =
            Math.abs(close - open);

        const bodyRatio =
            range === 0
                ? 0
                : body / range;

        const upperWick =
            high - Math.max(open, close);

        const lowerWick =
            Math.min(open, close) - low;

        let direction = "NEUTRAL";

        if (close > open) {

            direction = "BULLISH";

        } else if (close < open) {

            direction = "BEARISH";

        }

        let pattern = "NORMAL";

        if (range === 0) {

            pattern = "FLAT";

        } else if (
            bodyRatio < 0.20
        ) {

            pattern = "DOJI_LIKE";

        } else if (
            lowerWick > body * 1.8 &&
            close > open
        ) {

            pattern = "BULLISH_REJECTION";

        } else if (
            upperWick > body * 1.8 &&
            close < open
        ) {

            pattern = "BEARISH_REJECTION";

        }

        return {

            direction,
            pattern,
            range,
            body,
            bodyRatio,
            upperWick,
            lowerWick

        };

    }


    // =========================================================
    // MARKET STRUCTURE
    // =========================================================

    analyzeStructure(
        highs,
        lows
    ) {

        if (highs.length < 6) {

            return {
                trend: "NEUTRAL",
                strength: 0
            };

        }

        const h1 = highs[highs.length - 1];
        const h2 = highs[highs.length - 3];
        const h3 = highs[highs.length - 5];

        const l1 = lows[lows.length - 1];
        const l2 = lows[lows.length - 3];
        const l3 = lows[lows.length - 5];

        const bullish =
            h1 > h2 &&
            h2 >= h3 &&
            l1 > l2 &&
            l2 >= l3;

        const bearish =
            h1 < h2 &&
            h2 <= h3 &&
            l1 < l2 &&
            l2 <= l3;

        if (bullish) {

            return {
                trend: "BULLISH",
                strength: 1
            };

        }

        if (bearish) {

            return {
                trend: "BEARISH",
                strength: 1
            };

        }

        return {

            trend: "RANGE",
            strength: 0

        };

    }


    // =========================================================
    // MARKET REGIME
    // =========================================================

    detectMarketRegime(
        closes,
        highs,
        lows,
        adx,
        atr,
        bollinger
    ) {

        const price =
            this.last(closes);

        const recent =
            closes.slice(-20);

        const recentHigh =
            Math.max(...recent);

        const recentLow =
            Math.min(...recent);

        const range =
            recentHigh - recentLow;

        const averagePrice =
            this.average(recent);

        const normalizedRange =
            averagePrice === 0
                ? 0
                : range / averagePrice;

        const atrRatio =
            averagePrice === 0
                ? 0
                : atr / averagePrice;

        if (
            adx.adx < this.config.sidewaysAdx &&
            normalizedRange < 0.0035
        ) {

            return "SIDEWAYS";

        }

        if (
            adx.adx >= this.config.strongTrendAdx
        ) {

            if (
                adx.plusDI >
                adx.minusDI
            ) {

                return "STRONG_UPTREND";

            }

            if (
                adx.minusDI >
                adx.plusDI
            ) {

                return "STRONG_DOWNTREND";

            }

        }

        if (
            bollinger &&
            bollinger.width > 0 &&
            atrRatio > 0.00015
        ) {

            return "VOLATILE";

        }

        return "TRANSITION";

    }


    // =========================================================
    // VOLUME
    // =========================================================

    analyzeVolume(volumes) {

        if (
            !volumes ||
            volumes.length < 20
        ) {

            return {

                available: false,
                strength: 0,
                direction: "NEUTRAL"

            };

        }

        const clean =
            volumes
                .map(Number)
                .filter(Number.isFinite);

        if (clean.length < 20) {

            return {

                available: false,
                strength: 0,
                direction: "NEUTRAL"

            };

        }

        const current =
            this.last(clean);

        const average =
            this.average(
                clean.slice(-20, -1)
            );

        if (average === 0) {

            return {

                available: false,
                strength: 0,
                direction: "NEUTRAL"

            };

        }

        const ratio =
            current / average;

        return {

            available: true,

            strength:
                this.clamp(
                    (ratio - 1) / 2,
                    -1,
                    1
                ),

            direction:
                ratio >= 1.15
                    ? "STRONG"
                    : "NORMAL"

        };

    }


    // =========================================================
    // NO TRADE FILTER
    // =========================================================

    checkNoTradeFilters(
        regime,
        adx,
        candle,
        sr
    ) {

        if (
            regime === "SIDEWAYS"
        ) {

            return {
                pass: false,
                reason: "SIDEWAYS MARKET"
            };

        }

        if (
            adx.adx < 15
        ) {

            return {
                pass: false,
                reason: "VERY WEAK TREND"
            };

        }

        if (
            candle.pattern === "FLAT"
        ) {

            return {
                pass: false,
                reason: "FLAT CANDLE"
            };

        }

        if (
            candle.bodyRatio <
            this.config.minBodyRatio
        ) {

            return {
                pass: false,
                reason: "WEAK CANDLE"
            };

        }

        return {

            pass: true,
            reason: "FILTER PASSED"

        };

    }


    // =========================================================
    // MAIN ANALYSIS
    // =========================================================

    analyzeMarket(
        closes,
        highs,
        lows,
        volumes = [],
        opens = null
    ) {

        // -----------------------------------------------------
        // DATA VALIDATION
        // -----------------------------------------------------

        if (
            !closes ||
            !highs ||
            !lows ||
            closes.length <
            this.config.minCandles
        ) {

            return {

                signal: "NO TRADE",

                score: 0,

                confidence: 0,

                reason:
                    "Insufficient market data",

                details: {

                    trend: "UNKNOWN",

                    marketRegime:
                        "UNKNOWN",

                    dataQuality:
                        "INSUFFICIENT"

                }

            };

        }


        // -----------------------------------------------------
        // OPEN DATA FALLBACK
        // -----------------------------------------------------

        if (
            !opens ||
            opens.length !== closes.length
        ) {

            opens = closes.map(
                (close, i) => {

                    if (i === 0) {
                        return close;
                    }

                    return closes[i - 1];

                }
            );

        }


        // -----------------------------------------------------
        // INDICATORS
        // -----------------------------------------------------

        const ema9 =
            this.calculateEMA(
                closes,
                9
            );

        const ema21 =
            this.calculateEMA(
                closes,
                21
            );

        const ema50 =
            this.calculateEMA(
                closes,
                50
            );

        const price =
            this.last(closes);

        const e9 =
            this.last(ema9);

        const e21 =
            this.last(ema21);

        const e50 =
            this.last(ema50);


        const rsi =
            this.calculateRSI(
                closes,
                14
            );


        const macd =
            this.calculateMACD(
                closes
            );


        const adx =
            this.calculateADX(
                highs,
                lows,
                closes,
                14
            );


        const atr =
            this.calculateATR(
                highs,
                lows,
                closes,
                14
            );


        const bollinger =
            this.calculateBollinger(
                closes,
                20
            );


        const sr =
            this.calculateSupportResistance(
                highs,
                lows,
                closes
            );


        const candle =
            this.analyzeLastCandles(
                opens,
                highs,
                lows,
                closes
            );


        const structure =
            this.analyzeStructure(
                highs,
                lows
            );


        const volume =
            this.analyzeVolume(
                volumes
            );


        const regime =
            this.detectMarketRegime(
                closes,
                highs,
                lows,
                adx,
                atr,
                bollinger
            );


        // -----------------------------------------------------
        // TREND
        // -----------------------------------------------------

        let trendDirection =
            "NEUTRAL";

        let trendStrength = 0;

        if (
            e9 > e21 &&
            e21 > e50 &&
            price > e9
        ) {

            trendDirection =
                "UP";

            trendStrength = 1;

        } else if (
            e9 < e21 &&
            e21 < e50 &&
            price < e9
        ) {

            trendDirection =
                "DOWN";

            trendStrength = 1;

        } else {

            if (
                e9 > e21 &&
                price > e21
            ) {

                trendDirection =
                    "UP";

                trendStrength = 0.5;

            } else if (
                e9 < e21 &&
                price < e21
            ) {

                trendDirection =
                    "DOWN";

                trendStrength = 0.5;

            }

        }


        // -----------------------------------------------------
        // SCORE SYSTEM
        // -----------------------------------------------------

        let upScore = 0;
        let downScore = 0;


        // TREND
        if (trendDirection === "UP") {

            upScore +=
                this.weights.trend *
                trendStrength;

        }

        if (trendDirection === "DOWN") {

            downScore +=
                this.weights.trend *
                trendStrength;

        }


        // MOMENTUM - RSI
        if (
            rsi >= 52 &&
            rsi <= 70
        ) {

            upScore +=
                this.weights.momentum;

        } else if (
            rsi <= 48 &&
            rsi >= 30
        ) {

            downScore +=
                this.weights.momentum;

        }


        // MACD
        if (
            macd.histogram > 0
        ) {

            upScore +=
                this.weights.macd;

        } else if (
            macd.histogram < 0
        ) {

            downScore +=
                this.weights.macd;

        }


        // STRUCTURE
        if (
            structure.trend === "BULLISH"
        ) {

            upScore +=
                this.weights.structure;

        } else if (
            structure.trend === "BEARISH"
        ) {

            downScore +=
                this.weights.structure;

        }


        // SUPPORT / RESISTANCE
        if (
            sr.position === "NEAR_SUPPORT" &&
            candle.direction === "BULLISH"
        ) {

            upScore +=
                this.weights.supportResistance;

        } else if (
            sr.position === "NEAR_RESISTANCE" &&
            candle.direction === "BEARISH"
        ) {

            downScore +=
                this.weights.supportResistance;

        } else {

            if (
                trendDirection === "UP"
            ) {

                upScore +=
                    this.weights.supportResistance * 0.5;

            }

            if (
                trendDirection === "DOWN"
            ) {

                downScore +=
                    this.weights.supportResistance * 0.5;

            }

        }


        // CANDLE CONFIRMATION
        if (
            candle.direction === "BULLISH" &&
            candle.bodyRatio >= 0.5
        ) {

            upScore +=
                this.weights.candle;

        }

        if (
            candle.direction === "BEARISH" &&
            candle.bodyRatio >= 0.5
        ) {

            downScore +=
                this.weights.candle;

        }


        // REJECTION CANDLE
        if (
            candle.pattern ===
            "BULLISH_REJECTION"
        ) {

            upScore +=
                this.weights.candle * 0.5;

        }

        if (
            candle.pattern ===
            "BEARISH_REJECTION"
        ) {

            downScore +=
                this.weights.candle * 0.5;

        }


        // VOLUME
        if (volume.available) {

            if (
                volume.strength > 0 &&
                candle.direction === "BULLISH"
            ) {

                upScore +=
                    this.weights.volume;

            }

            if (
                volume.strength > 0 &&
                candle.direction === "BEARISH"
            ) {

                downScore +=
                    this.weights.volume;

            }

        }


        // REGIME
        if (
            regime === "STRONG_UPTREND"
        ) {

            upScore +=
                this.weights.regime;

        }

        if (
            regime === "STRONG_DOWNTREND"
        ) {

            downScore +=
                this.weights.regime;

        }


        // -----------------------------------------------------
        // NO TRADE FILTER
        // -----------------------------------------------------

        const filter =
            this.checkNoTradeFilters(
                regime,
                adx,
                candle,
                sr
            );


        if (!filter.pass) {

            return {

                signal: "NO TRADE",

                score: 0,

                confidence: 0,

                reason: filter.reason,

                details: {

                    trend:
                        trendDirection,

                    marketRegime:
                        regime,

                    rsi:
                        Number(rsi.toFixed(2)),

                    adx:
                        Number(adx.adx.toFixed(2)),

                    macd:
                        Number(
                            macd.histogram.toFixed(8)
                        ),

                    structure:
                        structure.trend,

                    candle:
                        candle.pattern,

                    support:
                        sr.support,

                    resistance:
                        sr.resistance

                }

            };

        }


        // -----------------------------------------------------
        // FINAL DIRECTION
        // -----------------------------------------------------

        const totalScore =
            upScore + downScore;

        if (
            totalScore === 0
        ) {

            return {

                signal: "NO TRADE",

                score: 0,

                confidence: 0,

                reason:
                    "No directional agreement",

                details: {

                    trend:
                        trendDirection,

                    marketRegime:
                        regime

                }

            };

        }


        let direction;

        let winningScore;

        let losingScore;


        if (
            upScore > downScore
        ) {

            direction = "UP";

            winningScore = upScore;
            losingScore = downScore;

        } else if (
            downScore > upScore
        ) {

            direction = "DOWN";

            winningScore = downScore;
            losingScore = upScore;

        } else {

            return {

                signal: "NO TRADE",

                score: 0,

                confidence: 0,

                reason:
                    "Directional conflict",

                details: {

                    trend:
                        trendDirection,

                    marketRegime:
                        regime

                }

            };

        }


        // -----------------------------------------------------
        // AGREEMENT
        // -----------------------------------------------------

        const agreement =
            winningScore /
            Math.max(totalScore, 1);


        const edge =
            winningScore -
            losingScore;


        // -----------------------------------------------------
        // CONFIDENCE
        // -----------------------------------------------------

        let confidence =
            55 +
            (agreement * 30) +
            Math.min(edge * 0.35, 7);


        // Penalize weak ADX
        if (
            adx.adx < 20
        ) {

            confidence -= 8;

        }


        // Penalize neutral RSI
        if (
            rsi > 47 &&
            rsi < 53
        ) {

            confidence -= 7;

        }


        // Penalize tiny candle
        if (
            candle.bodyRatio < 0.35
        ) {

            confidence -= 6;

        }


        // Strong trend bonus
        if (
            adx.adx >= 25 &&
            (
                direction === "UP"
                    ? adx.plusDI > adx.minusDI
                    : adx.minusDI > adx.plusDI
            )
        ) {

            confidence += 5;

        }


        confidence =
            this.clamp(
                confidence,
                50,
                this.config.maxConfidence
            );


        // -----------------------------------------------------
        // FINAL QUALITY FILTER
        // -----------------------------------------------------

        if (
            confidence <
            this.config.minConfidence
        ) {

            return {

                signal: "NO TRADE",

                score:
                    Number(
                        confidence.toFixed(1)
                    ),

                confidence: 0,

                reason:
                    "Confidence below safe threshold",

                details: {

                    trend:
                        trendDirection,

                    marketRegime:
                        regime,

                    rsi:
                        Number(rsi.toFixed(2)),

                    adx:
                        Number(adx.adx.toFixed(2)),

                    upScore:
                        Number(upScore.toFixed(1)),

                    downScore:
                        Number(downScore.toFixed(1))

                }

            };

        }


        // -----------------------------------------------------
        // RESULT
        // -----------------------------------------------------

        return {

            signal:
                direction,

            score:
                Number(
                    confidence.toFixed(1)
                ),

            confidence:
                Number(
                    confidence.toFixed(1)
                ),

            reason:
                "Multiple independent signals aligned",

            details: {

                trend:
                    trendDirection,

                marketRegime:
                    regime,

                trendStrength:
                    trendStrength,

                ema9:
                    Number(e9.toFixed(6)),

                ema21:
                    Number(e21.toFixed(6)),

                ema50:
                    Number(e50.toFixed(6)),

                rsi:
                    Number(rsi.toFixed(2)),

                adx:
                    Number(adx.adx.toFixed(2)),

                plusDI:
                    Number(adx.plusDI.toFixed(2)),

                minusDI:
                    Number(adx.minusDI.toFixed(2)),

                macd:
                    Number(
                        macd.macd.toFixed(8)
                    ),

                macdSignal:
                    Number(
                        macd.signal.toFixed(8)
                    ),

                macdHistogram:
                    Number(
                        macd.histogram.toFixed(8)
                    ),

                structure:
                    structure.trend,

                candle:
                    candle.pattern,

                candleDirection:
                    candle.direction,

                bodyRatio:
                    Number(
                        candle.bodyRatio.toFixed(2)
                    ),

                support:
                    sr.support,

                resistance:
                    sr.resistance,

                srPosition:
                    sr.position,

                atr:
                    Number(
                        atr.toFixed(8)
                    ),

                volumeAvailable:
                    volume.available,

                upScore:
                    Number(
                        upScore.toFixed(1)
                    ),

                downScore:
                    Number(
                        downScore.toFixed(1)
                    )

            }

        };

    }

}


// =============================================================
// GLOBAL ENGINE
// =============================================================

window.btzEngine =
    new BTZEngine();

console.log(
    "FINORIX AI Prediction Engine 2.0 loaded successfully"
);
