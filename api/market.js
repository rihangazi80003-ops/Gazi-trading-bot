export default async function handler(req, res) {
  try {
    /*
    ============================================================
      FINORIX MARKET API
      REAL + OTC MARKET ADAPTER

      REAL:
        Twelve Data

      OTC:
        External authorized OTC feed
        configured through Vercel Environment Variable

      IMPORTANT:
        Twelve Data does NOT provide Quotex OTC candles.
        Therefore OTC_FEED_URL must point to a valid OTC source.
    ============================================================
    */

    const TWELVE_DATA_API_KEY =
      process.env.TWELVE_DATA_API_KEY;

    const OTC_FEED_URL =
      process.env.OTC_FEED_URL;


    /* =========================================================
       1. INPUT
    ========================================================= */

    const symbol = String(
      req.query.symbol || "EUR/USD"
    ).trim();

    const interval = String(
      req.query.interval || "1min"
    ).trim();

    const marketType = String(
      req.query.market || "real"
    )
      .trim()
      .toLowerCase();


    /* =========================================================
       2. VALIDATE MARKET TYPE
    ========================================================= */

    const allowedMarkets = [
      "real",
      "otc"
    ];

    if (!allowedMarkets.includes(marketType)) {
      return res.status(400).json({
        status: "error",
        source: "Finorix API",
        message: "Unsupported market type",
        requestedMarket: marketType,
        allowedMarkets
      });
    }


    /* =========================================================
       3. VALIDATE INTERVAL
    ========================================================= */

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


    /* =========================================================
       4. REAL MARKET
       Twelve Data
    ========================================================= */

    if (marketType === "real") {

      if (!TWELVE_DATA_API_KEY) {
        return res.status(500).json({
          status: "error",
          source: "Finorix API",
          market: "real",
          message:
            "TWELVE_DATA_API_KEY is missing in Vercel Environment Variables"
        });
      }


      const params = new URLSearchParams({
        symbol,
        interval,
        outputsize: "150",
        timezone: "UTC",
        order: "asc",
        apikey: TWELVE_DATA_API_KEY
      });


      const apiUrl =
        "https://api.twelvedata.com/time_series?" +
        params.toString();


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
          market: "real",
          message:
            "Invalid JSON response from Twelve Data"
        });
      }


      if (
        !response.ok ||
        data?.status === "error"
      ) {
        return res.status(
          response.ok ? 400 : response.status
        ).json({
          status: "error",
          source: "Twelve Data",
          market: "real",
          message:
            data?.message ||
            "Twelve Data request failed",
          code:
            data?.code ||
            null
        });
      }


      if (
        !Array.isArray(data?.values) ||
        data.values.length === 0
      ) {
        return res.status(404).json({
          status: "error",
          source: "Twelve Data",
          market: "real",
          message: "No candle data available",
          symbol,
          interval
        });
      }


      const candles =
        normalizeCandles(
          data.values
        );


      if (candles.length < 60) {
        return res.status(422).json({
          status: "error",
          source: "Finorix API",
          market: "real",
          message:
            "Not enough candle data for prediction engine",
          symbol,
          interval,
          count: candles.length,
          minimumRequired: 60
        });
      }


      const marketInfo =
        buildMarketInfo(
          candles,
          interval
        );


      return res.status(200).json({

        status: "ok",

        source: "Twelve Data",

        market: "REAL",

        symbol:
          data.meta?.symbol ||
          symbol,

        interval,

        timezone: "UTC",

        count:
          candles.length,

        indicatorReady:
          candles.length >= 60,

        marketInfo,

        candles
      });
    }


    /* =========================================================
       5. OTC MARKET
    ========================================================= */

    if (marketType === "otc") {

      /*
        OTC_FEED_URL must be configured in Vercel.

        Example concept:

        OTC_FEED_URL =
        https://your-authorized-feed.example/candles

        Do NOT put the OTC URL in frontend code.
      */

      if (!OTC_FEED_URL) {
        return res.status(503).json({
          status: "error",
          source: "Finorix OTC Adapter",
          market: "OTC",
          message:
            "OTC feed is not configured",
          instruction:
            "Add OTC_FEED_URL to Vercel Environment Variables"
        });
      }


      /*
        We only append safe query parameters.
        The actual feed must support them.
      */

      const otcParams =
        new URLSearchParams({
          symbol,
          interval,
          limit: "150"
        });


      const separator =
        OTC_FEED_URL.includes("?")
          ? "&"
          : "?";


      const otcUrl =
        OTC_FEED_URL +
        separator +
        otcParams.toString();


      const response =
        await fetch(
          otcUrl,
          {
            method: "GET",
            headers: {
              Accept:
                "application/json"
            },
            cache: "no-store"
          }
        );


      let data;

      try {
        data =
          await response.json();
      } catch {
        return res.status(502).json({
          status: "error",
          source: "OTC Feed",
          market: "OTC",
          message:
            "Invalid JSON response from OTC feed"
        });
      }


      if (!response.ok) {
        return res.status(
          response.status
        ).json({
          status: "error",
          source: "OTC Feed",
          market: "OTC",
          message:
            data?.message ||
            "OTC feed request failed"
        });
      }


      /*
        Flexible OTC response support.

        Supported examples:

        {
          candles: [...]
        }

        {
          data: {
            candles: [...]
          }
        }

        {
          values: [...]
        }

        or directly:

        [...]
      */

      let rawCandles = [];


      if (Array.isArray(data)) {

        rawCandles = data;

      } else if (
        Array.isArray(data?.candles)
      ) {

        rawCandles =
          data.candles;

      } else if (
        Array.isArray(data?.values)
      ) {

        rawCandles =
          data.values;

      } else if (
        data?.data &&
        Array.isArray(
          data.data.candles
        )
      ) {

        rawCandles =
          data.data.candles;
      }


      const candles =
        normalizeCandles(
          rawCandles
        );


      if (candles.length < 60) {

        return res.status(422).json({
          status: "error",
          source: "OTC Feed",
          market: "OTC",
          message:
            "OTC feed returned insufficient candle data",
          symbol,
          interval,
          count:
            candles.length,
          minimumRequired: 60
        });
      }


      const marketInfo =
        buildMarketInfo(
          candles,
          interval
        );


      return res.status(200).json({

        status: "ok",

        source:
          "Authorized OTC Feed",

        market: "OTC",

        symbol,

        interval,

        timezone: "UTC",

        count:
          candles.length,

        indicatorReady:
          candles.length >= 60,

        marketInfo,

        candles
      });
    }


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


