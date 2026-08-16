/**
 * FINORIX AI - PRO PREDICTION ENGINE
 * ----------------------------------
 * Regime Detection:
 *   - UP TREND
 *   - DOWN TREND
 *   - SIDEWAYS
 *
 * Analysis:
 *   - EMA 9 / 21 / 50
 *   - EMA slope
 *   - RSI
 *   - MACD
 *   - ADX
 *   - ATR
 *   - Bollinger Bands
 *   - Support / Resistance
 *   - Candle strength
 *   - Candle patterns
 *   - Market structure
 *   - Volatility
 *
 * Important:
 * This engine does NOT guarantee prediction accuracy.
 * It is designed to reject weak/unclear setups instead
 * of manufacturing a high confidence number.
 */

class BTZEngine {

    constructor() {
        this.config = {
            emaFast: 9,
            emaMedium: 21,
            emaSlow: 50,

            rsiPeriod: 14,
            atrPeriod: 14,
            adxPeriod: 14,
            bbPeriod: 20,
            bbStd: 2,

            minCandles: 60,

            // 1-minute data freshness
            staleSeconds: 90,

            // Regime thresholds
            minADXTrend: 18,
            strongADXTrend: 25,

            // EMA separation
            minEMASpread: 0.000015,

            // Sideways detection
            sidewaysLookback: 20,
            sidewaysEfficiency: 0.28
        };
    }

