/**
 * FINORIX / BTZ Prediction Engine
 * Version: 2.0
 *
 * Purpose:
 * - 1-minute next-candle directional analysis
 * - Trend detection
 * - Sideways/range detection
 * - EMA 9/21/50
 * - RSI
 * - MACD
 * - ATR
 * - ADX
 * - Bollinger Bands
 * - Support / Resistance
 * - Candle confirmation
 * - Multi-factor scoring
 * - NO TRADE protection
 *
 * IMPORTANT:
 * Confidence is a model score, NOT a guaranteed probability.
 */

class BTZEngine {

    constructor() {

        this.config = {

            // Minimum historical candles required
            minCandles: 60,

            // Signal threshold
            minimumScore: 68,

            // Strong signal threshold
            strongScore: 80,

            // Sideways detection
            sidewaysADX: 18,
            sidewaysRangeATR: 4.0,

            // Trend detection
            trendADX: 20,

            // RSI
            rsiPeriod: 14,

            // EMA
            emaFast: 9,
            emaMedium: 21,
            emaSlow: 50,

            // MACD
            macdFast: 12,
            macdSlow: 26,
            macdSignal: 9,

            // ATR
            atrPeriod: 14,

            // ADX
            adxPeriod: 14,

            // Bollinger
            bbPeriod: 20,
            bbStdDev: 2,

            // Recent structure
            structureLookback: 8,

            // S/R
            srLookback: 30,

            // Candle confirmation
            candleLookback: 3
        };
    }


    // =========================================================
    // BASIC HELPERS
    // =========================================================

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    average(values) {

        if (!values.length) return 0;

        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    standardDeviation(values) {

        if (!values.length) return 0;

        const avg = this.average(values);

        const variance = this.average(
            values.map(v => Math.pow(v - avg, 2))
        );

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
            return data.slice();
        }

        const k = 2 / (period + 1);

        const result = [];

        let ema = this.average(data.slice(0, period));

        for (let i = 0; i < period - 1; i++) {
            result.push(null);
        }

        result.push(ema);

        for (let i = period; i < data.length; i++) {

            ema = data[i] * k + ema * (1 - k);

            result.push(ema);
        }

        return result;
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

            const change = closes[i] - closes[i - 1];

            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        for (let i = period + 1; i < closes.length; i++) {

            const change = closes[i] - closes[i - 1];

            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;

            avgGain =
                ((avgGain * (period - 1)) + gain) / period;

            avgLoss =
                ((avgLoss * (period - 1)) + loss) / period;
        }

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;

        return 100 - (100 / (1 + rs));
    }


    // =========================================================
    // MACD
    // =========================================================

    calculateMACD(
        closes,
        fastPeriod = 12,
        slowPeriod = 26,
        signalPeriod = 9
    ) {

        const fast = this.calculateEMA(closes, fastPeriod);
        const slow = this.calculateEMA(closes, slowPeriod);

        const macd = [];

        for (let i = 0; i < closes.length; i++) {

            if (
                fast[i] == null ||
                slow[i] == null
            ) {
                macd.push(null);
            } else {
                macd.push(fast[i] - slow[i]);
            }
        }

        const cleanMACD = macd.filter(v => v != null);

        const signalArray =
            this.calculateEMA(cleanMACD, signalPeriod);

        const currentMACD =
            cleanMACD[cleanMACD.length - 1] || 0;

        const previousMACD =
            cleanMACD[cleanMACD.length - 2] || currentMACD;

        const currentSignal =
            signalArray[signalArray.length - 1] || 0;

        const previousSignal =
            signalArray[signalArray.length - 2] || currentSignal;

        return {

            macd: currentMACD,

            signal: currentSignal,

            histogram: currentMACD - currentSignal,

            previousHistogram:
                previousMACD - previousSignal
        };
    }


    // =========================================================
    // TRUE RANGE
    // =========================================================

