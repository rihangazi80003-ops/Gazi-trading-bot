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
    // 3. TWELVE DATA REQUEST
    // ==========================================
    const params = new URLSearchParams({
      symbol,
      interval,
      outputsize: "150",
      timezone: "UTC"
    });

    const url =
      "https://api.twelvedata.com/time_series?" +
      params.toString();

    const response = await fetch(url, {
      headers: {
        Authorization: "apikey " + API_KEY
      }
    });

    const data = await response.json();

    // ==========================================
    // 4. TWELVE DATA ERROR
    // ==========================================
    if (!response.ok || data.status === "error") {
      return res.status(response.status || 400).json({
        status: "error",
        message: data.message || "Twelve Data request failed",
        code: data.code || null
      });
    }

    // ==========================================
    // 5. VALIDATE RAW DATA
    // ==========================================
    if (!Array.isArray(data.values) || data.values.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No candle data received from Twelve Data"
      });
    }

    // ==========================================
    // 6. NORMALIZE + VALIDATE CANDLES
    // ==========================================
    const candleMap = new Map();

    for (const item of data.values) {
      if (!item || !item.datetime) continue;

      const open = Number(item.open);
      const high = Number(item.high);
      const low = Number(item.low);
      const close = Number(item.close);

      // Basic number validation
      if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        continue;
      }

      // Basic OHLC validation
      if (
        high < Math.max(open, close) ||
        low > Math.min(open, close) ||
        high < low
      ) {
        continue;
      }

      // ========================================
      // Convert Twelve Data datetime -> Unix
      // Lightweight Charts works best with
      // Unix timestamp for intraday candles.
      // ========================================
      let datetime = String(item.datetime).trim();

      // Twelve Data is requested in UTC.
      // Add Z if timezone information is absent.
      if (
        !datetime.endsWith("Z") &&
        !/[+-]\d{2}:\d{2}$/.test(datetime)
      ) {
        datetime = datetime.replace(" ", "T") + "Z";
      }

      const timestampMs = Date.parse(datetime);

      if (!Number.isFinite(timestampMs)) {
        continue;
      }

      const time = Math.floor(timestampMs / 1000);

      // Prevent duplicate candle timestamps
      candleMap.set(time, {
        time,
        datetime: datetime,
        open,
        high,
        low,
        close
      });
    }

    // ==========================================
    // 7. SORT CHRONOLOGICALLY
    // ==========================================
    const candles = Array.from(candleMap.values())
      .sort((a, b) => a.time - b.time);

    if (candles.length < 20) {
      return res.status(502).json({
        status: "error",
        message: "Not enough valid candles received",
        received: candles.length
      });
    }

    // ==========================================
    // 8. RESPONSE CACHE
    // ==========================================
    res.setHeader(
      "Cache-Control",
      "s-maxage=10, stale-while-revalidate=20"
    );

    // ==========================================
    // 9. RETURN CLEAN MARKET DATA
    // ==========================================
    return res.status(200).json({
      status: "ok",
      source: "Twelve Data",
      symbol: data.meta?.symbol || symbol,
      interval,
      timezone: "UTC",
      count: candles.length,
      candles
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