/* ============================================================
   NORMALIZE CANDLES
   ============================================================ */

function normalizeCandles(raw) {

  if (!Array.isArray(raw)) {
    return [];
  }


  const candles = [];


  for (const item of raw) {

    if (!item) {
      continue;
    }


    const datetime =
      item.datetime ??
      item.date ??
      item.time;


    const time =
      normalizeTime(
        datetime
      );


    const open =
      Number(
        item.open
      );

    const high =
      Number(
        item.high
      );

    const low =
      Number(
        item.low
      );

    const close =
      Number(
        item.close
      );


    if (
      !Number.isFinite(time) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }


    /*
      OHLC structural validation
    */

    if (
      high < low ||
      high < open ||
      high < close ||
      low > open ||
      low > close
    ) {
      continue;
    }


    candles.push({

      time,

      datetime:
        new Date(
          time * 1000
        ).toISOString(),

      open,

      high,

      low,

      close,

      volume:
        item.volume !== undefined
          ? Number(item.volume)
          : null
    });
  }


  /*
    Oldest → newest
  */

  candles.sort(
    (a, b) =>
      a.time - b.time
  );


  /*
    Remove duplicate timestamps
  */

  const unique = [];

  const timestamps =
    new Set();


  for (const candle of candles) {

    if (
      timestamps.has(
        candle.time
      )
    ) {
      continue;
    }


    timestamps.add(
      candle.time
    );

    unique.push(
      candle
    );
  }


  return unique;
}


/* ============================================================
   TIME NORMALIZER
   ============================================================ */

function normalizeTime(value) {

  if (
    typeof value === "number"
  ) {

    /*
      milliseconds
    */

    if (
      value > 1000000000000
    ) {

      return Math.floor(
        value / 1000
      );
    }


    return Math.floor(
      value
    );
  }


  if (!value) {
    return NaN;
  }


  const text =
    String(value)
      .trim();


  /*
    Unix timestamp string
  */

  if (
    /^\d+$/.test(text)
  ) {

    const numeric =
      Number(text);


    if (
      numeric > 1000000000000
    ) {

      return Math.floor(
        numeric / 1000
      );
    }


    return Math.floor(
      numeric
    );
  }


  /*
    ISO / normal datetime
  */

  let date =
    new Date(text);


  /*
    Twelve Data format:

    2026-08-17 16:51:00

    Treat as UTC.
  */

  if (
    isNaN(date.getTime()) &&
    /^\d{4}-\d{2}-\d{2} /.test(text)
  ) {

    date =
      new Date(
        text.replace(
          " ",
          "T"
        ) + "Z"
      );
  }


  if (
    isNaN(date.getTime())
  ) {

    return NaN;
  }


  return Math.floor(
    date.getTime() / 1000
  );
}


/* ============================================================
   MARKET INFORMATION
   ============================================================ */

function buildMarketInfo(
  candles,
  interval
) {

  const latest =
    candles[
      candles.length - 1
    ];


  const now =
    Math.floor(
      Date.now() / 1000
    );


  const ageSeconds =
    Math.max(
      0,
      now - latest.time
    );


  const durationMap = {

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
    durationMap[interval] ||
    60;


  const staleLimit =
    Math.max(
      candleDuration * 5,
      300
    );


  const isStale =
    ageSeconds >
    staleLimit;


  const recent =
    candles.slice(-20);


  const uniqueCloses =
    new Set(
      recent.map(
        c => c.close
      )
    );


  const flatMarket =
    recent.length >= 10 &&
    uniqueCloses.size <= 2;


  let dataQuality =
    "OK";


  if (isStale) {

    dataQuality =
      "STALE";

  } else if (flatMarket) {

    dataQuality =
      "FLAT";
  }


  /*
    Missing interval detection
  */

  let missingIntervals = 0;


  for (
    let i = 1;
    i < candles.length;
    i++
  ) {

    const difference =
      candles[i].time -
      candles[i - 1].time;


    if (
      difference >
      candleDuration * 1.5
    ) {

      missingIntervals +=
        Math.max(
          0,
          Math.round(
            difference /
              candleDuration
          ) - 1
        );
    }
  }


  return {

    latestCandleTime:
      latest.datetime,

    latestTimestamp:
      latest.time,

    latestPrice:
      latest.close,

    ageSeconds,

    candleDuration,

    nextCandleTimestamp:
      latest.time +
      candleDuration,

    missingIntervals,

    isStale,

    flatMarket,

    dataQuality
  };
}
