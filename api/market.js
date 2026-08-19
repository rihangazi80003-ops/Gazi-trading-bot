export default async function handler(req, res) {
  try {
    /*
    ============================================================
      FINORIX MARKET API v2

      REAL  = Twelve Data
      OTC   = Authorized OTC feed

      IMPORTANT:
      - Source candle time is NEVER changed here.
      - Frontend receives the real source timestamp.
      - Frontend applies exactly +1 candle display alignment.
      - No artificial candles are created.
    ============================================================
    */

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


    const TWELVE_DATA_API_KEY =
      process.env.TWELVE_DATA_API_KEY;

    const OTC_FEED_URL =
      process.env.OTC_FEED_URL;


    /* =========================================================
       INPUT
    ========================================================= */

    const symbol =
      String(
        req.query.symbol || "EUR/USD"
      ).trim();

    const interval =
      String(
        req.query.interval || "1min"
      ).trim();

    const marketType =
      String(
        req.query.market || "real"
      )
      .trim()
      .toLowerCase();


    /* =========================================================
       VALIDATION
    ========================================================= */

    const allowedMarkets = [
      "real",
      "otc"
    ];

    if (
      !allowedMarkets.includes(
        marketType
      )
    ) {
      return res.status(400).json({
        status: "error",
        message: "Unsupported market type",
        market: marketType,
        allowedMarkets
      });
    }


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
      !allowedIntervals.includes(
        interval
      )
    ) {
      return res.status(400).json({
        status: "error",
        message: "Unsupported interval",
        interval,
        allowedIntervals
      });
    }


    /* =========================================================
       CANDLE DURATION
    ========================================================= */

    const candleDuration =
      getCandleDuration(interval);


    /* =========================================================
       REAL MARKET
    ========================================================= */

    if (
      marketType === "real"
    ) {

      if (!TWELVE_DATA_API_KEY) {

        return res.status(500).json({
          status: "error",
          source: "Finorix API",
          market: "REAL",
          message:
            "TWELVE_DATA_API_KEY is missing"
        });

      }


      const params =
        new URLSearchParams({
          symbol,
          interval,
          outputsize: "150",
          timezone: "UTC",
          order: "asc",
          apikey:
            TWELVE_DATA_API_KEY
        });


      const apiUrl =
        "https://api.twelvedata.com/time_series?" +
        params.toString();


      /*
        Timeout prevents a hanging request
        from making the frontend appear
        permanently connected/loading.
      */

      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () => controller.abort(),
          10000
        );


      let response;

      try {

        response =
          await fetch(
            apiUrl,
            {
              method: "GET",
              headers: {
                Accept:
                  "application/json"
              },
              cache: "no-store",
              signal:
                controller.signal
            }
          );

      } catch (error) {

        clearTimeout(timeout);

        return res.status(504).json({
          status: "error",
          source: "Twelve Data",
          market: "REAL",
          message:
            error?.name === "AbortError"
              ? "Twelve Data request timeout"
              : (
                  error?.message ||
                  "Twelve Data connection failed"
                )
        });

      }

      clearTimeout(timeout);


      let data;

      try {

        data =
          await response.json();

      } catch {

        return res.status(502).json({
          status: "error",
          source: "Twelve Data",
          market: "REAL",
          message:
            "Invalid JSON from Twelve Data"
        });

      }


      if (
        !response.ok ||
        data?.status === "error"
      ) {

        return res.status(
          response.ok
            ? 400
            : response.status
        ).json({
          status: "error",
          source: "Twelve Data",
          market: "REAL",
          message:
            data?.message ||
            "Twelve Data request failed",
          code:
            data?.code || null
        });

      }


      if (
        !Array.isArray(
          data?.values
        ) ||
        data.values.length === 0
      ) {

        return res.status(404).json({
          status: "error",
          source: "Twelve Data",
          market: "REAL",
          message:
            "No candle data available",
          symbol,
          interval
        });

      }


      const candles =
        normalizeCandles(
          data.values
        );


      if (
        candles.length < 35
      ) {

        return res.status(422).json({
          status: "error",
          source: "Finorix API",
          market: "REAL",
          message:
            "Not enough candles",
          symbol,
          interval,
          count:
            candles.length,
          minimumRequired: 35
        });

      }


      return sendSuccess(
        res,
        {
          source:
            "Twelve Data",

          market:
            "REAL",

          symbol:
            data.meta?.symbol ||
            symbol,

          interval,

          timezone:
            "UTC",

          candleDuration,

          candles
        }
      );
    }


    /* =========================================================
       OTC MARKET
    ========================================================= */

    if (
      marketType === "otc"
    ) {

      if (!OTC_FEED_URL) {

        return res.status(503).json({
          status: "error",
          source:
            "Finorix OTC Adapter",
          market: "OTC",
          message:
            "OTC feed is not configured",
          instruction:
            "Add OTC_FEED_URL to Vercel Environment Variables"
        });

      }


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


      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () => controller.abort(),
          10000
        );


      let response;

      try {

        response =
          await fetch(
            otcUrl,
            {
              method: "GET",
              headers: {
                Accept:
                  "application/json"
              },
              cache: "no-store",
              signal:
                controller.signal
            }
          );

      } catch (error) {

        clearTimeout(timeout);

        return res.status(504).json({
          status: "error",
          source: "OTC Feed",
          market: "OTC",
          message:
            error?.name === "AbortError"
              ? "OTC feed timeout"
              : (
                  error?.message ||
                  "OTC feed connection failed"
                )
        });

      }

      clearTimeout(timeout);


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
            "Invalid JSON from OTC feed"
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


      let rawCandles = [];


      if (
        Array.isArray(data)
      ) {

        rawCandles =
          data;

      } else if (
        Array.isArray(
          data?.candles
        )
      ) {

        rawCandles =
          data.candles;

      } else if (
        Array.isArray(
          data?.values
        )
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


      if (
        candles.length < 35
      ) {

        return res.status(422).json({
          status: "error",
          source: "OTC Feed",
          market: "OTC",
          message:
            "OTC feed returned insufficient candles",
          symbol,
          interval,
          count:
            candles.length
        });

      }


      return sendSuccess(
        res,
        {
          source:
            "Authorized OTC Feed",

          market:
            "OTC",

          symbol,

          interval,

          timezone:
            "UTC",

          candleDuration,

          candles
        }
      );
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
        error?.message ||
        "Internal server error"
    });
  }
}


