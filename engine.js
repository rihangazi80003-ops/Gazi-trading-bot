/**
 * FINORIX AI - MARKET ANALYSIS ENGINE
 * Version: 2.0
 *
 * Features:
 * EMA 9/21/50
 * RSI 14
 * MACD 12/26/9
 * ADX 14
 * Bollinger Bands 20/2
 * ATR 14
 * Support / Resistance
 * Price Action
 * Candle Confirmation
 * Volume analysis
 * Market structure
 * No-trade filters
 *
 * IMPORTANT:
 * Confidence is a model score, NOT a guaranteed probability of winning.
 */

class BTZEngine {

    constructor() {
        this.weights = {
            trend: 20,
            momentum: 15,
            macd: 10,
            priceAction: 15,
            supportResistance: 15,
            volatility: 10,
            volume: 5,
            candleConfirmation: 10
        };

        this.minCandles = 60;
    }

    // =========================================================
    // BASIC HELPERS
    // =========================================================

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    last(arr) {
        return arr[arr.length - 1];
    }

    average(arr) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    stdDev(arr) {
        if (!arr.length) return 0;

        const mean = this.average(arr);

        const variance =
            arr.reduce((sum, value) => {
                return sum + Math.pow(value - mean, 2);
            }, 0) / arr.length;

        return Math.sqrt(variance);
    }

    // =========================================================
    // EMA
    // =========================================================

    calculateEMA(data, period) {

        if (!Array.isArray(data) || data.length === 0) {
            return [];
        }

        if (data.length < period) {
            return new Array(data.length).fill(this.average(data));
        }

        const k = 2 / (period + 1);

        const ema = [];
        let previous = this.average(data.slice(0, period));

        for (let i = 0; i < period - 1; i++) {
            ema.push(previous);
        }

        ema.push(previous);

        for (let i = period; i < data.length; i++) {

            const current =
                data[i] * k +
                previous * (1 - k);

            ema.push(current);

            previous = current;
        }

        return ema;
    }

    // =========================================================
    // RSI
    // =========================================================

    calculateRSI(closes, period = 14) {

        if (!Array.isArray(closes) || closes.length < period + 1) {
            return 50;
        }

        let gain = 0;
        let loss = 0;

        for (let i = 1; i <= period; i++) {

            const change = closes[i] - closes[i - 1];

            if (change > 0) {
                gain += change;
            } else {
                loss += Math.abs(change);
            }
        }

        let avgGain = gain / period;
        let avgLoss = loss / period;

        for (let i = period + 1; i < closes.length; i++) {

            const change = closes[i] - closes[i - 1];

            const currentGain = change > 0 ? change : 0;
            const currentLoss = change < 0 ? Math.abs(change) : 0;

            avgGain =
                ((avgGain * (period - 1)) + currentGain) / period;

            avgLoss =
                ((avgLoss * (period - 1)) + currentLoss) / period;
        }

        if (avgLoss === 0) {
            return avgGain > 0 ? 100 : 50;
        }

        const rs = avgGain / avgLoss;

        return 100 - (100 / (1 + rs));
    }

    // =========================================================
    // MACD
    // =========================================================

    calculateMACD(closes) {

        const ema12 = this.calculateEMA(closes, 12);
        const ema26 = this.calculateEMA(closes, 26);

        const macdLine = [];

        const offset = Math.max(
            0,
            ema26.length - ema12.length
        );

        for (let i = 0; i < ema26.length; i++) {

            const fastIndex = i + offset;

            macdLine.push(
                ema12[fastIndex] - ema26[i]
            );
        }

        const signalLine =
            this.calculateEMA(macdLine, 9);

        const histogram = [];

        for (let i = 0; i < macdLine.length; i++) {

            const signal =
                signalLine[i] !== undefined
                    ? signalLine[i]
                    : signalLine[signalLine.length - 1];

            histogram.push(
                macdLine[i] - signal
            );
        }

        return {
            macd: this.last(macdLine) || 0,
            signal: this.last(signalLine) || 0,
            histogram: this.last(histogram) || 0
        };
    }

    // =========================================================
    // TRUE RANGE
    // =========================================================