    /* =========================================================
       BASIC HELPERS
       ========================================================= */

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    last(arr, n = 1) {
        return arr[arr.length - n];
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

    /* =========================================================
       EMA
       ========================================================= */

    calculateEMA(data, period) {

        if (!data || data.length === 0) return [];

        const k = 2 / (period + 1);

        const ema = [data[0]];

        for (let i = 1; i < data.length; i++) {
            ema.push(
                data[i] * k +
                ema[i - 1] * (1 - k)
            );
        }

        return ema;
    }

    /* =========================================================
       RSI - WILDER STYLE
       ========================================================= */

    calculateRSI(closes, period = 14) {

        if (!closes || closes.length < period + 1) {
            return 50;
        }

        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {

            const change = closes[i] - closes[i - 1];

            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        for (let i = period + 1; i < closes.length; i++) {

            const change = closes[i] - closes[i - 1];

            const gain = Math.max(change, 0);
            const loss = Math.max(-change, 0);

            avgGain =
                ((avgGain * (period - 1)) + gain) / period;

            avgLoss =
                ((avgLoss * (period - 1)) + loss) / period;
        }

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;

        return 100 - (100 / (1 + rs));
    }

    /* =========================================================
       MACD
       ========================================================= */

    calculateMACD(closes) {

        const ema12 = this.calculateEMA(closes, 12);
        const ema26 = this.calculateEMA(closes, 26);

        const macd = [];

        for (let i = 0; i < closes.length; i++) {
            macd.push(ema12[i] - ema26[i]);
        }

        const signal = this.calculateEMA(macd, 9);

        const lastMACD = this.last(macd);
        const lastSignal = this.last(signal);

        return {
            macd: lastMACD,
            signal: lastSignal,
            histogram: lastMACD - lastSignal,

            bullish: lastMACD > lastSignal,
            bearish: lastMACD < lastSignal
        };
    }

    /* =========================================================
       TRUE RANGE
       ========================================================= */

    calculateTR(highs, lows, closes) {

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

    /* =========================================================
       ATR
       ========================================================= */

    calculateATR(highs, lows, closes, period = 14) {

        if (closes.length < period + 1) {
            return 0;
        }

        const tr =
            this.calculateTR(highs, lows, closes);

        return this.average(
            tr.slice(-period)
        );
    }

    /* =========================================================
       ADX
       ========================================================= */

    calculateADX(highs, lows, closes, period = 14) {

        if (closes.length < period * 2 + 1) {
            return 20;
        }

        const trs = [];
        const plusDM = [];
        const minusDM = [];

        for (let i = 1; i < highs.length; i++) {

            const highDiff =
                highs[i] - highs[i - 1];

            const lowDiff =
                lows[i - 1] - lows[i];

            const tr = Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            );

            trs.push(tr);

            plusDM.push(
                highDiff > lowDiff && highDiff > 0
                    ? highDiff
                    : 0
            );

            minusDM.push(
                lowDiff > highDiff && lowDiff > 0
                    ? lowDiff
                    : 0
            );
        }

        const atr = this.average(trs.slice(-period));

        if (atr === 0) return 0;

        const plus =
            this.average(plusDM.slice(-period));

        const minus =
            this.average(minusDM.slice(-period));

        const plusDI = (plus / atr) * 100;
        const minusDI = (minus / atr) * 100;

        const denominator = plusDI + minusDI;

        if (denominator === 0) return 0;

        return Math.abs(
            ((plusDI - minusDI) / denominator) * 100
        );
    }

    /* =========================================================
       BOLLINGER BANDS
       ========================================================= */

    calculateBollinger(closes, period = 20, multiplier = 2) {

        if (closes.length < period) {
            return {
                middle: this.last(closes),
                upper: this.last(closes),
                lower: this.last(closes),
                width: 0
            };
        }

        const section =
            closes.slice(-period);

        const middle =
            this.average(section);

        const sd =
            this.stdDev(section);

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

    /* =========================================================
       MARKET EFFICIENCY
       Detects TREND vs SIDEWAYS
       ========================================================= */

    calculateEfficiency(closes, lookback = 20) {

        if (closes.length < lookback + 1) {
            return 0.5;
        }

        const data =
            closes.slice(-(lookback + 1));

        const netMove =
            Math.abs(
                data[data.length - 1] - data[0]
            );

        let totalMove = 0;

        for (let i = 1; i < data.length; i++) {
            totalMove += Math.abs(
                data[i] - data[i - 1]
            );
        }

        if (totalMove === 0) return 0;

        return netMove / totalMove;
    }

    /* =========================================================
       EMA SLOPE
       ========================================================= */

    calculateSlope(ema, lookback = 5) {

        if (ema.length <= lookback) {
            return 0;
        }

        return (
            ema[ema.length - 1] -
            ema[ema.length - 1 - lookback]
        );
    }

    /* =========================================================
       CANDLE ANALYSIS
       ========================================================= */

    analyzeLastCandle(open, high, low, close) {

        const range = high - low;

        if (range <= 0) {
            return {
                direction: "NEUTRAL",
                bodyRatio: 0,
                upperWickRatio: 0,
                lowerWickRatio: 0,
                strength: 0,
                bullish: false,
                bearish: false
            };
        }

        const body =
            Math.abs(close - open);

        const upperWick =
            high - Math.max(open, close);

        const lowerWick =
            Math.min(open, close) - low;

        const bodyRatio =
            body / range;

        const upperWickRatio =
            upperWick / range;

        const lowerWickRatio =
            lowerWick / range;

        const bullish = close > open;
        const bearish = close < open;

        let strength =
            bodyRatio * 100;

        if (bullish && lowerWickRatio > 0.45) {
            strength += 8;
        }

        if (bearish && upperWickRatio > 0.45) {
            strength += 8;
        }

        return {
            direction:
                bullish
                    ? "BULLISH"
                    : bearish
                        ? "BEARISH"
                        : "NEUTRAL",

            bodyRatio,
            upperWickRatio,
            lowerWickRatio,

            strength: this.clamp(strength, 0, 100),

            bullish,
            bearish
        };
    }

    /* =========================================================
       CANDLE CONSISTENCY
       ========================================================= */

    calculateCandleBias(opens, closes, lookback = 5) {

        if (closes.length < lookback) {
            return {
                bullish: 0,
                bearish: 0,
                bias: "NEUTRAL"
            };
        }

        const o =
            opens.slice(-lookback);

        const c =
            closes.slice(-lookback);

        let bullish = 0;
        let bearish = 0;

        for (let i = 0; i < lookback; i++) {

            if (c[i] > o[i]) bullish++;
            else if (c[i] < o[i]) bearish++;
        }

        let bias = "NEUTRAL";

        if (bullish >= 4) bias = "BULLISH";
        else if (bearish >= 4) bias = "BEARISH";

        return {
            bullish,
            bearish,
            bias
        };
    }

    /* =========================================================
       SUPPORT / RESISTANCE
       ========================================================= */

    calculateSR(highs, lows, closes, lookback = 30) {

        const h =
            highs.slice(-lookback);

        const l =
            lows.slice(-lookback);

        const current =
            this.last(closes);

        const resistance =
            Math.max(...h);

        const support =
            Math.min(...l);

        const range =
            resistance - support;

        if (range <= 0) {
            return {
                support,
                resistance,
                position: 0.5,
                nearSupport: false,
                nearResistance: false
            };
        }

        const position =
            (current - support) / range;

        const nearSupport =
            position < 0.20;

        const nearResistance =
            position > 0.80;

        return {
            support,
            resistance,
            position,
            nearSupport,
            nearResistance
        };
    }

    /* =========================================================
       TREND REGIME
       ========================================================= */

    detectRegime(
        closes,
        ema9,
        ema21,
        ema50,
        adx,
        atr,
        bb,
        efficiency
    ) {

        const price =
            this.last(closes);

        const e9 =
            this.last(ema9);

        const e21 =
            this.last(ema21);

        const e50 =
            this.last(ema50);

        const spread =
            Math.abs(e9 - e21);

        const slope9 =
            this.calculateSlope(ema9, 5);

        const slope21 =
            this.calculateSlope(ema21, 5);

        const upTrend =
            e9 > e21 &&
            e21 > e50 &&
            price > e21 &&
            slope9 > 0 &&
            slope21 >= 0;

        const downTrend =
            e9 < e21 &&
            e21 < e50 &&
            price < e21 &&
            slope9 < 0 &&
            slope21 <= 0;

        const sideways =
            (
                adx < this.config.minADXTrend &&
                efficiency < this.config.sidewaysEfficiency
            ) ||
            (
                spread < this.config.minEMASpread &&
                bb.width < 0.0008
            );

        if (sideways) {
            return {
                regime: "SIDEWAYS",
                trend: "NEUTRAL",
                spread,
                slope9,
                slope21
            };
        }

        if (upTrend && adx >= this.config.minADXTrend) {
            return {
                regime: "UP TREND",
                trend: "UP",
                spread,
                slope9,
                slope21
            };
        }

        if (downTrend && adx >= this.config.minADXTrend) {
            return {
                regime: "DOWN TREND",
                trend: "DOWN",
                spread,
                slope9,
                slope21
            };
        }

        return {
            regime: "UNCLEAR",
            trend: "NEUTRAL",
            spread,
            slope9,
            slope21
        };
    }

    /* =========================================================
       MAIN ANALYSIS
       ========================================================= */

    analyzeMarket(
        closes,
        highs,
        lows,
        volumes = [],
        opens = []
    ) {

        /* -----------------------------------------------
           DATA VALIDATION
        ------------------------------------------------ */

        if (
            !Array.isArray(closes) ||
            !Array.isArray(highs) ||
            !Array.isArray(lows)
        ) {
            return this.noTrade(
                "Invalid market data"
            );
        }

        const count =
            Math.min(
                closes.length,
                highs.length,
                lows.length
            );

        if (count < this.config.minCandles) {
            return this.noTrade(
                "Not enough candles"
            );
        }

        closes = closes.slice(-count);
        highs = highs.slice(-count);
        lows = lows.slice(-count);

        if (opens.length !== count) {
            opens = closes.map((c, i) => {
                return i > 0
                    ? closes[i - 1]
                    : c;
            });
        } else {
            opens = opens.slice(-count);
        }

        /* -----------------------------------------------
           INDICATORS
        ------------------------------------------------ */

        const ema9 =
            this.calculateEMA(closes, 9);

        const ema21 =
            this.calculateEMA(closes, 21);

        const ema50 =
            this.calculateEMA(closes, 50);

        const rsi =
            this.calculateRSI(closes, 14);

        const macd =
            this.calculateMACD(closes);

        const atr =
            this.calculateATR(
                highs,
                lows,
                closes,
                14
            );

        const adx =
            this.calculateADX(
                highs,
                lows,
                closes,
                14
            );

        const bb =
            this.calculateBollinger(
                closes,
                20,
                2
            );

        const efficiency =
            this.calculateEfficiency(
                closes,
                20
            );

        const regime =
            this.detectRegime(
                closes,
                ema9,
                ema21,
                ema50,
                adx,
                atr,
                bb,
                efficiency
            );

        const sr =
            this.calculateSR(
                highs,
                lows,
                closes,
                30
            );

        const candle =
            this.analyzeLastCandle(
                opens[opens.length - 1],
                highs[highs.length - 1],
                lows[lows.length - 1],
                closes[closes.length - 1]
            );

        const candleBias =
            this.calculateCandleBias(
                opens,
                closes,
                5
            );

        /* -----------------------------------------------
           SIDEWAYS = NO TRADE
        ------------------------------------------------ */

        if (regime.regime === "SIDEWAYS") {

            return {
                signal: "NO TRADE",
                score: 0,
                confidence: 0,

                regime: "SIDEWAYS",

                details: {
                    trend: "SIDEWAYS",
                    momentum: "NEUTRAL",
                    structure: "RANGE",
                    volatility:
                        bb.width < 0.0008
                            ? "LOW"
                            : "NORMAL",

                    rsi,
                    adx,
                    atr,
                    efficiency,

                    ema9: this.last(ema9),
                    ema21: this.last(ema21),
                    ema50: this.last(ema50),

                    macd: macd.macd,
                    macdSignal: macd.signal,
                    histogram: macd.histogram,

                    support: sr.support,
                    resistance: sr.resistance,

                    candleDirection:
                        candle.direction,

                    candleStrength:
                        candle.strength
                },

                reason:
                    "Sideways market detected - waiting for clean trend"
            };
        }

        /* -----------------------------------------------
           UNCLEAR = NO TRADE
        ------------------------------------------------ */

        if (regime.regime === "UNCLEAR") {

            return {
                signal: "NO TRADE",
                score: 0,
                confidence: 0,

                regime: "UNCLEAR",

                details: {
                    trend: "UNCLEAR",
                    rsi,
                    adx,
                    atr,
                    efficiency,
                    candleDirection:
                        candle.direction,
                    candleStrength:
                        candle.strength
                },

                reason:
                    "Trend structure is not sufficiently clear"
            };
        }

        /* -----------------------------------------------
           SCORE ENGINE
        ------------------------------------------------ */

        let upScore = 0;
        let downScore = 0;

        /* TREND */

        if (regime.trend === "UP") {
            upScore += 30;
        }

        if (regime.trend === "DOWN") {
            downScore += 30;
        }

        /* EMA SLOPE */

        if (
            regime.trend === "UP" &&
            regime.slope9 > 0 &&
            regime.slope21 >= 0
        ) {
            upScore += 10;
        }

        if (
            regime.trend === "DOWN" &&
            regime.slope9 < 0 &&
            regime.slope21 <= 0
        ) {
            downScore += 10;
        }

        /* RSI */

        if (
            regime.trend === "UP" &&
            rsi > 52 &&
            rsi < 72
        ) {
            upScore += 15;
        }

        if (
            regime.trend === "DOWN" &&
            rsi < 48 &&
            rsi > 28
        ) {
            downScore += 15;
        }

        /* MACD */

        if (
            regime.trend === "UP" &&
            macd.bullish &&
            macd.histogram > 0
        ) {
            upScore += 15;
        }

        if (
            regime.trend === "DOWN" &&
            macd.bearish &&
            macd.histogram < 0
        ) {
            downScore += 15;
        }

        /* ADX */

        if (adx >= 25) {

            if (regime.trend === "UP") {
                upScore += 10;
            }

            if (regime.trend === "DOWN") {
                downScore += 10;
            }

        } else if (adx >= 18) {

            if (regime.trend === "UP") {
                upScore += 5;
            }

            if (regime.trend === "DOWN") {
                downScore += 5;
            }
        }

        /* CANDLE */

        if (
            regime.trend === "UP" &&
            candle.bullish &&
            candle.bodyRatio >= 0.50
        ) {
            upScore += 10;
        }

        if (
            regime.trend === "DOWN" &&
            candle.bearish &&
            candle.bodyRatio >= 0.50
        ) {
            downScore += 10;
        }

        /* RECENT CANDLE CONSISTENCY */

        if (
            regime.trend === "UP" &&
            candleBias.bias === "BULLISH"
        ) {
            upScore += 10;
        }

        if (
            regime.trend === "DOWN" &&
            candleBias.bias === "BEARISH"
        ) {
            downScore += 10;
        }

        /* SUPPORT / RESISTANCE */

        if (
            regime.trend === "UP" &&
            !sr.nearResistance
        ) {
            upScore += 5;
        }

        if (
            regime.trend === "DOWN" &&
            !sr.nearSupport
        ) {
            downScore += 5;
        }

        /* -----------------------------------------------
           FINAL DIRECTION
        ------------------------------------------------ */

        const total =
            Math.max(upScore, downScore);

        const direction =
            upScore > downScore
                ? "UP"
                : downScore > upScore
                    ? "DOWN"
                    : "NO TRADE";

        const difference =
            Math.abs(
                upScore - downScore
            );

        /* -----------------------------------------------
           WEAK SETUP FILTER
        ------------------------------------------------ */

        if (
            direction === "NO TRADE" ||
            total < 55 ||
            difference < 10
        ) {

            return {
                signal: "NO TRADE",
                score: total,
                confidence: 0,

                regime: regime.regime,

                details: {
                    trend: regime.regime,
                    rsi,
                    adx,
                    atr,
                    efficiency,

                    ema9: this.last(ema9),
                    ema21: this.last(ema21),
                    ema50: this.last(ema50),

                    macd: macd.macd,
                    histogram: macd.histogram,

                    candleDirection:
                        candle.direction,

                    candleStrength:
                        candle.strength,

                    upScore,
                    downScore
                },

                reason:
                    "Signal strength is not sufficiently separated"
            };
        }

        /* -----------------------------------------------
           CONFIDENCE
           ----------------------------------------------- */

        let confidence =
            50 + (difference * 0.8);

        if (adx >= 25) {
            confidence += 3;
        }

        if (candle.strength >= 60) {
            confidence += 2;
        }

        if (
            candleBias.bias ===
            (direction === "UP"
                ? "BULLISH"
                : "BEARISH")
        ) {
            confidence += 2;
        }

        confidence =
            Math.round(
                this.clamp(
                    confidence,
                    50,
                    92
                )
            );

        /* -----------------------------------------------
           RETURN
        ------------------------------------------------ */

        return {

            signal: direction,

            score: total,

            confidence,

            regime: regime.regime,

            details: {

                trend:
                    direction === "UP"
                        ? "BULLISH"
                        : "BEARISH",

                momentum:
                    rsi > 50
                        ? "BULLISH"
                        : "BEARISH",

                structure:
                    regime.regime,

                volatility:
                    bb.width > 0.001
                        ? "HIGH"
                        : "NORMAL",

                rsi,

                adx,

                atr,

                efficiency,

                ema9:
                    this.last(ema9),

                ema21:
                    this.last(ema21),

                ema50:
                    this.last(ema50),

                macd:
                    macd.macd,

                macdSignal:
                    macd.signal,

                histogram:
                    macd.histogram,

                support:
                    sr.support,

                resistance:
                    sr.resistance,

                candleDirection:
                    candle.direction,

                candleStrength:
                    candle.strength,

                candleBias:
                    candleBias.bias,

                upScore,

                downScore
            },

            reason:
                "Trend, momentum and candle confirmation aligned"
        };
    }

    /* =========================================================
       NO TRADE
       ========================================================= */

    noTrade(reason) {

        return {
            signal: "NO TRADE",
            score: 0,
            confidence: 0,
            regime: "UNKNOWN",

            details: {},

            reason
        };
    }

    /* =========================================================
       MARKET DATA SAFETY FILTER
       ========================================================= */

    checkMarketQuality(market) {

        if (!market) {
            return {
                pass: true,
                reason: "No market metadata"
            };
        }

        if (market.isStale) {
            return {
                pass: false,
                reason: "Market data is stale"
            };
        }

        if (market.flatMarket) {
            return {
                pass: false,
                reason: "Market is flat"
            };
        }

        if (
            market.ageSeconds !== undefined &&
            market.ageSeconds > this.config.staleSeconds
        ) {
            return {
                pass: false,
                reason:
                    "Latest candle is older than allowed freshness window"
            };
        }

        if (
            market.dataQuality &&
            market.dataQuality !== "OK"
        ) {
            return {
                pass: false,
                reason:
                    "Market data quality is not OK"
            };
        }

        return {
            pass: true,
            reason: "Market data OK"
        };
    }

    /* =========================================================
       LEGACY COMPATIBILITY
       ========================================================= */

    checkNoTradeFilters(marketData) {

        const quality =
            this.checkMarketQuality(
                marketData
            );

        if (!quality.pass) {
            return quality;
        }

        if (marketData?.isSideways) {
            return {
                pass: false,
                reason: "Market Sideways"
            };
        }

        if (marketData?.emaConflict) {
            return {
                pass: false,
                reason: "EMA Conflict"
            };
        }

        if (marketData?.rsiNeutral) {
            return {
                pass: false,
                reason: "RSI Neutral"
            };
        }

        if (marketData?.macdConflict) {
            return {
                pass: false,
                reason: "MACD Conflict"
            };
        }

        if (marketData?.adxWeak) {
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


/* =============================================================
   GLOBAL INSTANCE
   ============================================================= */

window.btzEngine = new BTZEngine();
