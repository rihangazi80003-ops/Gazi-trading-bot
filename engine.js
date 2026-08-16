/**
 * FINORIX AI - Prediction Engine
 * Version: 3.0
 *
 * REAL MARKET ANALYSIS ENGINE
 *
 * Input:
 *   OHLC + Volume
 *
 * Output:
 *   UP / DOWN / NO TRADE
 *
 * Indicators:
 *   EMA 9 / 21 / 50
 *   RSI 14
 *   MACD 12 / 26 / 9
 *   ADX 14 + DI
 *   ATR 14
 *   Bollinger Bands 20
 *   Support / Resistance
 *   Market Structure
 *   Candle Confirmation
 *   Volume Confirmation
 *   Market Regime
 *
 * IMPORTANT:
 * confidence != guaranteed accuracy
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

            structureLookback: 12,

            srLookback: 30,

            minCandles: 60,

            sidewaysAdx: 18,

            weakAdx: 15,

            strongAdx: 25,

            minBodyRatio: 0.25,

            minimumSignalScore: 58,

            minimumConfidence: 62,

            maximumConfidence: 92

        };


        this.weights = {

            trend: 20,

            momentum: 14,

            macd: 12,

            adx: 10,

            structure: 12,

            supportResistance: 8,

            candle: 10,

            volatility: 6,

            volume: 4,

            regime: 4

        };

    }


    // =========================================================
    // BASIC HELPERS
    // =========================================================

    clamp(value, min, max) {

        return Math.max(
            min,
            Math.min(max, value)
        );

    }


    last(array) {

        return array[
            array.length - 1
        ];

    }


    average(array) {

        if (
            !array ||
            array.length === 0
        ) {

            return 0;

        }

        return (
            array.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / array.length
        );

    }


    standardDeviation(array) {

        if (
            !array ||
            array.length === 0
        ) {

            return 0;

        }

        const avg =
            this.average(array);

        const variance =
            this.average(
                array.map(
                    value =>
                        Math.pow(
                            value - avg,
                            2
                        )
                )
            );

        return Math.sqrt(variance);

    }


    // =========================================================
    // EMA
    // =========================================================

    calculateEMA(data, period) {

        if (
            !Array.isArray(data) ||
            data.length === 0
        ) {

            return [];

        }

        if (
            data.length < period
        ) {

            return new Array(
                data.length
            ).fill(
                this.average(data)
            );

        }

        const multiplier =
            2 / (period + 1);

        const result =
            new Array(data.length);

        let ema =
            this.average(
                data.slice(
                    0,
                    period
                )
            );

        for (
            let i = 0;
            i < period - 1;
            i++
        ) {

            result[i] = ema;

        }

        result[period - 1] = ema;

        for (
            let i = period;
            i < data.length;
            i++
        ) {

            ema =
                (
                    data[i] - ema
                ) *
                multiplier +
                ema;

            result[i] = ema;

        }

        return result;

    }


    // =========================================================
    // RSI
    // =========================================================

    calculateRSISeries(
        closes,
        period = 14
    ) {

        const result =
            new Array(
                closes.length
            ).fill(50);

        if (
            closes.length <
            period + 1
        ) {

            return result;

        }

        let gain = 0;
        let loss = 0;

        for (
            let i = 1;
            i <= period;
            i++
        ) {

            const change =
                closes[i] -
                closes[i - 1];

            if (change > 0) {

                gain += change;

            } else {

                loss +=
                    Math.abs(change);

            }

        }

        let avgGain =
            gain / period;

        let avgLoss =
            loss / period;

        let rsi;

        if (avgLoss === 0) {

            rsi = 100;

        } else {

            const rs =
                avgGain / avgLoss;

            rsi =
                100 -
                (
                    100 /
                    (1 + rs)
                );

        }

        result[period] = rsi;

        for (
            let i = period + 1;
            i < closes.length;
            i++
        ) {

            const change =
                closes[i] -
                closes[i - 1];

            const currentGain =
                change > 0
                    ? change
                    : 0;

            const currentLoss =
                change < 0
                    ? Math.abs(change)
                    : 0;

            avgGain =
                (
                    avgGain *
                    (period - 1) +
                    currentGain
                ) / period;

            avgLoss =
                (
                    avgLoss *
                    (period - 1) +
                    currentLoss
                ) / period;

            if (avgLoss === 0) {

                rsi = 100;

            } else {

                const rs =
                    avgGain /
                    avgLoss;

                rsi =
                    100 -
                    (
                        100 /
                        (1 + rs)
                    );

            }

            result[i] = rsi;

        }

        return result;

    }


    calculateRSI(
        closes,
        period = 14
    ) {

        const series =
            this.calculateRSISeries(
                closes,
                period
            );

        return this.last(series);

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

        const macdLine =
            closes.map(
                (_, i) =>
                    fast[i] -
                    slow[i]
            );

        const signalLine =
            this.calculateEMA(
                macdLine,
                this.config.macdSignal
            );

        const macd =
            this.last(macdLine);

        const signal =
            this.last(signalLine);

        const histogram =
            macd - signal;

        const previousHistogram =
            macdLine.length >= 2
                ? macdLine[
                    macdLine.length - 2
                  ] -
                  signalLine[
                    signalLine.length - 2
                  ]
                : 0;

        return {

            macd,

            signal,

            histogram,

            previousHistogram,

            bullish:
                histogram > 0,

            bearish:
                histogram < 0,

            rising:
                histogram >
                previousHistogram,

            falling:
                histogram <
                previousHistogram

        };

    }


    // =========================================================
    // ATR
    // =========================================================

    calculateATR(
        highs,
        lows,
        closes,
        period = 14
    ) {

        if (
            closes.length < 2
        ) {

            return 0;

        }

        const tr = [];

        for (
            let i = 1;
            i < closes.length;
            i++
        ) {

            const trueRange =
                Math.max(

                    highs[i] -
                    lows[i],

                    Math.abs(
                        highs[i] -
                        closes[i - 1]
                    ),

                    Math.abs(
                        lows[i] -
                        closes[i - 1]
                    )

                );

            tr.push(trueRange);

        }

        if (
            tr.length <
            period
        ) {

            return this.average(tr);

        }

        return this.average(
            tr.slice(-period)
        );

    }


    // =========================================================
    // ADX + DI
    // =========================================================

    calculateADX(
        highs,
        lows,
        closes,
        period = 14
    ) {

        const length =
            closes.length;

        if (
            length <
            period * 2 + 2
        ) {

            return {

                adx: 0,

                plusDI: 0,

                minusDI: 0,

                trend:
                    "UNKNOWN"

            };

        }

        const trueRanges = [];
        const plusDM = [];
        const minusDM = [];

        for (
            let i = 1;
            i < length;
            i++
        ) {

            const upMove =
                highs[i] -
                highs[i - 1];

            const downMove =
                lows[i - 1] -
                lows[i];

            const tr =
                Math.max(

                    highs[i] -
                    lows[i],

                    Math.abs(
                        highs[i] -
                        closes[i - 1]
                    ),

                    Math.abs(
                        lows[i] -
                        closes[i - 1]
                    )

                );

            trueRanges.push(tr);

            plusDM.push(
                upMove > downMove &&
                upMove > 0
                    ? upMove
                    : 0
            );

            minusDM.push(
                downMove > upMove &&
                downMove > 0
                    ? downMove
                    : 0
            );

        }

        let tr14 =
            this.average(
                trueRanges.slice(
                    0,
                    period
                )
            ) * period;

        let plus14 =
            this.average(
                plusDM.slice(
                    0,
                    period
                )
            ) * period;

        let minus14 =
            this.average(
                minusDM.slice(
                    0,
                    period
                )
            ) * period;

        const dxValues = [];

        let currentPlusDI = 0;
        let currentMinusDI = 0;

        for (
            let i = period;
            i < trueRanges.length;
            i++
        ) {

            if (
                i === period
            ) {

                // Initial smoothed values
                // already calculated above.

            } else {

                tr14 =
                    tr14 -
                    (
                        tr14 / period
                    ) +
                    trueRanges[i];

                plus14 =
                    plus14 -
                    (
                        plus14 / period
                    ) +
                    plusDM[i];

                minus14 =
                    minus14 -
                    (
                        minus14 / period
                    ) +
                    minusDM[i];

            }

            currentPlusDI =
                tr14 === 0
                    ? 0
                    : (
                        100 *
                        plus14 /
                        tr14
                    );

            currentMinusDI =
                tr14 === 0
                    ? 0
                    : (
                        100 *
                        minus14 /
                        tr14
                    );

            const diSum =
                currentPlusDI +
                currentMinusDI;

            const dx =
                diSum === 0
                    ? 0
                    : (
                        100 *
                        Math.abs(
                            currentPlusDI -
                            currentMinusDI
                        ) /
                        diSum
                    );

            dxValues.push(dx);

        }

        if (
            dxValues.length === 0
        ) {

            return {

                adx: 0,

                plusDI:
                    currentPlusDI,

                minusDI:
                    currentMinusDI,

                trend:
                    "UNKNOWN"

            };

        }

        const adx =
            dxValues.length >= period
                ? this.average(
                    dxValues.slice(-period)
                  )
                : this.average(dxValues);

        let trend =
            "NEUTRAL";

        if (
            currentPlusDI >
            currentMinusDI
        ) {

            trend = "BULLISH";

        } else if (
            currentMinusDI >
            currentPlusDI
        ) {

            trend = "BEARISH";

        }

        return {

            adx,

            plusDI:
                currentPlusDI,

            minusDI:
                currentMinusDI,

            trend

        };

    }


    // =========================================================
    // BOLLINGER BANDS
    // =========================================================

    calculateBollinger(
        closes,
        period = 20
    ) {

        if (
            closes.length <
            period
        ) {

            return null;

        }

        const values =
            closes.slice(-period);

        const middle =
            this.average(values);

        const sd =
            this.standardDeviation(
                values
            );

        const upper =
            middle +
            2 * sd;

        const lower =
            middle -
            2 * sd;

        const width =
            middle === 0
                ? 0
                : (
                    (upper - lower) /
                    middle
                );

        const price =
            this.last(closes);

        let position =
            "MIDDLE";

        if (
            price >= upper
        ) {

            position =
                "ABOVE_UPPER";

        } else if (
            price <= lower
        ) {

            position =
                "BELOW_LOWER";

        } else if (
            price >
            middle
        ) {

            position =
                "ABOVE_MIDDLE";

        } else if (
            price <
            middle
        ) {

            position =
                "BELOW_MIDDLE";

        }

        return {

            middle,

            upper,

            lower,

            width,

            position

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
            Math.min(
                this.config.srLookback,
                closes.length
            );

        const recentHighs =
            highs.slice(-lookback);

        const recentLows =
            lows.slice(-lookback);

        const resistance =
            Math.max(
                ...recentHighs
            );

        const support =
            Math.min(
                ...recentLows
            );

        const price =
            this.last(closes);

        const range =
            resistance -
            support;

        let position =
            "MIDDLE";

        let distanceToSupport = 0;
        let distanceToResistance = 0;

        if (
            range > 0
        ) {

            distanceToSupport =
                (
                    price -
                    support
                ) / range;

            distanceToResistance =
                (
                    resistance -
                    price
                ) / range;

            if (
                distanceToSupport <=
                0.20
            ) {

                position =
                    "NEAR_SUPPORT";

            } else if (
                distanceToResistance <=
                0.20
            ) {

                position =
                    "NEAR_RESISTANCE";

            }

        }

        return {

            support,

            resistance,

            range,

            position,

            distanceToSupport,

            distanceToResistance

        };

    }


    // =========================================================
    // CANDLE ANALYSIS
    // =========================================================

    analyzeLastCandle(
        opens,
        highs,
        lows,
        closes
    ) {

        const i =
            closes.length - 1;

        const open =
            opens[i];

        const high =
            highs[i];

        const low =
            lows[i];

        const close =
            closes[i];

        const range =
            high - low;

        const body =
            Math.abs(
                close - open
            );

        const bodyRatio =
            range === 0
                ? 0
                : body / range;

        const upperWick =
            high -
            Math.max(
                open,
                close
            );

        const lowerWick =
            Math.min(
                open,
                close
            ) -
            low;

        let direction =
            "NEUTRAL";

        if (
            close > open
        ) {

            direction =
                "BULLISH";

        } else if (
            close < open
        ) {

            direction =
                "BEARISH";

        }

        let pattern =
            "NORMAL";

        if (
            range === 0
        ) {

            pattern =
                "FLAT";

        } else if (
            bodyRatio < 0.20
        ) {

            pattern =
                "DOJI";

        } else if (
            lowerWick >
            body * 1.8 &&
            close >= open
        ) {

            pattern =
                "BULLISH_REJECTION";

        } else if (
            upperWick >
            body * 1.8 &&
            close <= open
        ) {

            pattern =
                "BEARISH_REJECTION";

        } else if (
            bodyRatio >= 0.60 &&
            close > open
        ) {

            pattern =
                "STRONG_BULLISH";

        } else if (
            bodyRatio >= 0.60 &&
            close < open
        ) {

            pattern =
                "STRONG_BEARISH";

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

        if (
            highs.length < 8
        ) {

            return {

                trend:
                    "UNKNOWN",

                strength: 0

            };

        }

        const h1 =
            highs[
                highs.length - 1
            ];

        const h2 =
            highs[
                highs.length - 3
            ];

        const h3 =
            highs[
                highs.length - 5
            ];

        const l1 =
            lows[
                lows.length - 1
            ];

        const l2 =
            lows[
                lows.length - 3
            ];

        const l3 =
            lows[
                lows.length - 5
            ];

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

                trend:
                    "BULLISH",

                strength: 1

            };

        }

        if (bearish) {

            return {

                trend:
                    "BEARISH",

                strength: 1

            };

        }

        return {

            trend:
                "RANGE",

            strength: 0

        };

    }


    // =========================================================
    // MARKET REGIME
    // =========================================================

    detectMarketRegime(
        closes,
        adx,
        atr,
        bollinger
    ) {

        const price =
            this.last(closes);

        const recent =
            closes.slice(-20);

        const high =
            Math.max(...recent);

        const low =
            Math.min(...recent);

        const range =
            high - low;

        const avgPrice =
            this.average(recent);

        const normalizedRange =
            avgPrice === 0
                ? 0
                : range /
                  avgPrice;

        const atrRatio =
            avgPrice === 0
                ? 0
                : atr /
                  avgPrice;

        if (
            adx.adx <
                this.config.sidewaysAdx &&
            normalizedRange <
                0.0035
        ) {

            return "SIDEWAYS";

        }

        if (
            adx.adx >=
            this.config.strongAdx
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
            (
                bollinger.width >
                0.004 ||
                atrRatio >
                0.00015
            )
        ) {

            return "VOLATILE";

        }

        return "TRANSITION";

    }


    // =========================================================
    // VOLUME
    // =========================================================

    analyzeVolume(
        volumes
    ) {

        if (
            !Array.isArray(volumes) ||
            volumes.length < 20
        ) {

            return {

                available:
                    false,

                ratio:
                    0,

                strength:
                    0,

                direction:
                    "NEUTRAL"

            };

        }

        const clean =
            volumes
                .map(Number)
                .filter(
                    Number.isFinite
                );

        if (
            clean.length < 20
        ) {

            return {

                available:
                    false,

                ratio:
                    0,

                strength:
                    0,

                direction:
                    "NEUTRAL"

            };

        }

        const current =
            this.last(clean);

        const avg =
            this.average(
                clean.slice(
                    -20,
                    -1
                )
            );

        if (
            avg <= 0
        ) {

            return {

                available:
                    false,

                ratio:
                    0,

                strength:
                    0,

                direction:
                    "NEUTRAL"

            };

        }

        const ratio =
            current / avg;

        let direction =
            "NORMAL";

        if (
            ratio >= 1.20
        ) {

            direction =
                "STRONG";

        }

        return {

            available:
                true,

            ratio,

            strength:
                this.clamp(
                    (ratio - 1) / 2,
                    -1,
                    1
                ),

            direction

        };

    }


    // =========================================================
    // NO TRADE FILTER
    // =========================================================

    checkNoTradeFilters(
        regime,
        adx,
        candle,
        rsi,
        macd
    ) {

        if (
            regime ===
            "SIDEWAYS"
        ) {

            return {

                pass:
                    false,

                reason:
                    "SIDEWAYS MARKET"

            };

        }

        if (
            adx.adx <
            this.config.weakAdx
        ) {

            return {

                pass:
                    false,

                reason:
                    "VERY WEAK TREND"

            };

        }

        if (
            candle.pattern ===
            "FLAT"
        ) {

            return {

                pass:
                    false,

                reason:
                    "FLAT CANDLE"

            };

        }

        if (
            candle.bodyRatio <
            this.config.minBodyRatio
        ) {

            return {

                pass:
                    false,

                reason:
                    "WEAK CANDLE"

            };

        }

        if (
            rsi >= 78 ||
            rsi <= 22
        ) {

            return {

                pass:
                    false,

                reason:
                    "EXTREME RSI"

            };

        }

        // Avoid direct MACD contradiction
        if (
            macd.histogram > 0 &&
            macd.falling
        ) {

            return {

                pass:
                    true,

                reason:
                    "MACD BULLISH BUT WEAKENING"

            };

        }

        if (
            macd.histogram < 0 &&
            macd.rising
        ) {

            return {

                pass:
                    true,

                reason:
                    "MACD BEARISH BUT RECOVERING"

            };

        }

        return {

            pass:
                true,

            reason:
                "FILTER PASSED"

        };

    }


    // =========================================================
    // SCORE NORMALIZATION
    // =========================================================

    addScore(
        direction,
        amount,
        scores
    ) {

        if (
            direction === "UP"
        ) {

            scores.up += amount;

        } else if (
            direction === "DOWN"
        ) {

            scores.down += amount;

        }

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
        // VALIDATION
        // -----------------------------------------------------

        if (
            !Array.isArray(closes) ||
            !Array.isArray(highs) ||
            !Array.isArray(lows)
        ) {

            return this.noTrade(
                "INVALID MARKET DATA"
            );

        }

        if (
            closes.length <
            this.config.minCandles
        ) {

            return this.noTrade(
                "INSUFFICIENT MARKET DATA"
            );

        }

        if (
            highs.length !==
            closes.length ||
            lows.length !==
            closes.length
        ) {

            return this.noTrade(
                "OHLC DATA LENGTH MISMATCH"
            );

        }


        // -----------------------------------------------------
        // OPEN FALLBACK
        // -----------------------------------------------------

        if (
            !Array.isArray(opens) ||
            opens.length !==
            closes.length
        ) {

            opens =
                closes.map(
                    (close, index) => {

                        if (
                            index === 0
                        ) {

                            return close;

                        }

                        return closes[
                            index - 1
                        ];

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
            this.analyzeLastCandle(
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
                adx,
                atr,
                bollinger
            );


        // -----------------------------------------------------
        // TREND
        // -----------------------------------------------------

        let trend =
            "NEUTRAL";

        let trendStrength =
            0;

        if (
            e9 > e21 &&
            e21 > e50 &&
            price > e9
        ) {

            trend =
                "UP";

            trendStrength =
                1;

        } else if (
            e9 < e21 &&
            e21 < e50 &&
            price < e9
        ) {

            trend =
                "DOWN";

            trendStrength =
                1;

        } else if (
            e9 > e21 &&
            price > e21
        ) {

            trend =
                "UP";

            trendStrength =
                0.55;

        } else if (
            e9 < e21 &&
            price < e21
        ) {

            trend =
                "DOWN";

            trendStrength =
                0.55;

        }


        // -----------------------------------------------------
        // SCORE
        // -----------------------------------------------------

        const scores = {

            up: 0,

            down: 0

        };


        // -----------------------------------------------------
        // TREND SCORE
        // -----------------------------------------------------

        this.addScore(
            trend,
            this.weights.trend *
            trendStrength,
            scores
        );


        // -----------------------------------------------------
        // RSI
        // -----------------------------------------------------

        if (
            rsi >= 52 &&
            rsi <= 68
        ) {

            this.addScore(
                "UP",
                this.weights.momentum,
                scores
            );

        } else if (
            rsi >= 32 &&
            rsi <= 48
        ) {

            this.addScore(
                "DOWN",
                this.weights.momentum,
                scores
            );

        }


        // -----------------------------------------------------
        // MACD
        // -----------------------------------------------------

        if (
            macd.histogram > 0 &&
            macd.rising
        ) {

            this.addScore(
                "UP",
                this.weights.macd,
                scores
            );

        } else if (
            macd.histogram < 0 &&
            macd.falling
        ) {

            this.addScore(
                "DOWN",
                this.weights.macd,
                scores
            );

        } else if (
            macd.histogram > 0
        ) {

            this.addScore(
                "UP",
                this.weights.macd * 0.6,
                scores
            );

        } else if (
            macd.histogram < 0
        ) {

            this.addScore(
                "DOWN",
                this.weights.macd * 0.6,
                scores
            );

        }


        // -----------------------------------------------------
        // ADX DIRECTION
        // -----------------------------------------------------

        if (
            adx.adx >=
            this.config.strongAdx
        ) {

            if (
                adx.plusDI >
                adx.minusDI
            ) {

                this.addScore(
                    "UP",
                    this.weights.adx,
                    scores
                );

            } else if (
                adx.minusDI >
                adx.plusDI
            ) {

                this.addScore(
                    "DOWN",
                    this.weights.adx,
                    scores
                );

            }

        } else if (
            adx.adx >=
            this.config.weakAdx
        ) {

            if (
                adx.plusDI >
                adx.minusDI
            ) {

                this.addScore(
                    "UP",
                    this.weights.adx * 0.5,
                    scores
                );

            } else if (
                adx.minusDI >
                adx.plusDI
            ) {

                this.addScore(
                    "DOWN",
                    this.weights.adx * 0.5,
                    scores
                );

            }

        }


        // -----------------------------------------------------
        // MARKET STRUCTURE
        // -----------------------------------------------------

        if (
            structure.trend ===
            "BULLISH"
        ) {

            this.addScore(
                "UP",
                this.weights.structure,
                scores
            );

        } else if (
            structure.trend ===
            "BEARISH"
        ) {

            this.addScore(
                "DOWN",
                this.weights.structure,
                scores
            );

        }


        // -----------------------------------------------------
        // SUPPORT / RESISTANCE
        // -----------------------------------------------------

        if (
            sr.position ===
            "NEAR_SUPPORT"
        ) {

            if (
                candle.direction ===
                "BULLISH"
            ) {

                this.addScore(
                    "UP",
                    this.weights.supportResistance,
                    scores
                );

            }

        } else if (
            sr.position ===
            "NEAR_RESISTANCE"
        ) {

            if (
                candle.direction ===
                "BEARISH"
            ) {

                this.addScore(
                    "DOWN",
                    this.weights.supportResistance,
                    scores
                );

            }

        }


        // -----------------------------------------------------
        // CANDLE
        // -----------------------------------------------------

        if (
            candle.direction ===
            "BULLISH" &&
            candle.bodyRatio >=
            0.50
        ) {

            this.addScore(
                "UP",
                this.weights.candle,
                scores
            );

        }

        if (
            candle.direction ===
            "BEARISH" &&
            candle.bodyRatio >=
            0.50
        ) {

            this.addScore(
                "DOWN",
                this.weights.candle,
                scores
            );

        }


        if (
            candle.pattern ===
            "BULLISH_REJECTION"
        ) {

            this.addScore(
                "UP",
                this.weights.candle * 0.5,
                scores
            );

        }

        if (
            candle.pattern ===
            "BEARISH_REJECTION"
        ) {

            this.addScore(
                "DOWN",
                this.weights.candle * 0.5,
                scores
            );

        }


        // -----------------------------------------------------
        // VOLUME
        // -----------------------------------------------------

        if (
            volume.available &&
            volume.ratio >= 1.15
        ) {

            if (
                candle.direction ===
                "BULLISH"
            ) {

                this.addScore(
                    "UP",
                    this.weights.volume,
                    scores
                );

            } else if (
                candle.direction ===
                "BEARISH"
            ) {

                this.addScore(
                    "DOWN",
                    this.weights.volume,
                    scores
                );

            }

        }


        // -----------------------------------------------------
        // REGIME
        // -----------------------------------------------------

        if (
            regime ===
            "STRONG_UPTREND"
        ) {

            this.addScore(
                "UP",
                this.weights.regime,
                scores
            );

        } else if (
            regime ===
            "STRONG_DOWNTREND"
        ) {

            this.addScore(
                "DOWN",
                this.weights.regime,
                scores
            );

        }


        // -----------------------------------------------------
        // NO TRADE FILTER
        // -----------------------------------------------------

        const filter =
            this.checkNoTradeFilters(
                regime,
                adx,
                candle,
                rsi,
                macd
            );

        if (
            !filter.pass
        ) {

            return this.buildResult({

                signal:
                    "NO TRADE",

                confidence:
                    0,

                reason:
                    filter.reason,

                scores,

                indicators: {

                    price,

                    ema9: e9,

                    ema21: e21,

                    ema50: e50,

                    rsi,

                    adx,

                    macd,

                    atr,

                    bollinger,

                    sr,

                    candle,

                    structure,

                    volume,

                    regime,

                    trend,

                    trendStrength

                }

            });

        }


        // -----------------------------------------------------
        // FINAL DIRECTION
        // -----------------------------------------------------

        const total =
            scores.up +
            scores.down;

        if (
            total <= 0
        ) {

            return this.buildResult({

                signal:
                    "NO TRADE",

                confidence:
                    0,

                reason:
                    "NO DIRECTIONAL AGREEMENT",

                scores,

                indicators: {

                    price,

                    ema9: e9,

                    ema21: e21,

                    ema50: e50,

                    rsi,

                    adx,

                    macd,

                    atr,

                    bollinger,

                    sr,

                    candle,

                    structure,

                    volume,

                    regime,

                    trend,

                    trendStrength

                }

            });

        }


        let signal =
            "NO TRADE";

        let winningScore =
            0;

        let losingScore =
            0;

        if (
            scores.up >
            scores.down
        ) {

            signal =
                "UP";

            winningScore =
                scores.up;

            losingScore =
                scores.down;

        } else if (
            scores.down >
            scores.up
        ) {

            signal =
                "DOWN";

            winningScore =
                scores.down;

            losingScore =
                scores.up;

        } else {

            return this.buildResult({

                signal:
                    "NO TRADE",

                confidence:
                    0,

                reason:
                    "DIRECTIONAL CONFLICT",

                scores,

                indicators: {

                    price,

                    rsi,

                    adx,

                    macd,

                    regime,

                    trend

                }

            });

        }


        // -----------------------------------------------------
        // AGREEMENT
        // -----------------------------------------------------

        const agreement =
            winningScore /
            Math.max(total, 1);

        const edge =
            winningScore -
            losingScore;


        // -----------------------------------------------------
        // CONFIDENCE
        // -----------------------------------------------------

        let confidence =
            50 +
            agreement * 32 +
            Math.min(
                edge * 0.35,
                8
            );


        // Weak trend penalty
        if (
            adx.adx <
            20
        ) {

            confidence -= 7;

        }


        // Strong trend bonus
        if (
            adx.adx >=
            25
        ) {

            const correctDI =
                signal === "UP"
                    ? adx.plusDI >
                      adx.minusDI
                    : adx.minusDI >
                      adx.plusDI;

            if (
                correctDI
            ) {

                confidence += 4;

            }

        }


        // RSI neutral penalty
        if (
            rsi > 47 &&
            rsi < 53
        ) {

            confidence -= 6;

        }


        // Weak candle penalty
        if (
            candle.bodyRatio <
            0.35
        ) {

            confidence -= 5;

        }


        // Structure agreement bonus
        if (
            (
                signal === "UP" &&
                structure.trend ===
                    "BULLISH"
            ) ||
            (
                signal === "DOWN" &&
                structure.trend ===
                    "BEARISH"
            )
        ) {

            confidence += 3;

        }


        // MACD agreement bonus
        if (
            (
                signal === "UP" &&
                macd.histogram > 0
            ) ||
            (
                signal === "DOWN" &&
                macd.histogram < 0
            )
        ) {

            confidence += 2;

        }


        confidence =
            this.clamp(
                confidence,
                50,
                this.config.maximumConfidence
            );


        // -----------------------------------------------------
        // MINIMUM SCORE
        // -----------------------------------------------------

        if (
            winningScore <
            this.config.minimumSignalScore
        ) {

            return this.buildResult({

                signal:
                    "NO TRADE",

                confidence:
                    0,

                reason:
                    "SIGNAL SCORE TOO LOW",

                scores,

                indicators: {

                    price,

                    ema9: e9,

                    ema21: e21,

                    ema50: e50,

                    rsi,

                    adx,

                    macd,

                    atr,

                    bollinger,

                    sr,

                    candle,

                    structure,

                    volume,

                    regime,

                    trend,

                    trendStrength

                }

            });

        }


        // -----------------------------------------------------
        // MINIMUM CONFIDENCE
        // -----------------------------------------------------

        if (
            confidence <
            this.config.minimumConfidence
        ) {

            return this.buildResult({

                signal:
                    "NO TRADE",

                confidence:
                    0,

                reason:
                    "CONFIDENCE BELOW SAFE THRESHOLD",

                scores,

                indicators: {

                    price,

                    ema9: e9,

                    ema21: e21,

                    ema50: e50,

                    rsi,

                    adx,

                    macd,

                    atr,

                    bollinger,

                    sr,

                    candle,

                    structure,

                    volume,

                    regime,

                    trend,

                    trendStrength

                }

            });

        }


        // -----------------------------------------------------
        // FINAL RESULT
        // -----------------------------------------------------

        return this.buildResult({

            signal,

            confidence,

            reason:
                "MULTIPLE MARKET FACTORS ALIGNED",

            scores,

            indicators: {

                price,

                ema9: e9,

                ema21: e21,

                ema50: e50,

                rsi,

                adx,

                macd,

                atr,

                bollinger,

                sr,

                candle,

                structure,

                volume,

                regime,

                trend,

                trendStrength

            }

        });

    }


    // =========================================================
    // RESULT BUILDER
    // =========================================================

    buildResult({
        signal,
        confidence,
        reason,
        scores,
        indicators
    }) {

        return {

            signal,

            confidence:
                Number(
                    confidence.toFixed(1)
                ),

            score:
                Number(
                    Math.max(
                        scores?.up || 0,
                        scores?.down || 0
                    ).toFixed(1)
                ),

            reason,

            details: {

                price:
                    indicators?.price ?? null,

                trend:
                    indicators?.trend ??
                    "UNKNOWN",

                trendStrength:
                    indicators?.trendStrength ??
                    0,

                marketRegime:
                    indicators?.regime ??
                    "UNKNOWN",

                ema9:
                    this.safeNumber(
                        indicators?.ema9
                    ),

                ema21:
                    this.safeNumber(
                        indicators?.ema21
                    ),

                ema50:
                    this.safeNumber(
                        indicators?.ema50
                    ),

                rsi:
                    this.safeNumber(
                        indicators?.rsi,
                        2
                    ),

                adx:
                    this.safeNumber(
                        indicators?.adx?.adx,
                        2
                    ),

                plusDI:
                    this.safeNumber(
                        indicators?.adx?.plusDI,
                        2
                    ),

                minusDI:
                    this.safeNumber(
                        indicators?.adx?.minusDI,
                        2
                    ),

                macd:
                    this.safeNumber(
                        indicators?.macd?.macd
                    ),

                macdSignal:
                    this.safeNumber(
                        indicators?.macd?.signal
                    ),

                macdHistogram:
                    this.safeNumber(
                        indicators?.macd?.histogram
                    ),

                structure:
                    indicators?.structure?.trend ??
                    "UNKNOWN",

                candle:
                    indicators?.candle?.pattern ??
                    "UNKNOWN",

                candleDirection:
                    indicators?.candle?.direction ??
                    "UNKNOWN",

                bodyRatio:
                    this.safeNumber(
                        indicators?.candle?.bodyRatio,
                        2
                    ),

                support:
                    indicators?.sr?.support ??
                    null,

                resistance:
                    indicators?.sr?.resistance ??
                    null,

                srPosition:
                    indicators?.sr?.position ??
                    "UNKNOWN",

                atr:
                    this.safeNumber(
                        indicators?.atr
                    ),

                bollingerPosition:
                    indicators?.bollinger?.position ??
                    "UNKNOWN",

                volumeAvailable:
                    indicators?.volume?.available ??
                    false,

                volumeRatio:
                    this.safeNumber(
                        indicators?.volume?.ratio,
                        2
                    ),

                upScore:
                    Number(
                        (
                            scores?.up ||
                            0
                        ).toFixed(1)
                    ),

                downScore:
                    Number(
                        (
                            scores?.down ||
                            0
                        ).toFixed(1)
                    )

            }

        };

    }


    // =========================================================
    // SAFE NUMBER
    // =========================================================

    safeNumber(
        value,
        decimals = 8
    ) {

        const number =
            Number(value);

        if (
            !Number.isFinite(number)
        ) {

            return null;

        }

        return Number(
            number.toFixed(
                decimals
            )
        );

    }


    // =========================================================
    // NO TRADE
    // =========================================================

    noTrade(reason) {

        return {

            signal:
                "NO TRADE",

            confidence:
                0,

            score:
                0,

            reason,

            details: {

                dataQuality:
                    "INSUFFICIENT"

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
    "FINORIX AI Prediction Engine 3.0 loaded successfully"
);
