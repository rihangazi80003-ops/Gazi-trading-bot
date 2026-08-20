export default async function handler(req, res) {
  try {
    /*
    ============================================================
      FINORIX MARKET API
      REAL MARKET - LIVE SYNCHRONIZED CANDLE ENGINE

      IMPORTANT:
      This API keeps candle TIME aligned with the server clock.

      Historical candles:
        Twelve Data time_series

      Current price:
        Twelve Data quote

      Current 1-minute candle:
        Built/updated locally from latest closed candle + quote

      IMPORTANT:
      This does NOT claim to reproduce Quotex's exact price feed.
      It prevents the Finorix chart from being 2-3 candles behind
      simply because the historical API is being used as live data.
    ============================================================
    */

    const TWELVE_DATA_API_KEY =
      process.env.TWELVE_DATA_API_KEY;

    const OTC_FEED_URL =
      process.env.OTC_FEED_URL;


    /* =========================================================
       RESPONSE HEADERS
    ========================================================= */

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
        source: "Finorix API",
        message:
          "Unsupported market type",
        requestedMarket:
          marketType,
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
        source: "Finorix API",
        message:
          "Unsupported interval",
        requestedInterval:
          interval,
        allowedIntervals
      });
    }


    /* =========================================================
       REAL MARKET
    ========================================================= */

    if (
      marketType === "real"
    ) {

      if (
        !TWELVE_DATA_API_KEY
      ) {
        return res.status(500).json({
          status: "error",
          source: "Finorix API",
          market: "REAL",
          message:
            "TWELVE_DATA_API_KEY is missing in Vercel Environment Variables"
        });
      }


      /*
      ----------------------------------------------------------
        CURRENT SERVER TIME
      ----------------------------------------------------------
      */

      const serverNowMs =
        Date.now();

      const serverNowSec =
        Math.floor(
          serverNowMs / 1000
        );


      /*
      ----------------------------------------------------------
        CANDLE DURATION
      ----------------------------------------------------------
      */

      const candleDuration =
        getCandleDuration(
          interval
        );


      /*
      ----------------------------------------------------------
        CURRENT CANDLE BUCKET
      ----------------------------------------------------------
      */

      const currentBucket =
        Math.floor(
          serverNowSec /
          candleDuration
        ) *
        candleDuration;


      const nextBucket =
        currentBucket +
        candleDuration;


      /*
      ----------------------------------------------------------
        HISTORICAL DATA
      ----------------------------------------------------------
      */

      const historyParams =
        new URLSearchParams({
          symbol,
          interval,
          outputsize: "200",
          timezone: "UTC",
          order: "asc",
          apikey:
            TWELVE_DATA_API_KEY
        });


      const historyUrl =
        "https://api.twelvedata.com/time_series?" +
        historyParams.toString();


      const historyResponse =
        await fetch(
          historyUrl,
          {
            method: "GET",
            headers: {
              Accept:
                "application/json"
            },
            cache:
              "no-store"
          }
        );


      let historyData;

      try {
        historyData =
          await historyResponse.json();
      } catch {
        return res.status(502).json({
          status: "error",
          source: "Twelve Data",
          market: "REAL",
          message:
            "Invalid JSON response from Twelve Data"
        });
      }


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
          market: "REAL",
          message:
            historyData?.message ||
            "Twelve Data historical request failed",
          code:
            historyData?.code ||
            null
        });
      }


      /*
      ----------------------------------------------------------
        NORMALIZE HISTORY
      ----------------------------------------------------------
      */

      const historicalCandles =
        normalizeCandles(
          historyData?.values || []
        );


      if (
        historicalCandles.length === 0
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


      /*
      ----------------------------------------------------------
        LIVE QUOTE
      ----------------------------------------------------------

        This is the important part.

        time_series alone is not treated as the live price.
      ----------------------------------------------------------
      */

      let liveQuote =
        null;


      if (
        interval === "1min"
      ) {

        const quoteParams =
          new URLSearchParams({
            symbol,
            apikey:
              TWELVE_DATA_API_KEY
          });


        const quoteUrl =
          "https://api.twelvedata.com/quote?" +
          quoteParams.toString();


        try {

          const quoteResponse =
            await fetch(
              quoteUrl,
              {
                method: "GET",
                headers: {
                  Accept:
                    "application/json"
                },
                cache:
                  "no-store"
              }
            );


          if (
            quoteResponse.ok
          ) {

            const quoteData =
              await quoteResponse.json();


            const livePrice =
              Number(
                quoteData?.close ??
                quoteData?.price ??
                quoteData?.previous_close
              );


            if (
              Number.isFinite(
                livePrice
              )
            ) {

              liveQuote = {
                price:
                  livePrice,

                datetime:
                  quoteData?.datetime ||
                  null,

                timestamp:
                  serverNowSec
              };
            }
          }

        } catch (
          quoteError
        ) {

          console.warn(
            "LIVE QUOTE ERROR:",
            quoteError?.message
          );
        }
      }


      /*
      ----------------------------------------------------------
        REMOVE FUTURE CANDLES
      ----------------------------------------------------------
      */

      let candles =
        historicalCandles.filter(
          candle =>
            candle.time <=
            currentBucket
        );


      /*
      ----------------------------------------------------------
        FIND CURRENT CANDLE
      ----------------------------------------------------------
      */

      const existingCurrent =
        candles.find(
          candle =>
            candle.time ===
            currentBucket
        );


      /*
      ----------------------------------------------------------
        CURRENT CANDLE ENGINE
      ----------------------------------------------------------

        If live quote exists, update the current minute candle.

        If Twelve Data already returned a current candle,
        preserve its OHLC and update close/high/low.

        If it did not return one,
        create one from the previous close.
      ----------------------------------------------------------
      */

      if (
        interval === "1min" &&
        liveQuote
      ) {

        const price =
          liveQuote.price;


        if (
          existingCurrent
        ) {

          existingCurrent.close =
            price;

          existingCurrent.high =
            Math.max(
              existingCurrent.high,
              price
            );

          existingCurrent.low =
            Math.min(
              existingCurrent.low,
              price
            );

          existingCurrent.datetime =
            new Date(
              currentBucket * 1000
            ).toISOString();

        } else {

          const previous =
            findPreviousCandle(
              candles,
              currentBucket
            );


          const previousClose =
            previous
              ? previous.close
              : price;


          candles.push({

            time:
              currentBucket,

            datetime:
              new Date(
                currentBucket * 1000
              ).toISOString(),

            open:
              previousClose,

            high:
              Math.max(
                previousClose,
                price
              ),

            low:
              Math.min(
                previousClose,
                price
              ),

            close:
              price,

            volume:
              null,

            syntheticCurrent:
              true
          });
        }
      }


      /*
      ----------------------------------------------------------
        SORT AGAIN
      ----------------------------------------------------------
      */

      candles.sort(
        (a, b) =>
          a.time - b.time
      );


      /*
      ----------------------------------------------------------
        REMOVE DUPLICATES
      ----------------------------------------------------------
      */

      candles =
        uniqueCandles(
          candles
        );


      /*
      ----------------------------------------------------------
        KEEP LAST 150
      ----------------------------------------------------------
      */

      if (
        candles.length > 150
      ) {

        candles =
          candles.slice(
            -150
          );
      }


      /*
      ----------------------------------------------------------
        LATEST CANDLE
      ----------------------------------------------------------
      */

      const latest =
        candles[
          candles.length - 1
        ];


      if (
        !latest
      ) {
        return res.status(422).json({
          status: "error",
          source: "Finorix API",
          market: "REAL",
          message:
            "Unable to construct latest candle"
        });
      }


      /*
      ----------------------------------------------------------
        DATA AGE
      ----------------------------------------------------------
      */

      const ageSeconds =
        Math.max(
          0,
          serverNowSec -
          latest.time
        );


      /*
      ----------------------------------------------------------
        IMPORTANT ALIGNMENT STATUS
      ----------------------------------------------------------
      */

      const currentCandleIsAligned =
        latest.time ===
        currentBucket;


      /*
      ----------------------------------------------------------
        STALE CHECK
      ----------------------------------------------------------
      */

      const staleLimit =
        Math.max(
          candleDuration * 2,
          120
        );


      const isStale =
        ageSeconds >
        staleLimit;


      /*
      ----------------------------------------------------------
        MARKET INFO
      ----------------------------------------------------------
      */

      const marketInfo =
        buildMarketInfo(
          candles,
          interval,
          serverNowSec
        );


      /*
      ----------------------------------------------------------
        RESPONSE
      ----------------------------------------------------------
      */

      return res.status(200).json({

        status:
          "ok",

        source:
          "Twelve Data + Live Quote",

        market:
          "REAL",

        symbol:
          historyData?.meta?.symbol ||
          symbol,

        interval,

        timezone:
          "UTC",

        serverTime:
          serverNowSec,

        serverTimeISO:
          new Date(
            serverNowSec * 1000
          ).toISOString(),

        candleDuration,

        currentCandleTimestamp:
          currentBucket,

        currentCandleTime:
          new Date(
            currentBucket * 1000
          ).toISOString(),

        nextCandleTimestamp:
          nextBucket,

        nextCandleTime:
          new Date(
            nextBucket * 1000
          ).toISOString(),

        latestCandleTimestamp:
          latest.time,

        latestCandleTime:
          latest.datetime,

        currentCandleIsAligned,

        livePrice:
          liveQuote
            ? liveQuote.price
            : latest.close,

        liveQuoteAvailable:
          Boolean(
            liveQuote
          ),

        ageSeconds,

        isStale,

        indicatorReady:
          candles.length >= 60,

        marketInfo,

        candles
      });
    }


    /* =========================================================
       OTC MARKET
    ========================================================= */

    if (
      marketType === "otc"
    ) {

      if (
        !OTC_FEED_URL
      ) {
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


      const response =
        await fetch(
          otcUrl,
          {
            method: "GET",
            headers: {
              Accept:
                "application/json"
            },
            cache:
              "no-store"
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


      if (
        !response.ok
      ) {
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
        candles.length < 60
      ) {

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
          minimumRequired:
            60
        });
      }


      const serverNowSec =
        Math.floor(
          Date.now() / 1000
        );


      const marketInfo =
        buildMarketInfo(
          candles,
          interval,
          serverNowSec
        );


      return res.status(200).json({

        status:
          "ok",

        source:
          "Authorized OTC Feed",

        market:
          "OTC",

        symbol,

        interval,

        timezone:
          "UTC",

        serverTime:
          serverNowSec,

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


/* ============================================================
   CANDLE DURATION
   ============================================================ */

function getCandleDuration(
  interval
) {

  const durationMap = {

    "1min":
      60,

    "5min":
      300,

    "15min":
      900,

    "30min":
      1800,

    "45min":
      2700,

    "1h":
      3600,

    "2h":
      7200,

    "4h":
      14400,

    "5h":
      18000,

    "8h":
      28800,

    "1day":
      86400
  };


  return (
    durationMap[interval] ||
    60
  );
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
          ? Number(item.volume)
          : null
    });
  }


  candles.sort(
    (a, b) =>
      a.time - b.time
  );


  return uniqueCandles(
    candles
  );
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
      numeric >
      1000000000000
    ) {

      return Math.floor(
        numeric / 1000
      );
    }


    return Math.floor(
      numeric
    );
  }


  let date =
    new Date(text);


  if (
    isNaN(
      date.getTime()
    ) &&
    /^\d{4}-\d{2}-\d{2} /.test(
      text
    )
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
    isNaN(
      date.getTime()
    )
  ) {

    return NaN;
  }


  return Math.floor(
    date.getTime() / 1000
  );
}


