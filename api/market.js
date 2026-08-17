export default async function handler(req, res) {
  try {
    // =====================================================
    // FINORIX MARKET API
    // Twelve Data
    //
    // PURPOSE:
    // 1. Historical CLOSED OHLC candles
    // 2. Latest market price
    // 3. Current minute timing
    // 4. Data quality information
    //
    // IMPORTANT:
    // The frontend will use livePrice to create
    // the ADVANCE / FORMING candle.
    // =====================================================

    const API_KEY =
      process.env.TWELVE_DATA_API_KEY;

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

    const symbol =
      String(
        req.query.symbol || "EUR/USD"
      ).trim();

    const interval =
      String(
        req.query.interval || "1min"
      ).trim();

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

    if (
      !allowedIntervals.includes(interval)
    ) {
      return res.status(400).json({
        status: "error",
        source: "Finorix API",
        message: "Unsupported interval",
        requestedInterval: interval,
        allowedIntervals
      });
    }

    // -----------------------------------------------------
    // 4. RESPONSE CACHE CONTROL
    // -----------------------------------------------------

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    // -----------------------------------------------------
    // 5. TIME SERIES REQUEST
    // -----------------------------------------------------

    const historyParams =
      new URLSearchParams({
        symbol,
        interval,
        outputsize: "150",
        timezone: "UTC",
        order: "asc",
        apikey: API_KEY
      });

    const historyUrl =
      "https://api.twelvedata.com/time_series?" +
      historyParams.toString();

    // -----------------------------------------------------
    // 6. LIVE PRICE REQUEST
    // -----------------------------------------------------

    const priceParams =
      new URLSearchParams({
        symbol,
        apikey: API_KEY
      });

    const priceUrl =
      "https://api.twelvedata.com/price?" +
      priceParams.toString();

    // -----------------------------------------------------
    // 7. FETCH HISTORY + LIVE PRICE TOGETHER
    // -----------------------------------------------------

    const [
      historyResponse,
      priceResponse
    ] = await Promise.all([

      fetch(historyUrl, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      }),

      fetch(priceUrl, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      })

    ]);

    // -----------------------------------------------------
    // 8. PARSE HISTORY JSON
    // -----------------------------------------------------

    let historyData;

    try {

      historyData =
        await historyResponse.json();

    } catch {

      return res.status(502).json({
        status: "error",
        source: "Twelve Data",
        message:
          "Invalid JSON response from Twelve Data time_series"
      });

    }

    // -----------------------------------------------------
    // 9. PARSE LIVE PRICE JSON
    // -----------------------------------------------------

    let priceData;

    try {

      priceData =
        await priceResponse.json();

    } catch {

      return res.status(502).json({
        status: "error",
        source: "Twelve Data",
        message:
          "Invalid JSON response from Twelve Data price endpoint"
      });

    }

    // -----------------------------------------------------
    // 10. HISTORY API ERROR
    // -----------------------------------------------------

    if (
      !historyResponse.ok ||
      historyData?.status === "error"
    ) {

      return res.status(
        historyResponse.ok
          ? 400
          : historyResponse.status
      ).json({

        status: "error",

        source: "Twelve Data",

        message:
          historyData?.message ||
          "Twelve Data time_series request failed",

        code:
          historyData?.code ||
          null

      });
    }

    // -----------------------------------------------------
    // 11. PRICE API ERROR
    // -----------------------------------------------------

    if (
      !priceResponse.ok ||
      priceData?.status === "error"
    ) {

      return res.status(
        priceResponse.ok
          ? 400
          : priceResponse.status
      ).json({

        status: "error",

        source: "Twelve Data",

        message:
          priceData?.message ||
          "Twelve Data price request failed",

        code:
          priceData?.code ||
          null

      });
    }

    // -----------------------------------------------------
    // 12. RAW HISTORY CHECK
    // -----------------------------------------------------

    if (
      !Array.isArray(historyData?.values) ||
      historyData.values.length === 0
    ) {

      return res.status(404).json({

        status: "error",

        source: "Twelve Data",

        message:
          "No candle data available",

        symbol,

        interval

      });
    }

    // =====================================================
    // 13. CURRENT SERVER TIME
    // =====================================================

    const nowMs =
      Date.now();

    const nowSeconds =
      Math.floor(
        nowMs / 1000
      );

    // -----------------------------------------------------
    // CURRENT 1-MINUTE CANDLE START
    // -----------------------------------------------------

    const currentMinuteStart =
      Math.floor(
        nowSeconds / 60
      ) * 60;

    // -----------------------------------------------------
    // CURRENT CANDLE REMAINING TIME
    // -----------------------------------------------------

    const elapsedSeconds =
      nowSeconds -
      currentMinuteStart;

    const remainingSeconds =
      60 -
      elapsedSeconds;

    // =====================================================
    // 14. NORMALIZE HISTORICAL OHLC
    // =====================================================

    const candles =
      historyData.values

        .map((item) => {

          const datetime =
            String(
              item.datetime || ""
            ).trim();

          const open =
            Number(item.open);

          const high =
            Number(item.high);

          const low =
            Number(item.low);

          const close =
            Number(item.close);

          const volume =
            item.volume !== undefined
              ? Number(item.volume)
              : null;

          const parsedDate =
            new Date(
              datetime.replace(
                " ",
                "T"
              ) + "Z"
            );

          const timestamp =
            Math.floor(
              parsedDate.getTime() /
              1000
            );

          return {

            time:
              timestamp,

            datetime,

            open,

            high,

            low,

            close,

            volume

          };

        })

        // ---------------------------------------------------
        // 15. VALIDATE OHLC
        // ---------------------------------------------------

        .filter((candle) => {

          const validOHLC =
            Number.isFinite(
              candle.open
            ) &&
            Number.isFinite(
              candle.high
            ) &&
            Number.isFinite(
              candle.low
            ) &&
            Number.isFinite(
              candle.close
            );

          const validTime =
            Number.isFinite(
              candle.time
            );

          const validStructure =
            candle.high >=
              candle.low &&

            candle.high >=
              candle.open &&

            candle.high >=
              candle.close &&

            candle.low <=
              candle.open &&

            candle.low <=
              candle.close;

          return (
            validOHLC &&
            validTime &&
            validStructure
          );

        });

    // =====================================================
    // 16. SORT OLDEST -> NEWEST
    // =====================================================

    candles.sort(
      (a, b) =>
        a.time - b.time
    );

    // =====================================================
    // 17. REMOVE DUPLICATES
    // =====================================================

    const uniqueCandles =
      [];

    const timestamps =
      new Set();

    for (
      const candle of candles
    ) {

      if (
        !timestamps.has(
          candle.time
        )
      ) {

        timestamps.add(
          candle.time
        );

        uniqueCandles.push(
          candle
        );
      }
    }

    // =====================================================
    // 18. IMPORTANT:
    // REMOVE CURRENT FORMING CANDLE
    //
    // The historical engine must use CLOSED candles only.
    // The current minute will be generated separately
    // by the frontend as ADVANCE candle.
    // =====================================================

    const closedCandles =
      uniqueCandles.filter(
        (candle) =>
          candle.time <
          currentMinuteStart
      );

    // -----------------------------------------------------
    // 19. MINIMUM CLOSED DATA CHECK
    // -----------------------------------------------------

    if (
      closedCandles.length < 60
    ) {

      return res.status(422).json({

        status: "error",

        source: "Finorix API",

        message:
          "Not enough CLOSED candle data for prediction engine",

        symbol,

        interval,

        count:
          closedCandles.length,

        minimumRequired:
          60

      });
    }

    // =====================================================
    // 20. LATEST CLOSED CANDLE
    // =====================================================

    const latestClosed =
      closedCandles[
        closedCandles.length - 1
      ];

    // =====================================================
    // 21. LIVE PRICE
    // =====================================================

    const livePrice =
      Number(
        priceData?.price
      );

    if (
      !Number.isFinite(
        livePrice
      )
    ) {

      return res.status(502).json({

        status: "error",

        source: "Twelve Data",

        message:
          "Live price is unavailable",

        symbol

      });
    }

    // =====================================================
    // 22. CREATE CURRENT ADVANCE CANDLE
    //
    // This is NOT returned inside "candles".
    //
    // It is a separate forming candle.
    //
    // Example:
    //
    // 18:50 = CLOSED
    // 18:51 = ADVANCE / FORMING
    //
    // At 18:51:00 it starts from second 0.
    // At 18:51:01 it updates.
    // ...
    // At 18:51:59 it keeps forming.
    // At 18:52:00 it becomes closed.
    // =====================================================

    const previousClose =
      latestClosed.close;

    const advanceOpen =
      previousClose;

    const advanceHigh =
      Math.max(
        advanceOpen,
        livePrice
      );

    const advanceLow =
      Math.min(
        advanceOpen,
        livePrice
      );

    const advanceCandle = {

      time:
        currentMinuteStart,

      datetime:
        new Date(
          currentMinuteStart * 1000
        )
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),

      open:
        advanceOpen,

      high:
        advanceHigh,

      low:
        advanceLow,

      close:
        livePrice,

      volume:
        null,

      isAdvance:
        true,

      isClosed:
        false

    };

    // =====================================================
    // 23. MARKET AGE
    //
    // Age of latest CLOSED candle.
    // =====================================================

    const ageSeconds =
      Math.max(
        0,
        nowSeconds -
          latestClosed.time
      );

    // =====================================================
    // 24. STALE LIMIT
    // =====================================================

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
      staleLimit[
        interval
      ] || 300;

    const isStale =
      ageSeconds >
      limit;

    // =====================================================
    // 25. FLAT MARKET CHECK
    // =====================================================

    const recent =
      closedCandles.slice(
        -20
      );

    const uniqueCloses =
      new Set(
        recent.map(
          candle =>
            candle.close
        )
      );

    const flatMarket =
      recent.length >= 10 &&
      uniqueCloses.size <= 2;

    // =====================================================
    // 26. DATA QUALITY
    // =====================================================

    let dataQuality =
      "OK";

    if (isStale) {

      dataQuality =
        "STALE";

    } else if (flatMarket) {

      dataQuality =
        "FLAT";
    }

    // =====================================================
    // 27. RESPONSE
    // =====================================================

    return res.status(200).json({

      status:
        "ok",

      source:
        "Twelve Data",

      symbol:
        historyData?.meta?.symbol ||
        symbol,

      interval,

      timezone:
        "UTC",

      count:
        closedCandles.length,

      // ---------------------------------------------------
      // HISTORICAL CLOSED CANDLES ONLY
      // ---------------------------------------------------

      candles:
        closedCandles,

      // ---------------------------------------------------
      // LIVE MARKET DATA
      // ---------------------------------------------------

      live: {

        price:
          livePrice,

        timestamp:
          nowSeconds,

        currentMinuteStart,

        elapsedSeconds,

        remainingSeconds,

        isForming:
          true

      },

      // ---------------------------------------------------
      // ADVANCE CANDLE
      // ---------------------------------------------------

      advanceCandle,

      // ---------------------------------------------------
      // MARKET STATUS
      // ---------------------------------------------------

      market: {

        latestCandleTime:
          latestClosed.datetime,

        latestTimestamp:
          latestClosed.time,

        latestPrice:
          livePrice,

        previousClose,

        ageSeconds,

        isStale,

        flatMarket,

        dataQuality,

        currentMinuteStart,

        elapsedSeconds,

        remainingSeconds

      }

    });

  } catch (error) {

    console.error(
      "FINORIX MARKET API ERROR:",
      error
    );

    return res.status(500).json({

      status:
        "error",

      source:
        "Finorix API",

      message:
        "Internal server error",

      error:
        error?.message ||
        "Unknown error"

    });
  }
}
