import {
    calculateIndicators,
    calculateSupportResistance,
    detectTrend,
    type Candle,
    type IndicatorResult,
    type TrendResult,
} from "./indicators/market-analysis.js";

export interface ChartWidgetConfig {
    readonly containerId: string;
    readonly defaultAsset: string;
    readonly timeframe: string;
    readonly candles?: Candle[];
    readonly updateIntervalMs?: number;
    readonly document?: Document;
}

export interface PreSignal {
    readonly direction: "CALL" | "PUT" | "WAIT";
    readonly confidence: number;
    readonly entry: number;
    readonly secondsRemaining: number;
    readonly reason: string;
}

export interface ChartWidgetSnapshot {
    readonly asset: string;
    readonly timeframe: string;
    readonly candles: readonly Candle[];
    readonly indicators: IndicatorResult;
    readonly trend: TrendResult;
    readonly support: number;
    readonly resistance: number;
    readonly preSignal: PreSignal;
    readonly isSimulation: boolean;
}

const MAX_CANDLES = 36;
const PREDICTION_WINDOW_SECONDS = 30;
const DEFAULT_UPDATE_INTERVAL_MS = 1_000;
const PRICE_DECIMALS = 5;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function formatPrice(value: number): string {
    return value.toFixed(PRICE_DECIMALS);
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function seedForAsset(asset: string): number {
    return [...asset].reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function createInitialCandles(asset: string): Candle[] {
    let seed = seedForAsset(asset);
    let close = asset.toUpperCase().includes("JPY") ? 156.25 : 1.0842;
    const candles: Candle[] = [];

    for (let index = MAX_CANDLES; index > 0; index -= 1) {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        const drift = ((seed / 4_294_967_295) - 0.49) * close * 0.0014;
        const open = close;
        const nextClose = Math.max(0.00001, close + drift);
        const spread = Math.max(close * 0.0007, Math.abs(drift) * 1.8);
        const high = Math.max(open, nextClose) + spread;
        const low = Math.max(0.00001, Math.min(open, nextClose) - spread);

        candles.push({
            time: Math.floor(Date.now() / 1_000) - (index * 60),
            open,
            high,
            low,
            close: nextClose,
            volume: 100 + (seed % 900),
        });
        close = nextClose;
    }

    return candles;
}

function buildPreSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    trend: TrendResult,
    support: number,
    resistance: number,
): PreSignal {
    const entry = candles.at(-1)?.close ?? 0;
    const range = Math.max(resistance - support, Number.EPSILON);
    const momentum = indicators.histogram > 0 ? 1 : -1;
    const trendScore = trend.trend === "SIDEWAYS" ? 0 : trend.trend === "UP" ? 1 : -1;
    const rsiScore = indicators.rsi > 52 ? 1 : indicators.rsi < 48 ? -1 : 0;
    const directionalScore = trendScore + momentum + rsiScore;
    const distanceFromSupport = clamp((entry - support) / range, 0, 1);
    const distanceFromResistance = clamp((resistance - entry) / range, 0, 1);
    const nearSupport = distanceFromSupport < 0.22;
    const nearResistance = distanceFromResistance < 0.22;
    const agreement = Math.abs(directionalScore) / 3;
    const confidence = Math.round(clamp(52 + (agreement * 38), 50, 90));

    if (directionalScore > 0 && !nearResistance) {
        return {
            direction: "CALL",
            confidence,
            entry,
            secondsRemaining: 0,
            reason: `Trend ${trend.trend.toLowerCase()} with positive MACD momentum`,
        };
    }

    if (directionalScore < 0 && !nearSupport) {
        return {
            direction: "PUT",
            confidence,
            entry,
            secondsRemaining: 0,
            reason: `Trend ${trend.trend.toLowerCase()} with negative MACD momentum`,
        };
    }

    return {
        direction: "WAIT",
        confidence: Math.min(confidence, 68),
        entry,
        secondsRemaining: 0,
        reason: nearSupport || nearResistance
            ? "Price is close to a local support or resistance level"
            : "Indicator agreement is not strong enough",
    };
}

function chartSvg(candles: readonly Candle[], support: number, resistance: number): string {
    const width = 720;
    const height = 250;
    const padding = { top: 18, right: 52, bottom: 20, left: 12 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = candles.flatMap((candle) => [candle.high, candle.low, candle.close]);
    const min = Math.min(...values, support);
    const max = Math.max(...values, resistance);
    const range = Math.max(max - min, Number.EPSILON);
    const y = (price: number): number => padding.top + ((max - price) / range) * plotHeight;
    const candleWidth = Math.max(5, (plotWidth / Math.max(candles.length, 1)) * 0.58);

    const candleMarkup = candles.map((candle, index) => {
        const x = padding.left + ((index + 0.5) / candles.length) * plotWidth;
        const openY = y(candle.open);
        const closeY = y(candle.close);
        const highY = y(candle.high);
        const lowY = y(candle.low);
        const color = candle.close >= candle.open ? "#22c55e" : "#f43f5e";
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));

        return `<g opacity="${index === candles.length - 1 ? "1" : "0.88"}">
            <line x1="${x}" x2="${x}" y1="${highY}" y2="${lowY}" stroke="${color}" stroke-width="1.5"/>
            <rect x="${x - candleWidth / 2}" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" rx="1.5" fill="${color}"/>
        </g>`;
    }).join("");

    const line = (price: number, color: string, label: string): string => `
        <line x1="${padding.left}" x2="${width - padding.right}" y1="${y(price)}" y2="${y(price)}" stroke="${color}" stroke-width="1" stroke-dasharray="5 5" opacity="0.8"/>
        <text x="${width - padding.right + 7}" y="${y(price) + 4}" fill="${color}" font-size="10">${label}</text>`;

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Live candlestick chart">
        <defs>
            <linearGradient id="btz-chart-bg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#111827"/>
                <stop offset="100%" stop-color="#0b1220"/>
            </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" rx="12" fill="url(#btz-chart-bg)"/>
        <g stroke="#243149" stroke-width="1">
            <line x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight * 0.25}" y2="${padding.top + plotHeight * 0.25}"/>
            <line x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight * 0.5}" y2="${padding.top + plotHeight * 0.5}"/>
            <line x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight * 0.75}" y2="${padding.top + plotHeight * 0.75}"/>
        </g>
        ${line(support, "#38bdf8", "S")}
        ${line(resistance, "#f59e0b", "R")}
        ${candleMarkup}
        <text x="${padding.left}" y="${height - 6}" fill="#64748b" font-size="10">MARKET STRUCTURE · M1</text>
    </svg>`;
}

export class ChartWidget {
    private container: HTMLElement | null = null;
    private readonly document: Document | null;
    private readonly updateIntervalMs: number;
    private asset: string;
    private timeframe: string;
    private candles: Candle[];
    private timer: ReturnType<typeof setInterval> | undefined;
    private usingSimulation = true;
    private lastSnapshot: ChartWidgetSnapshot | null = null;

    public constructor(config: ChartWidgetConfig) {
        this.asset = config.defaultAsset;
        this.timeframe = config.timeframe;
        this.updateIntervalMs = Math.max(250, config.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS);
        this.candles = [...(config.candles ?? createInitialCandles(this.asset))].slice(-MAX_CANDLES);
        this.document = config.document ?? (typeof globalThis.document === "undefined" ? null : globalThis.document);
        this.container = this.document?.getElementById(config.containerId) ?? null;
        this.render();

        if (this.container) {
            this.start();
        }
    }

    public updateAsset(newAsset: string, newTimeframe: string): void {
        this.asset = newAsset;
        this.timeframe = newTimeframe;
        this.candles = createInitialCandles(newAsset);
        this.usingSimulation = true;
        this.render();
    }

    public updateCandles(candles: Candle[]): void {
        this.candles = candles.slice(-MAX_CANDLES);
        this.usingSimulation = false;
        this.render();
    }

    public getSnapshot(): ChartWidgetSnapshot | null {
        return this.lastSnapshot;
    }

    public start(): void {
        if (this.timer || !this.container) {
            return;
        }

        this.timer = setInterval(() => {
            if (this.usingSimulation) {
                this.advanceSimulation();
            }
            this.render();
        }, this.updateIntervalMs);
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    public destroy(): void {
        this.stop();
        if (this.container) {
            this.container.replaceChildren();
        }
        this.container = null;
    }

    public render(): void {
        const indicators = calculateIndicators(this.candles);
        const trend = detectTrend(this.candles);
        const levels = calculateSupportResistance(this.candles);
        const rawPreSignal = buildPreSignal(
            this.candles,
            indicators,
            trend,
            levels.support,
            levels.resistance,
        );
        const now = Math.floor(Date.now() / 1_000);
        const secondsRemaining = PREDICTION_WINDOW_SECONDS - (now % PREDICTION_WINDOW_SECONDS);
        const preSignal: PreSignal = { ...rawPreSignal, secondsRemaining };

        this.lastSnapshot = {
            asset: this.asset,
            timeframe: this.timeframe,
            candles: [...this.candles],
            indicators,
            trend,
            support: levels.support,
            resistance: levels.resistance,
            preSignal,
            isSimulation: this.usingSimulation,
        };

        if (!this.container) {
            return;
        }

        const signalColor = preSignal.direction === "CALL"
            ? "#22c55e"
            : preSignal.direction === "PUT"
                ? "#f43f5e"
                : "#f59e0b";
        const trendLabel = trend.trend === "SIDEWAYS" ? "RANGE" : trend.trend;
        const modeLabel = this.usingSimulation ? "SIMULATION FEED" : "LIVE FEED";

        this.container.innerHTML = `
            <section style="box-sizing:border-box;background:#080f1d;border:1px solid #1e2d46;border-radius:16px;padding:16px;color:#e2e8f0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;max-width:860px;box-shadow:0 12px 40px rgba(2,8,23,.28)">
                <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">
                    <div>
                        <div style="font-size:11px;letter-spacing:.14em;color:#64748b;font-weight:700">BTZ SIGNAL AI · LIVE MARKET</div>
                        <div style="font-size:18px;font-weight:800;color:#f8fafc;margin-top:4px">${escapeHtml(this.asset)} <span style="color:#64748b;font-size:13px;font-weight:600">${escapeHtml(this.timeframe)}</span></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:7px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:.08em">
                        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${this.usingSimulation ? "#f59e0b" : "#22c55e"};box-shadow:0 0 12px ${this.usingSimulation ? "#f59e0b" : "#22c55e"}"></span>${modeLabel}
                    </div>
                </header>
                <div style="overflow:hidden;border-radius:12px">${chartSvg(this.candles, levels.support, levels.resistance)}</div>
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px">
                    <div style="background:#0f1a2d;border:1px solid #1e2d46;border-radius:10px;padding:9px"><div style="font-size:10px;color:#64748b">RSI 14</div><strong style="font-size:16px;color:${indicators.rsi > 70 ? "#f43f5e" : indicators.rsi < 30 ? "#22c55e" : "#e2e8f0"}">${indicators.rsi.toFixed(1)}</strong></div>
                    <div style="background:#0f1a2d;border:1px solid #1e2d46;border-radius:10px;padding:9px"><div style="font-size:10px;color:#64748b">EMA 9 / 21</div><strong style="font-size:13px;color:#e2e8f0">${formatPrice(indicators.ema9)}<br><span style="color:#64748b">${formatPrice(indicators.ema21)}</span></strong></div>
                    <div style="background:#0f1a2d;border:1px solid #1e2d46;border-radius:10px;padding:9px"><div style="font-size:10px;color:#64748b">TREND</div><strong style="font-size:14px;color:${trend.trend === "UP" ? "#22c55e" : trend.trend === "DOWN" ? "#f43f5e" : "#f59e0b"}">${trendLabel} ${trend.strength}%</strong></div>
                    <div style="background:#0f1a2d;border:1px solid #1e2d46;border-radius:10px;padding:9px"><div style="font-size:10px;color:#64748b">MACD HIST</div><strong style="font-size:14px;color:${indicators.histogram >= 0 ? "#22c55e" : "#f43f5e"}">${indicators.histogram.toFixed(6)}</strong></div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:12px;padding:12px;border-radius:12px;background:linear-gradient(90deg,#101a2e,#101527);border:1px solid ${signalColor}55">
                    <div><div style="font-size:10px;letter-spacing:.12em;color:#94a3b8;font-weight:700">30S PRE-SIGNAL · NEXT CANDLE</div><div style="font-size:12px;color:#94a3b8;margin-top:4px">${escapeHtml(preSignal.reason)}</div></div>
                    <div style="text-align:right;white-space:nowrap"><strong style="color:${signalColor};font-size:22px">${preSignal.direction}</strong><div style="font-size:11px;color:#cbd5e1">${preSignal.confidence}% · ${preSignal.secondsRemaining}s</div></div>
                </div>
                <footer style="display:flex;justify-content:space-between;gap:12px;margin-top:10px;color:#64748b;font-size:10px"><span>ENTRY ${formatPrice(preSignal.entry)}</span><span>SUP ${formatPrice(levels.support)} · RES ${formatPrice(levels.resistance)}</span></footer>
            </section>`;
    }

    private advanceSimulation(): void {
        const previous = this.candles.at(-1);
        if (!previous) {
            this.candles = createInitialCandles(this.asset);
            return;
        }

        const volatility = Math.max(previous.close * 0.00035, Number.EPSILON);
        const drift = (Math.sin(Date.now() / 7_000) * 0.35 + Math.cos(Date.now() / 3_700) * 0.2) * volatility;
        const open = previous.close;
        const close = Math.max(0.00001, open + drift + ((Math.random() - 0.5) * volatility));
        const high = Math.max(open, close) + (volatility * 0.55);
        const low = Math.max(0.00001, Math.min(open, close) - (volatility * 0.55));

        this.candles = [
            ...this.candles.slice(-(MAX_CANDLES - 1)),
            {
                time: Math.floor(Date.now() / 1_000),
                open,
                high,
                low,
                close,
                volume: previous.volume + Math.round((Math.random() - 0.5) * 20),
            },
        ];
    }
}