/* ============================================================
   SUCCESS RESPONSE
============================================================ */

function sendSuccess(
  res,
  payload
) {

  const candles =
    payload.candles || [];


  const latest =
    candles[
      candles.length - 1
    ];


  const now =
    Math.floor(
      Date.now() / 1000
    );


  const ageSeconds =
    latest
      ? Math.max(
          0,
          now - latest.time
        )
      : null;


  const candleDuration =
    payload.candleDuration ||
    60;


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


  /*
    This is diagnostic only.

    We DO NOT move the source candle
    here. The frontend will apply
    exactly one candle (+60 sec).
  */

  const feedStatus =
    ageSeconds === null
      ? "NO_DATA"
      : ageSeconds <= candleDuration * 2
        ? "LIVE"
        : "DELAYED";


  return res.status(200).json({

    status:
      "ok",

    source:
      payload.source,

    market:
      payload.market,

    symbol:
      payload.symbol,

    interval:
      payload.interval,

    timezone:
      payload.timezone,

    candleDuration,

    count:
      candles.length,

    feed: {

      latestSourceTime:
        latest?.time || null,

      latestSourceISO:
        latest
          ? new Date(
              latest.time * 1000
            ).toISOString()
          : null,

      ageSeconds,

      feedStatus,

      missingIntervals

    },

    /*
      Explicit alignment instruction.
      Exactly ONE candle.
    */

    alignment: {

      mode:
        "ONE_CANDLE_ADVANCE",

      seconds:
        candleDuration,

      candles:
        1

    },

    candles

  });
}


/* ============================================================
   NORMALIZE CANDLES
============================================================ */

function normalizeCandles(
  raw
) {

  if (
    !Array.isArray(raw)
  ) {
    return [];
  }


  const candles = [];


  for (
    const item of raw
  ) {

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
          ? Number(
              item.volume
            )
          : null

    });

  }


  candles.sort(
    (a, b) =>
      a.time - b.time
  );


  /*
    Remove duplicate timestamps.
  */

  const unique = [];


  for (
    const candle of candles
  ) {

    const last =
      unique[
        unique.length - 1
      ];


    if (
      last &&
      last.time ===
        candle.time
    ) {

      /*
        Keep the newest copy.
      */

      unique[
        unique.length - 1
      ] =
        candle;

    } else {

      unique.push(
        candle
      );

    }

  }


  return unique;
}


/* ============================================================
   TIME NORMALIZER
============================================================ */

function normalizeTime(
  value
) {

  if (
    typeof value === "number"
  ) {

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
    Explicit UTC handling for:

    YYYY-MM-DD HH:MM:SS
  */

  if (
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/
      .test(text)
  ) {

    const utcText =
      text.replace(
        " ",
        "T"
      ) + "Z";


    const date =
      new Date(
        utcText
      );


    if (
      !isNaN(
        date.getTime()
      )
    ) {

      return Math.floor(
        date.getTime() /
        1000
      );

    }

  }


  const date =
    new Date(
      text
    );


  if (
    isNaN(
      date.getTime()
    )
  ) {

    return NaN;

  }


  return Math.floor(
    date.getTime() /
    1000
  );
}


/* ============================================================
   CANDLE DURATION
============================================================ */

function getCandleDuration(
  interval
) {

  const map = {

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


  return (
    map[interval] ||
    60
  );
}
