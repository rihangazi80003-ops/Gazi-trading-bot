export default async function handler(req, res) {
  try {
    // =====================================================
    // FINORIX MARKET API
    // Twelve Data -> Clean OHLC Candle Data
    // =====================================================

    const API_KEY = process.env.TWELVE_DATA_API_KEY;

    // -----------------------------------------------------
    // 1. API KEY CHECK
    // -----------------------------------------------------

    if (!API_KEY) {
      return res.status(500).json({
        status: "error",
        source: "Finorix API",
        message:
          "TWELVE_DATA_API_KEY is missing in Vercel Environment Variables"
      });
    }

    // -----------------------------------------------------
    // 2. INPUT
    // -----------------------------------------------------

    const symbol = String(
      req.query.symbol || "EUR/USD"
    ).trim();

    const interval = String(
      req.query.interval || "1min"
    ).trim();

    // -----------------------------------------------------
    // 3. ALLOWED TWELVE DATA INTERVALS
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
    // 4. REQUEST PARAMETER
    // -----------------------------------------------------

    const params = new URLSearchParams({
      symbol,
      interval,
      outputsize: "150",
      timezone: "UTC",
      order: "asc",
      apikey: API_KEY
    });

    const apiUrl =
      "https://api.twelvedata.com/time_series?" +
      params.toString();

    // -----------------------------------------------------
    // 5. FETCH TWELVE DATA
    // -----------------------------------------------------

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    let data;

    try {
      data = await response.json();
    } catch {
      return res.status(502).json({
        status: "error",
        source: "Twelve Data",
        message: "Invalid JSON response from Twelve Data"
      });
    }

    // -----------------------------------------------------
    // 6. TWELVE DATA ERROR
    // -----------------------------------------------------

    if (
      !response.ok ||
      data?.status === "error"
    ) {
      return res.status(response.ok ? 400 : response.status).json({
        status: "error",
        source: "Twelve Data",
        message:
          data?.message ||
          "Twelve Data request failed",
        code:
          data?.code ||
          null
      });
    }

    // -----------------------------------------------------
    // 7. RAW CANDLE CHECK
    // -----------------------------------------------------

    if (
      !Array.isArray(data?.values) ||
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

    // -----------------------------------------------------
    // 8. NORMALIZE OHLC
    // -----------------------------------------------------

    const candles = data.values
      .map((item) => {

        const datetime = String(
          item.datetime || ""
        ).trim();

        const open = Number(item.open);
        const high = Number(item.high);
        const low = Number(item.low);
        const close = Number(item.close);

        const volume =
          item.volume !== undefined
            ? Number(item.volume)
            : null;

        const timestamp =
          Math.floor(
            new Date(
              datetime.replace(" ", "T") + "Z"
            ).getTime() / 1000
          );

        return {
          time: timestamp,
          datetime,
          open,
          high,
          low,
          close,
          volume
        };
      })

      // ---------------------------------------------------
      // 9. VALIDATION
      // ---------------------------------------------------

      .filter((candle) => {

        const validOHLC =
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close);

        const validTime =
          Number.isFinite(candle.time);

        const validStructure =
          candle.high >= candle.low &&
          candle.high >= candle.open &&
          candle.high >= candle.close &&
          candle.low <= candle.open &&
          candle.low <= candle.close;

        return (
          validOHLC &&
          validTime &&
          validStructure
        );
      });

    // -----------------------------------------------------
    // 10. SORT OLDEST -> NEWEST
    // -----------------------------------------------------

    candles.sort(
      (a, b) => a.time - b.time
    );

    // -----------------------------------------------------
    // 11. REMOVE DUPLICATES
    // -----------------------------------------------------

    const uniqueCandles = [];
    const timestamps = new Set();

    for (const candle of candles) {

      if (
        !timestamps.has(candle.time)
      ) {

        timestamps.add(candle.time);
        uniqueCandles.push(candle);

      }

    }

    // -----------------------------------------------------
    // 12. MINIMUM DATA CHECK
    // -----------------------------------------------------

    if (uniqueCandles.length < 60) {

      return res.status(422).json({
        status: "error",
        source: "Finorix API",
        message:
          "Not enough candle data for prediction engine",
        symbol,
        interval,
        count: uniqueCandles.length,
        minimumRequired: 60
      });

    }

    // -----------------------------------------------------
    // 13. LATEST CANDLE
    // -----------------------------------------------------

    const latest =
      uniqueCandles[
        uniqueCandles.length - 1
      ];

    // -----------------------------------------------------
    // 14. MARKET AGE
    // -----------------------------------------------------

    const nowSeconds =
      Math.floor(Date.now() / 1000);

    const ageSeconds =
      Math.max(
        0,
        nowSeconds - latest.time
      );

    // -----------------------------------------------------
    // 15. STALE LIMIT
    // -----------------------------------------------------

    const staleLimit = {

      "1min": 300,

      "5min": 900,

      "15min": 1800,

      "30min": 3600,

      "45min": 5400,

      "1h": 7200,

      "2h": 14400,

      "4h": 28800,

      "5h": 36000,

      "8h": 57600,

      "1day": 172800

    };

    const limit =
      staleLimit[interval] || 300;

    const isStale =
      ageSeconds > limit;

    // -----------------------------------------------------
    // 16. FLAT MARKET CHECK
    // -----------------------------------------------------

    const recent =
      uniqueCandles.slice(-20);

    const uniqueCloses =
      new Set(
        recent.map(
          candle => candle.close
        )
      );

    const flatMarket =
      recent.length >= 10 &&
      uniqueCloses.size <= 2;

    // -----------------------------------------------------
    // 17. DATA QUALITY
    // -----------------------------------------------------

    let dataQuality = "OK";

    if (isStale) {

      dataQuality = "STALE";

    } else if (flatMarket) {

      dataQuality = "FLAT";

    }

    // -----------------------------------------------------
    // 18. LATEST PRICE
    // -----------------------------------------------------

    const latestPrice =
      latest.close;

    // -----------------------------------------------------
    // 19. RESPONSE
    // -----------------------------------------------------

    return res.status(200).json({

      status: "ok",

      source: "Twelve Data",

      symbol:
        data.meta?.symbol ||
        symbol,

      interval,

      timezone: "UTC",

      count:
        uniqueCandles.length,

      market: {

        latestCandleTime:
          latest.datetime,

        latestTimestamp:
          latest.time,

        latestPrice,

        ageSeconds,

        isStale,

        flatMarket,

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

      message:
        "Internal server error",

      error:
        error?.message ||
        "Unknown error"

    });

  }
}