    calculateTrueRange(highs, lows, closes) {

        const tr = [];

        for (let i = 0; i < closes.length; i++) {

            if (i === 0) {
                tr.push(highs[i] - lows[i]);
                continue;
            }

            const range1 =
                highs[i] - lows[i];

            const range2 =
                Math.abs(highs[i] - closes[i - 1]);

            const range3 =
                Math.abs(lows[i] - closes[i - 1]);

            tr.push(
                Math.max(range1, range2, range3)
            );
        }

        return tr;
    }

    // =========================================================
    // ATR
    // =========================================================

    calculateATR(highs, lows, closes, period = 14) {

        const tr =
            this.calculateTrueRange(
                highs,
                lows,
                closes
            );

        if (tr.length < period) {
            return this.average(tr);
        }

        return this.average(
            tr.slice(-period)
        );
    }

    // =========================================================
    // ADX
    // =========================================================

    calculateADX(highs, lows, closes, period = 14) {

        if (closes.length < period + 2) {
            return 0;
        }

        const trs = [];
        const plusDM = [];
        const minusDM = [];

        for (let i = 1; i < closes.length; i++) {

            const upMove =
                highs[i] - highs[i - 1];

            const downMove =
                lows[i - 1] - lows[i];

            const tr = Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            );

            trs.push(tr);

            plusDM.push(
                upMove > downMove && upMove > 0
                    ? upMove
                    : 0
            );

            minusDM.push(
                downMove > upMove && downMove > 0
                    ? downMove
                    : 0
            );
        }

        const trAvg = this.average(
            trs.slice(-period)
        );

        const plusAvg = this.average(
            plusDM.slice(-period)
        );

        const minusAvg = this.average(
            minusDM.slice(-period)
        );

        if (trAvg === 0) {
            return 0;
        }

        const plusDI =
            (plusAvg / trAvg) * 100;

        const minusDI =
            (minusAvg / trAvg) * 100;

        const denominator =
            plusDI + minusDI;

        if (denominator === 0) {
            return 0;
        }

