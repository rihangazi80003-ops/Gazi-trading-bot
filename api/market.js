export default async function handler(req, res) {
  try {
    /*
    ============================================================
      FINORIX MARKET API
      FIXED ONE-CANDLE-AHEAD DISPLAY SYNCHRONIZATION

      GOAL:

        Current market minute = 19:57
        Finorix displayed latest candle = 19:58

      IMPORTANT:

        We NEVER manufacture OHLC data.

        The provider candle remains exactly the same.
        Only its DISPLAY timestamp is shifted so that
        the newest received source candle is displayed
        exactly one candle ahead of the current clock.

      Example:

        Source latest = 19:54
        Current minute = 19:57

        Required display = 19:58

        Display shift = 4 minutes

        19:54 + 4 = 19:58

      Therefore the chart always targets:

        CURRENT MINUTE + 1 CANDLE
    ============================================================
    */

    const TWELVE_DATA_API_KEY =
      process.env.TWELVE_DATA_API_KEY;

    const OTC_FEED_URL =
      process.env.OTC_FEED_URL;

    /* =========================================================
       INPUT
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
       VALIDATION
    ========================================================= */

    if (!["real", "otc"].includes(marketType)) {
      return res.status(400).json({
        status: "error",
        message: "market must be real or otc"
      });
    }

    if (interval !== "1min") {
      return res.status(400).json({
        status: "error",
        message:
          "Finorix currently supports 1min only."
      });
    }

    /* =========================================================
       GET SOURCE CANDLES
    ========================================================= */

    let rawCandles = [];
    let sourceName = "";

    /* =========================================================
       REAL MARKET
    ========================================================= */

    if (marketType === "real") {
      if (!TWELVE_DATA_API_KEY) {
        return res.status(500).json({
          status: "error",
          source: "Finorix API",
          market: "REAL",
          message:
            "TWELVE_DATA_API_KEY is missing."
        });
      }

      const params = new URLSearchParams({
        symbol,
        interval: "1min",
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
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      });

      let data;

      try {
        data = await response.json();
      } catch {
        return res.status(502).json({
          status: "error",
          source: "Twelve Data",
          market: "REAL",
          message:
            "Twelve Data returned invalid JSON."
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
          market: "REAL",
          message:
            data?.message ||
            "Twelve Data request failed.",
          code: data?.code || null
        });
      }

      if (
        !Array.isArray(data?.values) ||
        data.values.length === 0
      ) {
        return res.status(404).json({
          status: "error",
          source: "Twelve Data",
          market: "REAL",
          message:
            "No candle data returned.",
          symbol,
          interval
        });
      }

      rawCandles = data.values;

      sourceName = "Twelve Data";
    }

    /* =========================================================
       OTC MARKET
    ========================================================= */

    if (marketType === "otc") {
      if (!OTC_FEED_URL) {
        return res.status(503).json({
          status: "error",
          source: "Finorix OTC Adapter",
          market: "OTC",
          message:
            "OTC_FEED_URL is not configured."
        });
      }

      const otcParams =
        new URLSearchParams({
          symbol,
          interval: "1min",
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

      const response = await fetch(otcUrl, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      });

      let data;

      try {
        data = await response.json();
      } catch {
        return res.status(502).json({
          status: "error",
          source: "OTC Feed",
          market: "OTC",
          message:
            "OTC feed returned invalid JSON."
        });
      }

      if (!response.ok) {
        return res.status(response.status).json({
          status: "error",
          source: "OTC Feed",
          market: "OTC",
          message:
            data?.message ||
            "OTC feed request failed."
        });
      }

      if (Array.isArray(data)) {
        rawCandles = data;
      } else if (
        Array.isArray(data?.candles)
      ) {
        rawCandles = data.candles;
      } else if (
        Array.isArray(data?.values)
      ) {
        rawCandles = data.values;
      } else if (
        data?.data &&
        Array.isArray(data.data.candles)
      ) {
        rawCandles =
          data.data.candles;
      }

      sourceName = "Authorized OTC Feed";
    }

    /* =========================================================
       NORMALIZE
    ========================================================= */

    const candles =
      normalizeCandles(rawCandles);

    if (candles.length < 60) {
      return res.status(422).json({
        status: "error",
        source: sourceName,
        market: marketType.toUpperCase(),
        message:
          "Not enough valid 1-minute candles.",
        count: candles.length
      });
    }

    /* =========================================================
       ONE-CANDLE-AHEAD ALIGNMENT
    ========================================================= */

    const alignment =
      buildOneCandleAheadAlignment(
        candles
      );

    /* =========================================================
       RESPONSE
    ========================================================= */

    return res.status(200).json({
      status: "ok",

      source: sourceName,

      market:
        marketType.toUpperCase(),

      symbol,

      interval,

      timezone: "UTC",

      serverTime:
        alignment.serverTime,

      count:
        candles.length,

      /*
        ORIGINAL PROVIDER DATA
      */
      candles,

      /*
        SYNCHRONIZATION INFORMATION
      */
      marketInfo:
        alignment,

      /*
        Frontend compatibility
      */
      feed:
        alignment
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


/* ============================================================
   NORMALIZE CANDLES
============================================================ */

function normalizeCandles(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const map = new Map();

  for (const item of raw) {
    if (!item) {
      continue;
    }

    const rawTime =
      item.datetime ??
      item.date ??
      item.time ??
      item.timestamp;

    const time =
      normalizeTime(rawTime);

    const open =
      Number(item.open);

    const high =
      Number(item.high);

    const low =
      Number(item.low);

    const close =
      Number(item.close);

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
      OHLC validation
    */

    if (high < low) continue;
    if (high < open) continue;
    if (high < close) continue;
    if (low > open) continue;
    if (low > close) continue;

    /*
      Force exact 1-minute boundary
    */

    const minuteTime =
      Math.floor(time / 60) * 60;

    map.set(minuteTime, {
      time: minuteTime,

      datetime:
        new Date(
          minuteTime * 1000
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

  const result =
    Array.from(map.values());

  result.sort(
    (a, b) =>
      a.time - b.time
  );

  return result;
}


/* ============================================================
   TIME NORMALIZER
============================================================ */

function normalizeTime(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value > 1000000000000
      ? Math.floor(value / 1000)
      : Math.floor(value);
  }

  if (!value) {
    return NaN;
  }

  const text =
    String(value).trim();

  /*
    Unix timestamp
  */

  if (/^\d+$/.test(text)) {
    const numeric =
      Number(text);

    return numeric > 1000000000000
      ? Math.floor(numeric / 1000)
      : Math.floor(numeric);
  }

  /*
    YYYY-MM-DD HH:MM:SS
  */

  if (
    /^\d{4}-\d{2}-\d{2}\s/.test(text)
  ) {
    const date =
      new Date(
        text.replace(" ", "T") +
        "Z"
      );

    if (!isNaN(date.getTime())) {
      return Math.floor(
        date.getTime() / 1000
      );
    }
  }

  const date =
    new Date(text);

  if (isNaN(date.getTime())) {
    return NaN;
  }

  return Math.floor(
    date.getTime() / 1000
  );
}


/* ============================================================
   ONE CANDLE AHEAD
============================================================ */

function buildOneCandleAheadAlignment(
  candles
) {
  const latest =
    candles[candles.length - 1];

  const now =
    Math.floor(Date.now() / 1000);

  /*
    Current clock minute
  */

  const currentMinute =
    Math.floor(now / 60) * 60;

  /*
    Latest source candle
  */

  const latestSourceTimestamp =
    latest.time;

  const latestSourceMinute =
    Math.floor(
      latestSourceTimestamp / 60
    ) * 60;

  /*
    REQUIRED DISPLAY POSITION

    Current minute + exactly 1 candle
  */

  const targetDisplayTimestamp =
    currentMinute + 60;

  /*
    How many minutes the source candle
    must be shifted for display.
  */

  const alignmentShiftSeconds =
    targetDisplayTimestamp -
    latestSourceMinute;

  const alignmentShiftCandles =
    Math.round(
      alignmentShiftSeconds / 60
    );

  /*
    Feed age
  */

  const ageSeconds =
    Math.max(
      0,
      now - latestSourceTimestamp
    );

  /*
    Source lag compared with current clock
  */

  const lagMinutes =
    Math.max(
      0,
      Math.round(
        (
          currentMinute -
          latestSourceMinute
        ) / 60
      )
    );

  /*
    Feed quality
  */

  let dataQuality = "LIVE";

  if (ageSeconds > 300) {
    dataQuality = "STALE";
  } else if (lagMinutes >= 2) {
    dataQuality = "DELAYED";
  }

  /*
    Missing candles
  */

  let missingIntervals = 0;

  for (
    let i = 1;
    i < candles.length;
    i++
  ) {
    const diff =
      candles[i].time -
      candles[i - 1].time;

    if (diff > 60) {
      missingIntervals +=
        Math.max(
          0,
          Math.round(diff / 60) - 1
        );
    }
  }

  /*
    The last displayed candle is ALWAYS:

      current minute + 1
  */

  const displayLatestTimestamp =
    targetDisplayTimestamp;

  const nextCandleTimestamp =
    displayLatestTimestamp + 60;

  return {
    latestSourceTime:
      latest.datetime,

    latestSourceTimestamp:
      latestSourceTimestamp,

    latestPrice:
      latest.close,

    serverTime:
      now,

    currentMinute,

    latestSourceMinute,

    ageSeconds,

    lagMinutes,

    candleDuration: 60,

    /*
      EXACT synchronization
    */

    alignmentShiftCandles,

    alignmentShiftSeconds,

    displayLatestTimestamp,

    displayLatestTime:
      new Date(
        displayLatestTimestamp * 1000
      ).toISOString(),

    /*
      Frontend uses this directly
    */

    displayAdvanceCandles: 1,

    displayAdvanceSeconds: 60,

    nextCandleTimestamp,

    nextCandleTime:
      new Date(
        nextCandleTimestamp * 1000
      ).toISOString(),

    missingIntervals,

    isDelayed:
      lagMinutes >= 2,

    isStale:
      ageSeconds > 300,

    dataQuality,

    alignment:
      "EXACTLY_1_CANDLE_AHEAD"
  };
}