/* ============================================================
   FIND PREVIOUS CANDLE
   ============================================================ */

function findPreviousCandle(
  candles,
  currentBucket
) {

  for (
    let i =
      candles.length - 1;
    i >= 0;
    i--
  ) {

    if (
      candles[i].time <
      currentBucket
    ) {

      return candles[i];
    }
  }


  return null;
}


/* ============================================================
   UNIQUE CANDLES
   ============================================================ */

function uniqueCandles(
  candles
) {

  const map =
    new Map();


  for (
    const candle of candles
  ) {

    if (
      !map.has(
        candle.time
      )
    ) {

      map.set(
        candle.time,
        candle
      );

    } else {

      /*
        If duplicate timestamp exists,
        keep the newer/current version.
      */

      map.set(
        candle.time,
        candle
      );
    }
  }


  return Array.from(
    map.values()
  ).sort(
    (a, b) =>
      a.time - b.time
  );
}


/* ============================================================
   MARKET INFORMATION
   ============================================================ */

function buildMarketInfo(
  candles,
  interval,
  serverNowSec
) {

  const latest =
    candles[
      candles.length - 1
    ];


  const now =
    Number.isFinite(
      serverNowSec
    )
      ? serverNowSec
      : Math.floor(
          Date.now() / 1000
        );


  const candleDuration =
    getCandleDuration(
      interval
    );


  const currentBucket =
    Math.floor(
      now /
      candleDuration
    ) *
    candleDuration;


  const ageSeconds =
    Math.max(
      0,
      now -
      latest.time
    );


  const recent =
    candles.slice(
      -20
    );


  const uniqueCloses =
    new Set(
      recent.map(
        c => c.close
      )
    );


  const flatMarket =
    recent.length >= 10 &&
    uniqueCloses.size <= 2;


  let missingIntervals =
    0;


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


  let dataQuality =
    "OK";


  if (
    latest.time <
    currentBucket
  ) {

    dataQuality =
      "BEHIND";

  } else if (
    flatMarket
  ) {

    dataQuality =
      "FLAT";
  }


  return {

    latestCandleTime:
      latest.datetime,

    latestTimestamp:
      latest.time,

    latestPrice:
      latest.close,

    currentCandleTimestamp:
      currentBucket,

    currentCandleTime:
      new Date(
        currentBucket * 1000
      ).toISOString(),

    nextCandleTimestamp:
      currentBucket +
      candleDuration,

    ageSeconds,

    candleDuration,

    missingIntervals,

    isStale:
      ageSeconds >
      Math.max(
        candleDuration * 2,
        120
      ),

    flatMarket,

    dataQuality,

    currentCandleIsAligned:
      latest.time ===
      currentBucket
  };
}