        return (
            Math.abs(plusDI - minusDI) /
            denominator
        ) * 100;
    }

    // =========================================================
    // BOLLINGER BANDS
    // =========================================================

    calculateBollinger(closes, period = 20, multiplier = 2) {

        if (closes.length < period) {
            return null;
        }

        const values =
            closes.slice(-period);

        const middle =
            this.average(values);

        const deviation =
            this.stdDev(values);

        return {
            middle,
            upper: middle + multiplier * deviation,
            lower: middle - multiplier * deviation,
            width:
                middle !== 0
                    ? ((multiplier * 2 * deviation) / middle) * 100
                    : 0
        };
    }

    // =========================================================
    // SUPPORT / RESISTANCE
    // =========================================================

    calculateSupportResistance(
        highs,
        lows,
        closes,
        lookback = 30
    ) {

        const start =
            Math.max(0, closes.length - lookback);

        const recentHighs =
            highs.slice(start);

        const recentLows =
            lows.slice(start);

        const resistance =
            Math.max(...recentHighs);

        const support =
            Math.min(...recentLows);

        const price =
            this.last(closes);

        const range =
            resistance - support;

        let nearSupport = false;
        let nearResistance = false;

        if (range > 0) {

            const supportDistance =
                Math.abs(price - support) / range;

            const resistanceDistance =
                Math.abs(resistance - price) / range;

            nearSupport =
                supportDistance <= 0.15;

            nearResistance =
                resistanceDistance <= 0.15;
        }

        return {
            support,
            resistance,
            nearSupport,
            nearResistance,
            range
        };
    }

    // =========================================================
    // CANDLE / PRICE ACTION
    // =========================================================

    analyzeCandle(
        open,
        high,
        low,
        close
    ) {

        const range =
            Math.max(high - low, Number.EPSILON);

        const body =
            Math.abs(close - open);

        const upperWick =
            high - Math.max(open, close);

        const lowerWick =
            Math.min(open, close) - low;

        const bodyRatio =
            body / range;

        const bullish =
            close > open;

        const bearish =
            close < open;

        const strongBull =
            bullish && bodyRatio >= 0.55;

        const strongBear =
            bearish && bodyRatio >= 0.55;

        const bullishRejection =
            lowerWick > body * 1.5 &&
            close > open;

        const bearishRejection =
            upperWick > body * 1.5 &&
            close < open;

        return {
            range,
            body,
            bodyRatio,
            bullish,
            bearish,
            strongBull,
            strongBear,
            bullishRejection,
            bearishRejection
        };
    }

    // =========================================================
    // MARKET STRUCTURE
    // =========================================================

    analyzeStructure(highs, lows) {

        if (highs.length < 5 || lows.length < 5) {
            return {
                bullish: false,
                bearish: false,
                neutral: true
            };
        }

        const n = highs.length;

        const h1 = highs[n - 1];
        const h2 = highs[n - 2];

        const l1 = lows[n - 1];
        const l2 = lows[n - 2];

        const bullish =
            h1 > h2 &&
            l1 > l2;

        const bearish =
            h1 < h2 &&
            l1 < l2;

        return {
            bullish,
            bearish,
            neutral: !bullish && !bearish
        };
    }

    // =========================================================
    // VOLUME ANALYSIS
    // =========================================================

    analyzeVolume(volumes) {

        if (
            !Array.isArray(volumes) ||
            volumes.length < 10
        ) {
            return {
                available: false,
                increasing: false,
                ratio: 1
            };
        }

        const recent =
            volumes.slice(-5);

        const previous =
            volumes.slice(-10, -5);

        const recentAvg =
            this.average(recent);

        const previousAvg =
            this.average(previous);

        if (previousAvg === 0) {
            return {
                available: false,
                increasing: false,
                ratio: 1
            };
        }

        const ratio =
            recentAvg / previousAvg;

        return {
            available: true,
            increasing: ratio > 1.05,
            ratio
        };
    }

    // =========================================================
    // NO TRADE FILTERS
    // =========================================================

    checkNoTradeFilters(marketData) {

        if (marketData.insufficientData) {
            return {
                pass: false,
                reason: "Insufficient candle data"
            };
        }

        if (marketData.isSideways) {
            return {
                pass: false,
                reason: "Market Sideways"
            };
        }

        if (marketData.emaConflict) {
            return {
                pass: false,
                reason: "EMA Conflict"
            };
        }

        if (marketData.rsiNeutral) {
            return {
                pass: false,
                reason: "RSI Neutral"
            };
        }

        if (marketData.macdConflict) {
            return {
                pass: false,
                reason: "MACD Conflict"
            };
        }

        if (marketData.adxWeak) {
            return {
                pass: false,
                reason: "ADX Weak"
            };
        }

        if (marketData.candleTooSmall) {
            return {
                pass: false,
                reason: "Candle too small"
            };
        }

        return {
            pass: true,
            reason: "OK"
        };
    }

    // =========================================================
    // MAIN ANALYSIS
    // =========================================================

    analyzeMarket(
        closes,
        highs,
        lows,
        volumes = []
    ) {

        // -----------------------------------------------------
        // DATA VALIDATION
        // -----------------------------------------------------

        if (
            !Array.isArray(closes) ||
            !Array.isArray(highs) ||
            !Array.isArray(lows)
        ) {

            return {
                signal: "NO TRADE",
                score: 0,
                confidence: 0,
                reason: "Invalid market data"
            };
        }

        const length =
            Math.min(
                closes.length,
                highs.length,
                lows.length
            );

        if (length < this.minCandles) {

            return {
                signal: "NO TRADE",
                score: 0,
                confidence: 0,
                reason:
                    `Need at least ${this.minCandles} candles`
            };
        }

        // Keep arrays aligned
        closes = closes.slice(-length);
        highs = highs.slice(-length);
        lows = lows.slice(-length);

        if (volumes.length) {
            volumes = volumes.slice(-length);
        }

        // -----------------------------------------------------
        // INDICATORS
        // -----------------------------------------------------

        const ema9 =
            this.calculateEMA(closes, 9);

        const ema21 =
            this.calculateEMA(closes, 21);

        const ema50 =
            this.calculateEMA(closes, 50);

        const currentPrice =
            this.last(closes);

        const e9 =
            this.last(ema9);

        const e21 =
            this.last(ema21);

        const e50 =
            this.last(ema50);

        const previousE9 =
            ema9[ema9.length - 2];

        const previousE21 =
            ema21[ema21.length - 2];

        const rsi =
            this.calculateRSI(closes, 14);

        const macd =
            this.calculateMACD(closes);

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
                20,
                2
            );

        const sr =
            this.calculateSupportResistance(
                highs,
                lows,
                closes,
                30
            );

        const structure =
            this.analyzeStructure(
                highs,
                lows
            );

        const candle =
            this.analyzeCandle(
                closes[closes.length - 2],
                highs[highs.length - 1],
                lows[lows.length - 1],
                currentPrice
            );

        const volume =
            this.analyzeVolume(volumes);

        // -----------------------------------------------------
        // TREND
        // -----------------------------------------------------

        const emaBull =
            e9 > e21 && e21 > e50;

        const emaBear =
            e9 < e21 && e21 < e50;

        const priceAbove =
            currentPrice > e50;

        const priceBelow =
            currentPrice < e50;

        const trendUp =
            emaBull && priceAbove;

        const trendDown =
            emaBear && priceBelow;

        // -----------------------------------------------------
        // MOMENTUM
        // -----------------------------------------------------

        const momentumUp =
            rsi >= 52 &&
            rsi <= 72;

        const momentumDown =
            rsi <= 48 &&
            rsi >= 28;

        // -----------------------------------------------------
        // MACD
        // -----------------------------------------------------

        const macdUp =
            macd.macd > macd.signal &&
            macd.histogram > 0;

        const macdDown =
            macd.macd < macd.signal &&
            macd.histogram < 0;

        // -----------------------------------------------------
        // SIDEWAYS MARKET
        // -----------------------------------------------------

        const emaDistance =
            Math.abs(e9 - e21);

        const normalizedEmaDistance =
            currentPrice !== 0
                ? emaDistance / currentPrice
                : 0;

        const isSideways =
            adx < 18 &&
            normalizedEmaDistance < 0.0005;

        // -----------------------------------------------------
        // CANDLE QUALITY
        // -----------------------------------------------------

        const averageRange =
            this.average(
                highs.slice(-20)
                    .map((h, i) =>
                        h -
                        lows[lows.length - 20 + i]
                    )
            );

        const candleTooSmall =
            candle.range <
            averageRange * 0.35;

        // -----------------------------------------------------
        // CONFLICTS
        // -----------------------------------------------------

        const emaConflict =
            !emaBull && !emaBear;

        const rsiNeutral =
            rsi > 48 && rsi < 52;

        const macdConflict =
            !macdUp && !macdDown;

        const adxWeak =
            adx < 18;

        // -----------------------------------------------------
        // FILTER RESULT
        // -----------------------------------------------------

        const filter =
            this.checkNoTradeFilters({
                insufficientData: false,
                isSideways,
                emaConflict,
                rsiNeutral,
                macdConflict,
                adxWeak,
                candleTooSmall
            });

        // -----------------------------------------------------
        // SCORING
        // -----------------------------------------------------

        let upScore = 0;
        let downScore = 0;

        // Trend 20
        if (trendUp) {
            upScore += this.weights.trend;
        }

        if (trendDown) {
            downScore += this.weights.trend;
        }

        // Momentum 15
        if (momentumUp) {
            upScore += this.weights.momentum;
        }

        if (momentumDown) {
            downScore += this.weights.momentum;
        }

        // MACD 10
        if (macdUp) {
            upScore += this.weights.macd;
        }

        if (macdDown) {
            downScore += this.weights.macd;
        }

        // Price Action 15
        if (structure.bullish) {
            upScore += this.weights.priceAction;
        }

        if (structure.bearish) {
            downScore += this.weights.priceAction;
        }

        // Support / Resistance 15
        if (sr.nearSupport) {

            if (candle.bullishRejection) {
                upScore += this.weights.supportResistance;
            }

        } else if (sr.nearResistance) {

            if (candle.bearishRejection) {
                downScore += this.weights.supportResistance;
            }

        } else {

            // Neutral location gives only partial credit
            upScore += 3;
            downScore += 3;
        }

        // Volatility 10
        const atrPercent =
            currentPrice !== 0
                ? (atr / currentPrice) * 100
                : 0;

        const volatilityHealthy =
            atrPercent > 0.0002 &&
            atrPercent < 0.5;

        if (volatilityHealthy) {

            if (trendUp) {
                upScore += this.weights.volatility;
            }

            if (trendDown) {
                downScore += this.weights.volatility;
            }
        }

        // Volume 5
        if (volume.available && volume.increasing) {

            if (trendUp) {
                upScore += this.weights.volume;
            }

            if (trendDown) {
                downScore += this.weights.volume;
            }
        }

        // Candle confirmation 10
        if (
            candle.strongBull ||
            candle.bullishRejection
        ) {
            upScore += this.weights.candleConfirmation;
        }

        if (
            candle.strongBear ||
            candle.bearishRejection
        ) {
            downScore += this.weights.candleConfirmation;
        }

        // -----------------------------------------------------
        // FINAL DECISION
        // -----------------------------------------------------

        const bestScore =
            Math.max(upScore, downScore);

        const difference =
            Math.abs(upScore - downScore);

        let signal = "NO TRADE";

        if (
            filter.pass &&
            bestScore >= 65 &&
            difference >= 12
        ) {

            signal =
                upScore > downScore
                    ? "UP"
                    : "DOWN";
        }

        // -----------------------------------------------------
        // CONFIDENCE
        // -----------------------------------------------------

        let confidence = 0;

        if (signal !== "NO TRADE") {

            const totalPossible =
                this.weights.trend +
                this.weights.momentum +
                this.weights.macd +
                this.weights.priceAction +
                this.weights.supportResistance +
                this.weights.volatility +
                this.weights.volume +
                this.weights.candleConfirmation;

            const raw =
                (bestScore / totalPossible) * 100;

            const separation =
                this.clamp(
                    difference * 0.35,
                    0,
                    8
                );

            confidence =
                Math.round(
                    this.clamp(
                        raw + separation,
                        50,
                        95
                    )
                );
        }

        // -----------------------------------------------------
        // DETAILS
        // -----------------------------------------------------

        let trendText = "Neutral";

        if (trendUp) {
            trendText = "Bullish";
        } else if (trendDown) {
            trendText = "Bearish";
        }

        let momentumText = "Neutral";

        if (momentumUp) {
            momentumText = "Bullish";
        } else if (momentumDown) {
            momentumText = "Bearish";
        }

        let structureText = "Range";

        if (structure.bullish) {
            structureText = "Bullish HH/HL";
        } else if (structure.bearish) {
            structureText = "Bearish LH/LL";
        }

        let volatilityText = "Normal";

        if (isSideways) {
            volatilityText = "Low / Sideways";
        } else if (volatilityHealthy) {
            volatilityText = "Healthy";
        }

        return {

            signal,

            score: Math.round(bestScore),

            confidence,

            reason:
                signal === "NO TRADE"
                    ? filter.reason ||
                      "Signals are not sufficiently aligned"
                    : "Multi-factor confirmation",

            details: {

                trend: trendText,

                momentum: momentumText,

                structure: structureText,

                srStatus:
                    sr.nearSupport
                        ? "Near Support"
                        : sr.nearResistance
                            ? "Near Resistance"
                            : "Neutral",

                volatility: volatilityText,

                rsi:
                    Number(rsi.toFixed(2)),

                macd:
                    Number(macd.macd.toFixed(6)),

                macdSignal:
                    Number(macd.signal.toFixed(6)),

                macdHistogram:
                    Number(macd.histogram.toFixed(6)),

                adx:
                    Number(adx.toFixed(2)),

                atr:
                    Number(atr.toFixed(6)),

                ema9:
                    Number(e9.toFixed(6)),

                ema21:
                    Number(e21.toFixed(6)),

                ema50:
                    Number(e50.toFixed(6)),

                upScore:
                    Math.round(upScore),

                downScore:
                    Math.round(downScore),

                bullishTrend:
                    trendUp,

                bearishTrend:
                    trendDown,

                macdBullish:
                    macdUp,

                macdBearish:
                    macdDown,

                volumeAvailable:
                    volume.available,

                volumeIncreasing:
                    volume.increasing,

                sideways:
                    isSideways
            }
        };
    }
}


// =============================================================
// GLOBAL EXPORT
// =============================================================

window.btzEngine = new BTZEngine();