    calculateTrueRanges(highs, lows, closes) {

        const tr = [];

        for (let i = 0; i < highs.length; i++) {

            if (i === 0) {

                tr.push(highs[i] - lows[i]);

                continue;
            }

            const range1 = highs[i] - lows[i];

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

        if (highs.length < period + 1) {
            return 0;
        }

        const tr =
            this.calculateTrueRanges(
                highs,
                lows,
                closes
            );

        const recent =
            tr.slice(-period);

        return this.average(recent);
    }


    // =========================================================
    // ADX
    // =========================================================

    calculateADX(
        highs,
        lows,
        closes,
        period = 14
    ) {

        if (highs.length < period * 2) {
            return {
                adx: 0,
                plusDI: 0,
                minusDI: 0
            };
        }

        const tr = [];
        const plusDM = [];
        const minusDM = [];

        for (let i = 1; i < highs.length; i++) {

            const upMove =
                highs[i] - highs[i - 1];

            const downMove =
                lows[i - 1] - lows[i];

            const trueRange = Math.max(
                highs[i] - lows[i],
                Math.abs(
                    highs[i] - closes[i - 1]
                ),
                Math.abs(
                    lows[i] - closes[i - 1]
                )
            );

            tr.push(trueRange);

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

        const recentTR =
            this.average(tr.slice(-period));

        const recentPlus =
            this.average(plusDM.slice(-period));

        const recentMinus =
            this.average(minusDM.slice(-period));

        if (recentTR === 0) {

            return {
                adx: 0,
                plusDI: 0,
                minusDI: 0
            };
        }

        const plusDI =
            (recentPlus / recentTR) * 100;

        const minusDI =
            (recentMinus / recentTR) * 100;

        const dx =
            ((Math.abs(plusDI - minusDI)) /
                Math.max(plusDI + minusDI, 0.000001))
            * 100;

        return {

            adx: dx,

            plusDI,

            minusDI
        };
    }


    // =========================================================
    // BOLLINGER BANDS
    // =========================================================

    calculateBollinger(
        closes,
        period = 20,
        multiplier = 2
    ) {

        if (closes.length < period) {

            return {
                middle: closes[closes.length - 1],
                upper: closes[closes.length - 1],
                lower: closes[closes.length - 1],
                width: 0
            };
        }

        const recent =
            closes.slice(-period);

        const middle =
            this.average(recent);

        const sd =
            this.standardDeviation(recent);

        const upper =
            middle + multiplier * sd;

        const lower =
            middle - multiplier * sd;

        const width =
            middle !== 0
                ? (upper - lower) / middle
                : 0;

        return {

            middle,

            upper,

            lower,

            width
        };
    }


    // =========================================================
    // MARKET STRUCTURE
    // =========================================================

    analyzeStructure(
        highs,
        lows,
        lookback = 8
    ) {

        const n = highs.length;

        if (n < lookback * 2) {

            return {
                trend: "NEUTRAL",
                strength: 0
            };
        }

        const recentHighs =
            highs.slice(-lookback);

        const previousHighs =
            highs.slice(-lookback * 2, -lookback);

        const recentLows =
            lows.slice(-lookback);

        const previousLows =
            lows.slice(-lookback * 2, -lookback);

        const recentHigh =
            Math.max(...recentHighs);

        const previousHigh =
            Math.max(...previousHighs);

        const recentLow =
            Math.min(...recentLows);

        const previousLow =
            Math.min(...previousLows);

        const bullish =
            recentHigh > previousHigh &&
            recentLow > previousLow;

        const bearish =
            recentHigh < previousHigh &&
            recentLow < previousLow;

        if (bullish) {

            return {
                trend: "BULLISH",
                strength: 1,
                higherHigh: true,
                higherLow: true
            };
        }

        if (bearish) {

            return {
                trend: "BEARISH",
                strength: 1,
                lowerHigh: true,
                lowerLow: true
            };
        }

        return {

            trend: "RANGE",

            strength: 0,

            higherHigh: false,

            higherLow: false,

            lowerHigh: false,

            lowerLow: false
        };
    }


    // =========================================================
    // SUPPORT / RESISTANCE
    // =========================================================

    calculateSR(
        highs,
        lows,
        closes,
        lookback = 30
    ) {

        const recentHighs =
            highs.slice(-lookback);

        const recentLows =
            lows.slice(-lookback);

        const resistance =
            Math.max(...recentHighs);

        const support =
            Math.min(...recentLows);

        const price =
            closes[closes.length - 1];

        const range =
            resistance - support;

        if (range <= 0) {

            return {
                support,
                resistance,
                nearSupport: false,
                nearResistance: false,
                position: 50
            };
        }

        const position =
            ((price - support) / range) * 100;

        const nearSupport =
            position <= 20;

        const nearResistance =
            position >= 80;

        return {

            support,

            resistance,

            nearSupport,

            nearResistance,

            position
        };
    }


    // =========================================================
    // CANDLE ANALYSIS
    // =========================================================

    analyzeCandles(
        opens,
        highs,
        lows,
        closes
    ) {

        const i = closes.length - 1;

        if (i < 2) {

            return {
                direction: "NEUTRAL",
                strength: 0,
                pattern: "INSUFFICIENT DATA"
            };
        }

        const open = opens[i];
        const high = highs[i];
        const low = lows[i];
        const close = closes[i];

        const body =
            Math.abs(close - open);

        const range =
            Math.max(high - low, 0.00000001);

        const upperWick =
            high - Math.max(open, close);

        const lowerWick =
            Math.min(open, close) - low;

        const bodyRatio =
            body / range;

        // Strong bullish candle
        if (
            close > open &&
            bodyRatio >= 0.60 &&
            close >= high - range * 0.20
        ) {

            return {

                direction: "UP",

                strength: 1,

                pattern: "STRONG BULLISH"
            };
        }

        // Strong bearish candle
        if (
            close < open &&
            bodyRatio >= 0.60 &&
            close <= low + range * 0.20
        ) {

            return {

                direction: "DOWN",

                strength: 1,

                pattern: "STRONG BEARISH"
            };
        }

        // Bullish rejection
        if (
            lowerWick > body * 1.5 &&
            lowerWick > upperWick
        ) {

            return {

                direction: "UP",

                strength: 0.6,

                pattern: "BULLISH REJECTION"
            };
        }

        // Bearish rejection
        if (
            upperWick > body * 1.5 &&
            upperWick > lowerWick
        ) {

            return {

                direction: "DOWN",

                strength: 0.6,

                pattern: "BEARISH REJECTION"
            };
        }

        // Doji / indecision
        if (bodyRatio < 0.20) {

            return {

                direction: "NEUTRAL",

                strength: 0,

                pattern: "DOJI / INDECISION"
            };
        }

        if (close > open) {

            return {

                direction: "UP",

                strength: 0.4,

                pattern: "BULLISH"
            };
        }

        return {

            direction: "DOWN",

            strength: 0.4,

            pattern: "BEARISH"
        };
    }


    // =========================================================
    // SIDEWAYS DETECTION
    // =========================================================

    detectSideways(
        closes,
        highs,
        lows,
        atr,
        adx
    ) {

        const lookback = 20;

        if (closes.length < lookback) {
            return false;
        }

        const recentHigh =
            Math.max(...highs.slice(-lookback));

        const recentLow =
            Math.min(...lows.slice(-lookback));

        const range =
            recentHigh - recentLow;

        const rangeInATR =
            atr > 0
                ? range / atr
                : 999;

        const weakTrend =
            adx < this.config.sidewaysADX;

        const tightRange =
            rangeInATR <= this.config.sidewaysRangeATR;

        return weakTrend && tightRange;
    }


    // =========================================================
    // DATA QUALITY
    // =========================================================

    validateData(
        closes,
        highs,
        lows,
        opens
    ) {

        if (
            !Array.isArray(closes) ||
            !Array.isArray(highs) ||
            !Array.isArray(lows) ||
            !Array.isArray(opens)
        ) {

            return {
                valid: false,
                reason: "Invalid market data"
            };
        }

        if (
            closes.length < this.config.minCandles
        ) {

            return {
                valid: false,
                reason:
                    `Need at least ${this.config.minCandles} candles`
            };
        }

        const length =
            Math.min(
                closes.length,
                highs.length,
                lows.length,
                opens.length
            );

        if (length < this.config.minCandles) {

            return {
                valid: false,
                reason: "OHLC data length mismatch"
            };
        }

        return {
            valid: true,
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
        volumes = [],
        opens = []
    ) {

        // -----------------------------------------------------
        // Compatibility:
        // Existing Finorix may call:
        // analyzeMarket(closes, highs, lows, volumes)
        //
        // If opens are unavailable, approximate them.
        // -----------------------------------------------------

        if (!opens || opens.length !== closes.length) {

            opens = closes.map((close, i) => {

                if (i === 0) return close;

                return closes[i - 1];
            });
        }


        // -----------------------------------------------------
        // Validate
        // -----------------------------------------------------

        const validation =
            this.validateData(
                closes,
                highs,
                lows,
                opens
            );

        if (!validation.valid) {

            return {

                signal: "NO TRADE",

                score: 0,

                confidence: 0,

                details: {

                    trend: "UNKNOWN",

                    momentum: "UNKNOWN",

                    structure: "UNKNOWN",

                    srStatus: "UNKNOWN",

                    volatility: "UNKNOWN",

                    marketState: "DATA ERROR"
                },

                reason: validation.reason
            };
        }


        // -----------------------------------------------------
        // Current price
        // -----------------------------------------------------

        const price =
            closes[closes.length - 1];


        // -----------------------------------------------------
        // EMA
        // -----------------------------------------------------

        const ema9 =
            this.calculateEMA(
                closes,
                this.config.emaFast
            );

        const ema21 =
            this.calculateEMA(
                closes,
                this.config.emaMedium
            );

        const ema50 =
            this.calculateEMA(
                closes,
                this.config.emaSlow
            );

        const e9 =
            ema9[ema9.length - 1];

        const e21 =
            ema21[ema21.length - 1];

        const e50 =
            ema50[ema50.length - 1];


        // -----------------------------------------------------
        // RSI
        // -----------------------------------------------------

        const rsi =
            this.calculateRSI(
                closes,
                this.config.rsiPeriod
            );


        // -----------------------------------------------------
        // MACD
        // -----------------------------------------------------

        const macd =
            this.calculateMACD(
                closes,
                this.config.macdFast,
                this.config.macdSlow,
                this.config.macdSignal
            );


        // -----------------------------------------------------
        // ATR
        // -----------------------------------------------------

        const atr =
            this.calculateATR(
                highs,
                lows,
                closes,
                this.config.atrPeriod
            );


        // -----------------------------------------------------
        // ADX
        // -----------------------------------------------------

        const adx =
            this.calculateADX(
                highs,
                lows,
                closes,
                this.config.adxPeriod
            );


        // -----------------------------------------------------
        // Bollinger
        // -----------------------------------------------------

        const bb =
            this.calculateBollinger(
                closes,
                this.config.bbPeriod,
                this.config.bbStdDev
            );


        // -----------------------------------------------------
        // Structure
        // -----------------------------------------------------

        const structure =
            this.analyzeStructure(
                highs,
                lows,
                this.config.structureLookback
            );


        // -----------------------------------------------------
        // Support / Resistance
        // -----------------------------------------------------

        const sr =
            this.calculateSR(
                highs,
                lows,
                closes,
                this.config.srLookback
            );


        // -----------------------------------------------------
        // Candle
        // -----------------------------------------------------

        const candle =
            this.analyzeCandles(
                opens,
                highs,
                lows,
                closes
            );


        // -----------------------------------------------------
        // SIDEWAYS
        // -----------------------------------------------------

        const isSideways =
            this.detectSideways(
                closes,
                highs,
                lows,
                atr,
                adx.adx
            );


        // =====================================================
        // DIRECTIONAL EVIDENCE
        // =====================================================

        let up = 0;
        let down = 0;


        // -----------------------------------------------------
        // 1. EMA TREND
        // -----------------------------------------------------

        if (
            e9 > e21 &&
            e21 > e50 &&
            price > e9
        ) {

            up += 25;

        } else if (
            e9 < e21 &&
            e21 < e50 &&
            price < e9
        ) {

            down += 25;

        } else {

            // Partial trend
            if (e9 > e21) up += 10;
            if (e9 < e21) down += 10;
        }


        // -----------------------------------------------------
        // 2. ADX TREND STRENGTH
        // -----------------------------------------------------

        if (adx.adx >= this.config.trendADX) {

            if (adx.plusDI > adx.minusDI) {

                up += 15;

            } else if (
                adx.minusDI > adx.plusDI
            ) {

                down += 15;
            }
        }


        // -----------------------------------------------------
        // 3. RSI MOMENTUM
        // -----------------------------------------------------

        if (rsi >= 52 && rsi <= 70) {

            up += 12;

        } else if (
            rsi >= 30 &&
            rsi <= 48
        ) {

            down += 12;
        }


        // Avoid chasing extreme RSI
        if (rsi > 78) {
            up -= 8;
        }

        if (rsi < 22) {
            down -= 8;
        }


        // -----------------------------------------------------
        // 4. MACD
        // -----------------------------------------------------

        if (
            macd.histogram > 0 &&
            macd.histogram >= macd.previousHistogram
        ) {

            up += 15;

        } else if (
            macd.histogram < 0 &&
            macd.histogram <= macd.previousHistogram
        ) {

            down += 15;
        }


        // -----------------------------------------------------
        // 5. MARKET STRUCTURE
        // -----------------------------------------------------

        if (structure.trend === "BULLISH") {

            up += 15;

        } else if (
            structure.trend === "BEARISH"
        ) {

            down += 15;
        }


        // -----------------------------------------------------
        // 6. CANDLE CONFIRMATION
        // -----------------------------------------------------

        if (candle.direction === "UP") {

            up += Math.round(
                10 * candle.strength
            );

        } else if (
            candle.direction === "DOWN"
        ) {

            down += Math.round(
                10 * candle.strength
            );
        }


        // -----------------------------------------------------
        // 7. S/R
        // -----------------------------------------------------

        if (sr.nearSupport) {

            if (candle.direction === "UP") {
                up += 8;
            }

        }

        if (sr.nearResistance) {

            if (candle.direction === "DOWN") {
                down += 8;
            }
        }


        // =====================================================
        // MARKET STATE
        // =====================================================

        let marketState = "NORMAL";

        if (isSideways) {

            marketState = "SIDEWAYS";

        } else if (
            adx.adx >= 25 &&
            e9 > e21 &&
            e21 > e50
        ) {

            marketState = "STRONG UPTREND";

        } else if (
            adx.adx >= 25 &&
            e9 < e21 &&
            e21 < e50
        ) {

            marketState = "STRONG DOWNTREND";

        } else if (
            e9 > e21
        ) {

            marketState = "UPTREND";

        } else if (
            e9 < e21
        ) {

            marketState = "DOWNTREND";
        }


        // =====================================================
        // SIDEWAYS = PROTECTIVE NO TRADE
        // =====================================================

        if (isSideways) {

            return {

                signal: "NO TRADE",

                score: 0,

                confidence: 0,

                details: {

                    trend:
                        "Sideways / Weak Trend",

                    momentum:
                        `RSI ${rsi.toFixed(1)}`,

                    structure:
                        "Range",

                    srStatus:
                        sr.nearSupport
                            ? "Near Support"
                            : sr.nearResistance
                                ? "Near Resistance"
                                : "Inside Range",

                    volatility:
                        `ATR ${atr.toFixed(6)}`,

                    marketState:
                        "SIDEWAYS",

                    ema9: e9,

                    ema21: e21,

                    ema50: e50,

                    rsi,

                    adx: adx.adx,

                    macd: macd.histogram,

                    candlePattern:
                        candle.pattern
                },

                reason:
                    "Sideways market detected — avoiding weak 1-minute signal"
            };
        }


        // =====================================================
        // FINAL DIRECTION
        // =====================================================

        up = this.clamp(up, 0, 100);

        down = this.clamp(down, 0, 100);

        const total =
            up + down;

        if (total <= 0) {

            return {

                signal: "NO TRADE",

                score: 0,

                confidence: 0,

                details: {

                    trend: "Neutral",

                    momentum: "Neutral",

                    structure: structure.trend,

                    marketState
                },

                reason:
                    "No directional evidence"
            };
        }


        const direction =
            up > down
                ? "UP"
                : down > up
                    ? "DOWN"
                    : "NO TRADE";


        const rawStrength =
            Math.max(up, down);


        const conflict =
            Math.abs(up - down);


        // =====================================================
        // CONFIDENCE
        // =====================================================

        let confidence =
            rawStrength * 0.70 +
            conflict * 0.30;


        // Strong ADX bonus
        if (adx.adx >= 25) {
            confidence += 4;
        }


        // Candle confirmation bonus
        if (
            candle.direction === direction &&
            candle.strength >= 0.6
        ) {
            confidence += 3;
        }


        // Extreme uncertainty penalty
        if (
            Math.abs(rsi - 50) < 3
        ) {
            confidence -= 5;
        }


        // Bollinger middle-zone uncertainty
        const bbPosition =
            bb.upper !== bb.lower
                ? (price - bb.lower) /
                    (bb.upper - bb.lower)
                : 0.5;

        if (
            bbPosition > 0.45 &&
            bbPosition < 0.55
        ) {
            confidence -= 3;
        }


        confidence =
            this.clamp(
                Math.round(confidence),
                0,
                96
            );


        // =====================================================
        // NO TRADE CONDITIONS
        // =====================================================

        if (
            direction === "NO TRADE" ||
            confidence < this.config.minimumScore ||
            conflict < 10
        ) {

            return {

                signal: "NO TRADE",

                score: confidence,

                confidence: 0,

                details: {

                    trend: marketState,

                    momentum:
                        `RSI ${rsi.toFixed(1)}`,

                    structure:
                        structure.trend,

                    srStatus:
                        sr.nearSupport
                            ? "Near Support"
                            : sr.nearResistance
                                ? "Near Resistance"
                                : "Neutral",

                    volatility:
                        `ATR ${atr.toFixed(6)}`,

                    marketState,

                    ema9: e9,

                    ema21: e21,

                    ema50: e50,

                    rsi,

                    adx: adx.adx,

                    macd: macd.histogram,

                    candlePattern:
                        candle.pattern
                },

                reason:
                    "Insufficient directional confirmation"
            };
        }


        // =====================================================
        // FINAL RESULT
        // =====================================================

        let strengthText =
            "Moderate";

        if (
            confidence >= this.config.strongScore
        ) {

            strengthText = "Strong";

        } else if (
            confidence >= 74
        ) {

            strengthText = "Good";
        }


        return {

            signal: direction,

            score: confidence,

            confidence,

            details: {

                trend:
                    direction === "UP"
                        ? "Bullish"
                        : "Bearish",

                momentum:
                    strengthText,

                structure:
                    structure.trend,

                srStatus:
                    sr.nearSupport
                        ? "Near Support"
                        : sr.nearResistance
                            ? "Near Resistance"
                            : "Neutral",

                volatility:
                    `ATR ${atr.toFixed(6)}`,

                marketState,

                ema9: e9,

                ema21: e21,

                ema50: e50,

                rsi,

                adx: adx.adx,

                plusDI: adx.plusDI,

                minusDI: adx.minusDI,

                macd: macd.macd,

                macdSignal: macd.signal,

                macdHistogram:
                    macd.histogram,

                bollingerPosition:
                    bbPosition,

                support:
                    sr.support,

                resistance:
                    sr.resistance,

                candlePattern:
                    candle.pattern,

                upScore: up,

                downScore: down
            },

            reason:
                "Multiple independent factors aligned"
        };
    }


    // =========================================================
    // NO TRADE FILTER
    // =========================================================

    checkNoTradeFilters(marketData) {

        if (!marketData) {

            return {
                pass: false,
                reason: "No market data"
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

        return {

            pass: true,

            reason: "OK"
        };
    }
}


// =============================================================
// GLOBAL EXPORT
// =============================================================

window.btzEngine = new BTZEngine();

console.log(
    "FINORIX Prediction Engine v2.0 loaded successfully"
);
