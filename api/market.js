export default async function handler(req, res) {
  try {
    // ==========================================
    // 1. API KEY
    // ==========================================
    const API_KEY = process.env.TWELVE_DATA_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        status: "error",
        message:
          "TWELVE_DATA_API_KEY is missing in Vercel Environment Variables"
      });
    }

    // ==========================================
    // 2. INPUT
    // ==========================================
    const symbol = String(req.query.symbol || "EUR/USD").trim();
    const interval = String(req.query.interval || "1min").trim();

    // ==========================================
    // 3. ALLOWED INTERVALS
    // ==========================================
    const allowedIntervals = [
      "1min",
      "5min",
      "15min",
      "30min",
      "45min",
      "1h",
      "2h",
      "4h",
      "8h",
      "1day"
    ];

    if (!allowedIntervals.includes(interval)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid interval",
        allowedIntervals
      });
    }

    // ==========================================
    // 4. BUILD TWELVE DATA URL
    // ==========================================
    const params = new URLSearchParams({
      symbol,
      interval,
      outputsize: "150",
      timezone: "UTC",
      order: "desc",
      apikey: API_KEY
    });

    const url =
      "https://api.twelvedata.com/time_series?" +
      params.toString();

    // ==========================================
    // 5. REQUEST DATA
    // ==========================================
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const data = await response.json();

    // ==========================================
    // 6. TWELVE DATA ERROR
    // ==========================================
    if (!response.ok || data.status === "error") {
      return res.status(response.status || 400).json({
        status: "error",
        source: "Twelve Data",
        message: data.message || "Twelve Data request failed",
        code: data.code || null
      });
    }

    // ==========================================
    // 7. RAW VALUES CHECK
    // ==========================================
    if (!Array.isArray(data.values) || data.values.length === 0) {
      return res.status(404).json({
        status: "error",
        source: "Twelve Data",
        message: "No candle data available",
        symbol,
        interval
      });
    }

    // ==========================================
    // 8. NORMALIZE CANDLES
    // ==========================================
    const candles = data.values
      .map((item) => {
        const open = Number(item.open);
        const high = Number(item.high);
        const low = Number(item.low);
        const close = Number(item.close);

        const datetime = item.datetime;

        const timestamp = Math.floor(
          new Date(datetime).getTime() / 1000
        );

        return {
          time: timestamp,
          datetime,
          open,
          high,
          low,
          close
        };
      })

      // ========================================
      // 9. REMOVE INVALID CANDLES
      // ========================================
      .filter((candle) => {
        return (
          Number.isFinite(candle.time) &&
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close) &&
          candle.high >= candle.low &&
          candle.high >= candle.open &&
          candle.high >= candle.close &&
          candle.low <= candle.open &&
          candle.low <= candle.close
        );
      });

    // ==========================================
    // 10. SORT OLDEST -> NEWEST
    // ==========================================
    candles.sort((a, b) => a.time - b.time);

    // ==========================================
    // 11. REMOVE DUPLICATE TIMESTAMPS
    // ==========================================
    const uniqueCandles = [];
    const seen = new Set();

    for (const candle of candles) {
      if (!seen.has(candle.time)) {
        seen.add(candle.time);
        uniqueCandles.push(candle);
      }
    }

    // ==========================================
    // 12. BASIC DATA QUALITY CHECK
    // ==========================================
    const latest =
      uniqueCandles.length > 0
        ? uniqueCandles[uniqueCandles.length - 1]
        : null;

    if (!latest) {
      return res.status(404).json({
        status: "error",
        source: "Twelve Data",
        message: "No valid candles after normalization"
      });
    }

    // ==========================================
    // 13. CHECK FOR FLAT / SUSPICIOUS DATA
    // ==========================================
    const recent = uniqueCandles.slice(-20);

    const uniqueCloses = new Set(
      recent.map((candle) => candle.close)
    );

    const flatMarket =
      recent.length >= 10 && uniqueCloses.size <= 2;

    // ==========================================
    // 14. MARKET STATUS
    // ==========================================
    const now = Date.now();

    const latestMs = latest.time * 1000;

    const ageSeconds = Math.max(
      0,
      Math.floor((now - latestMs) / 1000)
    );

    // For 1-minute candles, > 5 minutes old is considered stale.
    // For higher intervals we use a wider tolerance.
    const staleLimit = {
      "1min": 300,
      "5min": 900,
      "15min": 1800,
      "30min": 3600,
      "45min": 5400,
      "1h": 7200,
      "2h": 14400,
      "4h": 28800,
      "8h": 57600,
      "1day": 172800
    };

    const isStale =
      ageSeconds > staleLimit[interval];

    // ==========================================
    // 15. RETURN CLEAN RESPONSE
    // ==========================================
    return res.status(200).json({
      status: "ok",
      source: "Twelve Data",

      symbol:
        data.meta?.symbol || symbol,

      interval,

      timezone: "UTC",

      count: uniqueCandles.length,

      market: {
        latestCandleTime: latest.datetime,
        latestPrice: latest.close,

        ageSeconds,

        isStale,

        flatMarket,

        dataQuality:
          isStale
            ? "STALE"
            : flatMarket
            ? "FLAT"
            : "OK"
      },

      candles: uniqueCandles
    });

  } catch (error) {
    console.error("MARKET API ERROR:", error);

    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error?.message || "Unknown error"
    });
  }
}
