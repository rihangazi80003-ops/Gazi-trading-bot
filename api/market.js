export default async function handler(req, res) {
  try {
    // =====================================================
    // FINORIX MARKET API v2
    // Twelve Data -> Stable OHLC Candle Engine
    // =====================================================

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const API_KEY = process.env.TWELVE_DATA_API_KEY;

    // -----------------------------------------------------
    // 1. API KEY
    // -----------------------------------------------------

    if (!API_KEY) {
      return res.status(500).json({
        status: "error",
        source: "Finorix API",
        message: "TWELVE_DATA_API_KEY is missing"
      });
    }

    // -----------------------------------------------------
    // 2. INPUT
    // -----------------------------------------------------

    const symbol =
      String(req.query.symbol || "EUR/USD").trim();

    const interval =
      String(req.query.interval || "1min").trim();

    // -----------------------------------------------------
    // 3. ALLOWED INTERVALS
    // -----------------------------------------------------

    const allowedIntervals = [
      "1min",
      "5min",
      "15min",
      "30min",
      "45min",
      "1h",
      "2h",
      "4h",
      "5h",
      "8h",
      "1day"
    ];

    if (!allowedIntervals.includes(interval)) {
      return res.status(400).json({
        status: "error",
        source: "Finorix API",
        message: "Unsupported interval",
        requestedInterval: interval,
        allowedIntervals
      });
    }

    // -----------------------------------------------------
    // 4. TWELVE DATA REQUEST
    // -----------------------------------------------------

    const params = new URLSearchParams();

    params.set("symbol", symbol);
    params.set("interval", interval);

    // Keep enough historical candles for indicators.
    params.set("outputsize", "150");

    // Important:
    // Request UTC so candle boundaries remain consistent.
    params.set("timezone", "UTC");

    params.set("order", "asc");
    params.set("apikey", API_KEY);

    const apiUrl =
      "https://api.twelvedata.com/time_series?" +
      params.toString();

    // -----------------------------------------------------
    // 5. FETCH
    // -----------------------------------------------------

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    // -----------------------------------------------------
    // 6. JSON RESPONSE
    // -----------------------------------------------------

    let data;

    try {
      data = await response.json();
    } catch (error) {
      return res.status(502).json({
        status: "error",
        source: "Twelve Data",
        message: "Invalid JSON response from Twelve Data"
      });
    }

    // -----------------------------------------------------
    // 7. TWELVE DATA ERROR
    // -----------------------------------------------------

    if (!response.ok || data?.status === "error") {
      return res.status(response.ok ? 400 : response.status).json({
        status: "error",
        source: "Twelve Data",
        message:
          data?.message ||
          "Twelve Data request failed",
        code:
          data?.code ||
          null,
        symbol,
        interval
      });
    }

    // -----------------------------------------------------
    // 8. RAW VALUES CHECK
    // -----------------------------------------------------

    if (
      !data ||
      !Array.isArray(data.values) ||
      data.values.length === 0
    ) {
      return res.status(404).json({
        status: "error",
        source: "Twelve Data",
        message: "No candle data available",
        symbol,
        interval
      });
    }

    // =====================================================
    // 9. DATETIME -> UNIX TIMESTAMP
    // =====================================================

    function parseTimestamp(value) {
      if (value === null || value === undefined) {
        return null;
      }

      // Already numeric timestamp
      if (typeof value === "number") {
        if (!Number.isFinite(value)) {
          return null;
        }

        return value > 1000000000000
          ? Math.floor(value / 1000)
          : Math.floor(value);
      }

      const text = String(value).trim();

      if (!text) {
        return null;
      }

      /*
       * Twelve Data normally returns:
       *
       * 2026-08-17 12:22:00
       *
       * Convert to:
       *
       * 2026-08-17T12:22:00Z
       */

      let normalized = text.replace(" ", "T");

      /*
       * If there is already timezone information,
       * don't append another Z.
       */

      const hasTimezone =
        normalized.endsWith("Z") ||
        /[+-]\d{2}:\d{2}$/.test(normalized);

      if (!hasTimezone) {
        normalized += "Z";
      }

      const timestamp =
        Math.floor(
          new Date(normalized).getTime() / 1000
        );

      if (!Number.isFinite(timestamp)) {
        return null;
      }

      return timestamp;
    }

    // =====================================================
    // 10. NORMALIZE CANDLES
    // =====================================================

    const normalized = [];

    for (const item of data.values) {
      if (!item) {
        continue;
      }

      const datetime =
        String(item.datetime || "").trim();

      const time =
        parseTimestamp(
          item.datetime ??
          item.timestamp ??
          item.time
        );

      const open =
        Number(item.open);

      const high =
        Number(item.high);

      const low =
        Number(item.low);

      const close =
        Number(item.close);

      let volume = null;

      if (
        item.volume !== undefined &&
        item.volume !== null &&
        item.volume !== ""
      ) {
        const parsedVolume =
          Number(item.volume);

        if (Number.isFinite(parsedVolume)) {
          volume = parsedVolume;
        }
      }

      // ---------------------------------------------------
      // OHLC VALIDATION
      // ---------------------------------------------------

      const validNumbers =
        Number.isFinite(time) &&
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close);

      if (!validNumbers) {
        continue;
      }

      const validOHLC =
        high >= Math.max(open, close) &&
        low <= Math.min(open, close) &&
        high >= low;

      if (!validOHLC) {
        continue;
      }

      normalized.push({
        time,
        datetime,
        open,
        high,
        low,
        close,
        volume
      });
    }

    // -----------------------------------------------------
    // 11. SORT
    // -----------------------------------------------------

    normalized.sort(
      (a, b) => a.time - b.time
    );

    // -----------------------------------------------------
    // 12. REMOVE DUPLICATES
    // -----------------------------------------------------

    const uniqueCandles = [];
    const candleMap = new Map();

    for (const candle of normalized) {
      candleMap.set(
        candle.time,
        candle
      );
    }

    for (const candle of candleMap.values()) {
      uniqueCandles.push(candle);
    }

    uniqueCandles.sort(
      (a, b) => a.time - b.time
    );

    // -----------------------------------------------------
    // 13. DATA COUNT
    // -----------------------------------------------------

    const count =
      uniqueCandles.length;

    /*
     * IMPORTANT:
     *
     * Do NOT return HTTP 422 simply because there are
     * fewer than 60 candles.
     *
     * The frontend can still display the market if there
     * are enough candles for basic operation.
     */

    if (count === 0) {
      return res.status(404).json({
        status: "error",
        source: "Finorix API",
        message: "No valid candles after normalization",
        symbol,
        interval,
        rawCount: data.values.length
      });
    }

    // =====================================================
    // 14. LATEST CANDLE
    // =====================================================

    const latest =
      uniqueCandles[count - 1];

    // =====================================================
    // 15. MARKET AGE
    // =====================================================

    const nowSeconds =
      Math.floor(Date.now() / 1000);

    const ageSeconds =
      Math.max(
        0,
        nowSeconds - latest.time
      );

    // =====================================================
    // 16. EXPECTED CANDLE DURATION
    // =====================================================

    const intervalSeconds = {
      "1min": 60,
      "5min": 300,
      "15min": 900,
      "30min": 1800,
      "45min": 2700,
      "1h": 3600,
      "2h": 7200,
      "4h": 14400,
      "5h": 18000,
      "8h": 28800,
      "1day": 86400
    };

    const candleDuration =
      intervalSeconds[interval] || 60;

    // =====================================================
    // 17. STALE CHECK
    // =====================================================

    /*
     * We allow some tolerance because the latest candle
     * from an external provider can arrive slightly late.
     */

    const staleLimit =
      candleDuration * 3;

    const isStale =
      ageSeconds > staleLimit;

    // =====================================================
    // 18. FLAT MARKET CHECK
    // =====================================================

    const recent =
      uniqueCandles.slice(-20);

    const uniqueCloses =
      new Set(
        recent.map(
          candle =>
            Number(candle.close)
        )
      );

    const flatMarket =
      recent.length >= 10 &&
      uniqueCloses.size <= 2;

    // =====================================================
    // 19. CANDLE CONTINUITY CHECK
    // =====================================================

    let missingIntervals = 0;

    if (uniqueCandles.length >= 2) {
      for (
        let i = 1;
        i < uniqueCandles.length;
        i++
      ) {
        const difference =
          uniqueCandles[i].time -
          uniqueCandles[i - 1].time;

        /*
         * A gap larger than the expected candle duration
         * means one or more candles may be missing.
         */

        if (
          difference >
          candleDuration * 1.5
        ) {
          missingIntervals++;
        }
      }
    }

    // =====================================================
    // 20. DATA QUALITY
    // =====================================================

    let dataQuality = "OK";

    if (isStale) {
      dataQuality = "STALE";
    } else if (flatMarket) {
      dataQuality = "FLAT";
    } else if (count < 35) {
      dataQuality = "LIMITED";
    } else if (missingIntervals > 0) {
      dataQuality = "GAPS";
    }

    // =====================================================
    // 21. INDICATOR READINESS
    // =====================================================

    const indicatorReady =
      count >= 35;

    // =====================================================
    // 22. RESPONSE
    // =====================================================

    return res.status(200).json({
      status: "ok",

      source: "Twelve Data",

      symbol:
        data.meta?.symbol ||
        symbol,

      interval,

      timezone: "UTC",

      count,

      indicatorReady,

      market: {
        latestCandleTime:
          latest.datetime,

        latestTimestamp:
          latest.time,

        latestPrice:
          latest.close,

        ageSeconds,

        candleDuration,

        isStale,

        flatMarket,

        missingIntervals,

        dataQuality
      },

      candles:
        uniqueCandles
    });

  } catch (error) {
    console.error(
      "FINORIX MARKET API ERROR:",
      error
    );

    return res.status(500).json({
      status: "error",
      source: "Finorix API",
      message: "Internal server error",
      error:
        error?.message ||
        "Unknown error"
    });
  }
}
