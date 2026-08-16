/**
 * FINORIX AI - Prediction Engine
 * Version: Regime + Multi-Factor Candle Engine
 *
 * Compatible with:
 * window.btzEngine.analyzeMarket(closes, highs, lows, volumes)
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
            bbMultiplier: 2,

            minCandles: 60,

            sidewaysADX: 18,
            strongADX: 25,

            minATRPercent: 0.003,
            maxATRPercent: 0.30,

            minimumTradeScore: 72,
            strongTradeScore: 82
        };
    }

    /* =========================================================
       BASIC HELPERS
    ========================================================= */

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    average(values) {
        if (!values.length) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    last(arr) {
        return arr[arr.length - 1];
    }

    isFiniteArray(arr) {
        return Array.isArray(arr) &&
            arr.length > 0 &&
            arr.every(Number.isFinite);
    }

    /* =========================================================
       EMA
    ========================================================= */

    calculateEMA(data, period) {

        if (!data || data.length === 0) return [];

        const k = 2 / (period + 1);

        let ema = [];

        // Better seed than simply data[0]
        const seedLength = Math.min(period, data.length);
        const seed = this.average(data.slice(0, seedLength));

        ema.push(seed);

        for (let i = seedLength; i < data.length; i++) {

            const previous = ema[ema.length - 1];

            ema.push(
                (data[i] * k) +
                (previous * (1 - k))
            );
        }

        // Keep same array length
        if (ema.length < data.length) {

            const padding = new Array(data.length - ema.length)
                .fill(ema[0]);

            ema = padding.concat(ema);
        }

        return ema;
    }

    /* =========================================================
       RSI - Wilder style
    ========================================================= */

    calculateRSI(closes, period = 14) {

        if (closes.length < period + 1) {
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

        const fast = this.calculateEMA(
            closes,
            this.config.macdFast
        );

        const slow = this.calculateEMA(
            closes,
            this.config.macdSlow
        );

        const macdLine = closes.map((_, i) =>
            fast[i] - slow[i]
        );

        const signal = this.calculateEMA(
            macdLine,
            this.config.macdSignal
        );

        const histogram = macdLine.map(
            (value, i) => value - signal[i]
        );

        return {
            line: this.last(macdLine),
            signal: this.last(signal),
            histogram: this.last(histogram),

            previousHistogram:
                histogram.length > 1
                    ? histogram[histogram.length - 2]
                    : 0
        };
    }

    /* =========================================================
       TRUE RANGE
    ========================================================= */

    calculateTR(candles) {

        const tr = [];

        for (let i = 0; i < candles.length; i++) {

            if (i === 0) {

                tr.push(
                    candles[i].high -
                    candles[i].low
                );

                continue;
            }

            const high = candles[i].high;
            const low = candles[i].low;
            const previousClose =
                candles[i - 1].close;

            tr.push(
                Math.max(
                    high - low,
                    Math.abs(high - previousClose),
                    Math.abs(low - previousClose)
                )
            );
        }

        return tr;
    }

    /* =========================================================
       ATR
    ========================================================= */

    calculateATR(candles, period = 14) {

        if (candles.length < period + 1) {
            return 0;
        }

        const tr = this.calculateTR(candles);

        let atr = this.average(
            tr.slice(0, period)
        );

        for (let i = period; i < tr.length; i++) {

            atr =
                ((atr * (period - 1)) +
                tr[i]) / period;
        }

        return atr;
    }

    /* =========================================================
       ADX
    ========================================================= */

    calculateADX(candles, period = 14) {

        if (candles.length < period * 2) {
            return 20;
        }

        let trValues = [];
        let plusDM = [];
        let minusDM = [];

        for (let i = 1; i < candles.length; i++) {

            const current = candles[i];
            const previous = candles[i - 1];

            const upMove =
                current.high - previous.high;

            const downMove =
                previous.low - current.low;

            const tr =
                Math.max(
                    current.high - current.low,
                    Math.abs(
                        current.high - previous.close
                    ),
                    Math.abs(
                        current.low - previous.close
                    )
                );

            trValues.push(tr);

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

        let atr = this.average(
            trValues.slice(0, period)
        );

        let plus = this.average(
            plusDM.slice(0, period)
        );

        let minus = this.average(
            minusDM.slice(0, period)
        );

        let dxValues = [];

        for (let i = period; i < trValues.length; i++) {

            atr =
                ((atr * (period - 1)) +
                trValues[i]) / period;

            plus =
                ((plus * (period - 1)) +
                plusDM[i]) / period;

            minus =
                ((minus * (period - 1)) +
                minusDM[i]) / period;

            if (atr === 0) continue;

            const plusDI =
                (plus / atr) * 100;

            const minusDI =
                (minus / atr) * 100;

            const denominator =
                plusDI + minusDI;

            if (denominator === 0) continue;

            const dx =
                Math.abs(plusDI - minusDI) /
                denominator * 100;

            dxValues.push(dx);
        }

        if (!dxValues.length) return 20;

        let adx =
            this.average(
                dxValues.slice(0, period)
            );

        for (
            let i = period;
            i < dxValues.length;
            i++
        ) {

            adx =
                ((adx * (period - 1)) +
                dxValues[i]) / period;
        }

        return this.clamp(adx, 0, 100);
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
                width: 0,
                position: 0.5
            };
        }

        const values =
            closes.slice(-period);

        const mean =
            this.average(values);

        const variance =
            this.average(
                values.map(
                    x => Math.pow(x - mean, 2)
                )
            );

        const std =
            Math.sqrt(variance);

        const upper =
            mean + multiplier * std;

        const lower =
            mean - multiplier * std;

        const current =
            this.last(closes);

        const width =
            mean !== 0
                ? ((upper - lower) / mean) * 100
                : 0;

        const position =
            upper !== lower
                ? (current - lower) /
                  (upper - lower)
                : 0.5;

        return {
            middle: mean,
            upper,
            lower,
            width,
            position
        };
    }

    /* =========================================================
       MARKET STRUCTURE
    ========================================================= */

    detectStructure(highs, lows) {

        if (highs.length < 6) {
            return "RANGE";
        }

        const n = highs.length;

        const h1 = highs[n - 1];
        const h2 = highs[n - 3];

        const l1 = lows[n - 1];
        const l2 = lows[n - 3];

        const higherHigh = h1 > h2;
        const higherLow = l1 > l2;

        const lowerHigh = h1 < h2;
        const lowerLow = l1 < l2;

        if (higherHigh && higherLow) {
            return "BULLISH";
        }

        if (lowerHigh && lowerLow) {
            return "BEARISH";
        }

        return "RANGE";
    }

    /* =========================================================
       CANDLE ANALYSIS
    ========================================================= */

    analyzeLastCandles(candles) {

        const recent =
            candles.slice(-5);

        let bullish = 0;
        let bearish = 0;

        for (const c of recent) {

            const body =
                Math.abs(c.close - c.open);

            const range =
                Math.max(c.high - c.low, 0);

            if (range === 0) continue;

            const bodyRatio =
                body / range;

            if (
                c.close > c.open &&
                bodyRatio >= 0.45
            ) {
                bullish++;
            }

            if (
                c.close < c.open &&
                bodyRatio >= 0.45
            ) {
                bearish++;
            }
        }

        const lastCandle =
            this.last(candles);

        const body =
            Math.abs(
                lastCandle.close -
                lastCandle.open
            );

        const range =
            Math.max(
                lastCandle.high -
                lastCandle.low,
                0
            );

        const bodyRatio =
            range > 0
                ? body / range
                : 0;

        return {
            bullish,
            bearish,
            bodyRatio,
            bullishStrength:
                bullish - bearish
        };
    }

    /* =========================================================
       SUPPORT / RESISTANCE
    ========================================================= */

    calculateSR(highs, lows, closes) {

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

        const current =
            this.last(closes);

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
       SIDEWAYS DETECTOR
    ========================================================= */

    detectSideways(
        closes,
        ema9,
        ema21,
        adx,
        bollinger,
        atr,
        currentPrice
    ) {

        const emaSpread =
            Math.abs(
                ema9 - ema21
            );

        const emaSpreadPercent =
            currentPrice !== 0
                ? (emaSpread /
                   currentPrice) * 100
                : 0;

        const atrPercent =
            currentPrice !== 0
                ? (atr /
                   currentPrice) * 100
                : 0;

        let reasons = [];

        if (
            adx < this.config.sidewaysADX
        ) {
            reasons.push("ADX weak");
        }

        if (
            emaSpreadPercent < 0.003
        ) {
            reasons.push("EMA compressed");
        }

        if (
            bollinger.width < 0.015
        ) {
            reasons.push("BB compressed");
        }

        if (
            atrPercent < this.config.minATRPercent
        ) {
            reasons.push("Low volatility");
        }

        return {
            sideways: reasons.length >= 2,
            reasons,
            emaSpreadPercent,
            atrPercent
        };
    }

    /* =========================================================
       MAIN ANALYSIS
    ========================================================= */

    analyzeMarket(
        closes,
        highs,
        lows,
        volumes = []
    ) {

        /* -----------------------------------------
           DATA VALIDATION
        ----------------------------------------- */

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

        if (
            length < this.config.minCandles
        ) {

            return {
                signal: "NO TRADE",
                score: 0,
                confidence: 0,
                reason:
                    `Need at least ${this.config.minCandles} candles`
            };
        }

        closes = closes.slice(-length);
        highs = highs.slice(-length);
        lows = lows.slice(-length);

        const candles =
            closes.map((close, i) => ({
                open:
                    i > 0
                        ? closes[i - 1]
                        : close,
                high: highs[i],
                low: lows[i],
                close
            }));

        /* -----------------------------------------
           INDICATORS
        ----------------------------------------- */

        const ema9Array =
            this.calculateEMA(
                closes,
                this.config.emaFast
            );

        const ema21Array =
            this.calculateEMA(
                closes,
                this.config.emaMedium
            );

        const ema50Array =
            this.calculateEMA(
                closes,
                this.config.emaSlow
            );

        const ema9 =
            this.last(ema9Array);

        const ema21 =
            this.last(ema21Array);

        const ema50 =
            this.last(ema50Array);

        const current =
            this.last(closes);

        const rsi =
            this.calculateRSI(
                closes,
                this.config.rsiPeriod
            );

        const macd =
            this.calculateMACD(closes);

        const atr =
            this.calculateATR(
                candles,
                this.config.atrPeriod
            );

        const adx =
            this.calculateADX(
                candles,
                this.config.adxPeriod
            );

        const bb =
            this.calculateBollinger(
                closes,
                this.config.bbPeriod,
                this.config.bbMultiplier
            );

        const structure =
            this.detectStructure(
                highs,
                lows
            );

        const sr =
            this.calculateSR(
                highs,
                lows,
                closes
            );

        const candle =
            this.analyzeLastCandles(
                candles
            );

        /* -----------------------------------------
           TREND
        ----------------------------------------- */

        let trend = "NEUTRAL";

        if (
            ema9 > ema21 &&
            ema21 > ema50 &&
            current > ema9
        ) {
            trend = "UP";
        }
        else if (
            ema9 < ema21 &&
            ema21 < ema50 &&
            current < ema9
        ) {
            trend = "DOWN";
        }

        /* -----------------------------------------
           SIDEWAYS
        ----------------------------------------- */

        const sideways =
            this.detectSideways(
                closes,
                ema9,
                ema21,
                adx,
                bb,
                atr,
                current
            );

        /* -----------------------------------------
           SCORE
        ----------------------------------------- */

        let upScore = 0;
        let downScore = 0;

        const reasons = [];

        /* TREND = 25 */

        if (trend === "UP") {
            upScore += 25;
            reasons.push("EMA trend UP");
        }

        if (trend === "DOWN") {
            downScore += 25;
            reasons.push("EMA trend DOWN");
        }

        /* ADX = 15 */

        if (adx >= this.config.strongADX) {

            if (ema9 > ema21) {
                upScore += 15;
            }

            if (ema9 < ema21) {
                downScore += 15;
            }

            reasons.push(
                `Strong trend ADX ${adx.toFixed(1)}`
            );
        }
        else if (adx >= this.config.sidewaysADX) {

            if (ema9 > ema21) {
                upScore += 8;
            }

            if (ema9 < ema21) {
                downScore += 8;
            }
        }

        /* RSI = 15 */

        if (
            rsi >= 52 &&
            rsi <= 68
        ) {
            upScore += 15;
        }

        if (
            rsi >= 32 &&
            rsi <= 48
        ) {
            downScore += 15;
        }

        /* MACD = 15 */

        if (
            macd.histogram > 0 &&
            macd.histogram >=
            macd.previousHistogram
        ) {
            upScore += 15;
        }

        if (
            macd.histogram < 0 &&
            macd.histogram <=
            macd.previousHistogram
        ) {
            downScore += 15;
        }

        /* STRUCTURE = 10 */

        if (
            structure === "BULLISH"
        ) {
            upScore += 10;
        }

        if (
            structure === "BEARISH"
        ) {
            downScore += 10;
        }

        /* CANDLE CONFIRMATION = 10 */

        if (
            candle.bullish >= 3 &&
            candle.bodyRatio >= 0.45
        ) {
            upScore += 10;
        }

        if (
            candle.bearish >= 3 &&
            candle.bodyRatio >= 0.45
        ) {
            downScore += 10;
        }

        /* SUPPORT / RESISTANCE = 5 */

        if (
            sr.nearSupport &&
            candle.bullishStrength > 0
        ) {
            upScore += 5;
        }

        if (
            sr.nearResistance &&
            candle.bullishStrength < 0
        ) {
            downScore += 5;
        }

        /* -----------------------------------------
           VOLATILITY FILTER
        ----------------------------------------- */

        const atrPercent =
            current !== 0
                ? (atr / current) * 100
                : 0;

        const volatilityOK =
            atrPercent >=
                this.config.minATRPercent &&
            atrPercent <=
                this.config.maxATRPercent;

        /* -----------------------------------------
           FINAL DECISION
        ----------------------------------------- */

        const bestScore =
            Math.max(
                upScore,
                downScore
            );

        const difference =
            Math.abs(
                upScore - downScore
            );

        let signal = "NO TRADE";

        if (
            sideways.sideways
        ) {

            signal = "NO TRADE";
            reasons.push(
                "Sideways market detected"
            );

        }
        else if (
            !volatilityOK
        ) {

            signal = "NO TRADE";
            reasons.push(
                "Abnormal volatility"
            );

        }
        else if (
            bestScore <
            this.config.minimumTradeScore
        ) {

            signal = "NO TRADE";
            reasons.push(
                "Insufficient confirmation"
            );

        }
        else if (
            difference < 12
        ) {

            signal = "NO TRADE";
            reasons.push(
                "UP/DOWN conflict"
            );

        }
        else if (
            upScore > downScore
        ) {

            signal = "UP";

        }
        else {

            signal = "DOWN";
        }

        /* -----------------------------------------
           CONFIDENCE
           NOT fake 90-98%.
        ----------------------------------------- */

        let confidence = 0;

        if (signal !== "NO TRADE") {

            confidence =
                50 +
                (bestScore - 50) * 0.65 +
                Math.min(difference, 25) * 0.35;

            confidence =
                this.clamp(
                    confidence,
                    55,
                    89
                );
        }

        /* -----------------------------------------
           DETAILS
        ----------------------------------------- */

        const details = {

            trend,

            structure,

            momentum:
                rsi > 55
                    ? "Bullish"
                    : rsi < 45
                        ? "Bearish"
                        : "Neutral",

            rsi:
                Number(rsi.toFixed(2)),

            ema9:
                Number(ema9.toFixed(6)),

            ema21:
                Number(ema21.toFixed(6)),

            ema50:
                Number(ema50.toFixed(6)),

            macd:
                macd.histogram > 0
                    ? "BULLISH"
                    : macd.histogram < 0
                        ? "BEARISH"
                        : "NEUTRAL",

            macdHistogram:
                Number(
                    macd.histogram.toFixed(8)
                ),

            adx:
                Number(adx.toFixed(2)),

            volatility:
                volatilityOK
                    ? "NORMAL"
                    : "ABNORMAL",

            atr:
                Number(atr.toFixed(8)),

            atrPercent:
                Number(
                    atrPercent.toFixed(4)
                ),

            bollinger:
                Number(
                    bb.position.toFixed(3)
                ),

            support:
                sr.support,

            resistance:
                sr.resistance,

            sideways:
                sideways.sideways,

            sidewaysReasons:
                sideways.reasons,

            candleBullish:
                candle.bullish,

            candleBearish:
                candle.bearish,

            upScore,

            downScore,

            score: bestScore
        };

        return {

            signal,

            score: bestScore,

            confidence:
                Math.round(confidence),

            details,

            reason:
                reasons.join(" | "),

            nextCandle:
                signal,

            engineVersion:
                "FINORIX-REGIME-V2"
        };
    }

    /* =========================================================
       NO TRADE FILTER
    ========================================================= */

    checkNoTradeFilters(marketData) {

        if (!marketData) {

            return {
                pass: false,
                reason: "No market data"
            };
        }

        if (marketData.isStale) {

            return {
                pass: false,
                reason: "Market data stale"
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


/* =========================================================
   GLOBAL ENGINE
========================================================= */

window.btzEngine = new BTZEngine();

console.log(
    "FINORIX Prediction Engine loaded:",
    "REGIME-V2"
);
