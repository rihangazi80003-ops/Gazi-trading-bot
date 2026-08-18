export default async function handler(req, res) {

  try {

    /*
    ============================================================
      FINORIX MARKET API
      REAL + OTC
      LIVE CANDLE SYNCHRONIZATION ENGINE

      IMPORTANT:
      - Historical candles = Twelve Data
      - Current price = Twelve Data price endpoint
      - Running candle = constructed from current price
      - CANDLE_SYNC_OFFSET_MINUTES aligns displayed candle time

      DEFAULT:
      CANDLE_SYNC_OFFSET_MINUTES = 3

      If Quotex is still 1 candle behind:
      change 3 -> 4

      This does NOT create genuine future market data.
      It only aligns the displayed candle timeline.
    ============================================================
    */


    /* =========================================================
       ENVIRONMENT
    ========================================================= */

    const TWELVE_DATA_API_KEY =
      process.env.TWELVE_DATA_API_KEY;

    const OTC_FEED_URL =
      process.env.OTC_FEED_URL;


    /*
      Candle synchronization offset.

      Example:

      Quotex:
      22:40

      Twelve Data:
      22:37

      Offset = 3 minutes

      Finorix:
      22:40
    */

    const CANDLE_SYNC_OFFSET_MINUTES =
      Number(
        process.env.CANDLE_SYNC_OFFSET_MINUTES || 3
      );


    const CANDLE_SYNC_OFFSET_SECONDS =
      CANDLE_SYNC_OFFSET_MINUTES * 60;


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
            "TWELVE_DATA_API_KEY is missing"

        });

      }


      /*
      ==========================================================
        STEP 1
        GET HISTORICAL CANDLES
      ==========================================================
      */

      const candleParams =
        new URLSearchParams({

          symbol,

          interval,

          outputsize: "180",

          timezone: "UTC",

          order: "asc",

          apikey:
            TWELVE_DATA_API_KEY

        });


      const candleUrl =
        "https://api.twelvedata.com/time_series?" +
        candleParams.toString();


      const candleResponse =
        await fetch(
          candleUrl,
          {
            method: "GET",

            cache: "no-store",

            headers: {
              Accept:
                "application/json"
            }
          }
        );


      let candleData;


      try {

        candleData =
          await candleResponse.json();

      } catch {

        return res.status(502).json({

          status: "error",

          source: "Twelve Data",

          message:
            "Invalid candle response"

        });

      }


      if (
        !candleResponse.ok ||
        candleData?.status === "error"
      ) {

        return res.status(
          candleResponse.ok
            ? 400
            : candleResponse.status
        ).json({

          status: "error",

          source: "Twelve Data",

          message:
            candleData?.message ||
            "Twelve Data candle request failed",

          code:
            candleData?.code ||
            null

        });

      }


      let candles =
        normalizeCandles(
          candleData?.values || []
        );


      if (
        candles.length < 30
      ) {

        return res.status(422).json({

          status: "error",

          source: "Twelve Data",

          message:
            "Not enough candle data",

          count:
            candles.length

        });

      }


      /*
      ==========================================================
        STEP 2
        GET CURRENT LIVE PRICE
      ==========================================================
      */

      let livePrice =
        null;


      let livePriceTime =
        null;


      try {

        const priceParams =
          new URLSearchParams({

            symbol,

            apikey:
              TWELVE_DATA_API_KEY

          });


        const priceUrl =
          "https://api.twelvedata.com/price?" +
          priceParams.toString();


        const priceResponse =
          await fetch(
            priceUrl,
            {
              method: "GET",

              cache: "no-store",

              headers: {
                Accept:
                  "application/json"
              }
            }
          );


        const priceData =
          await priceResponse.json();


        if (
          priceResponse.ok &&
          priceData?.price !== undefined
        ) {

          const parsed =
            Number(
              priceData.price
            );


          if (
            Number.isFinite(parsed)
          ) {

            livePrice =
              parsed;

            livePriceTime =
              Math.floor(
                Date.now() / 1000
              );

          }

        }

      } catch (
        priceError
      ) {

        console.error(
          "LIVE PRICE ERROR:",
          priceError
        );

      }


      /*
      ==========================================================
        STEP 3
        BUILD RUNNING CANDLE
      ==========================================================

        For 1-minute:

        22:40:00 -> 22:40:59

        The current candle is created from
        the latest live price.
      */

      if (
        interval === "1min" &&
        livePrice !== null
      ) {

        const now =
          Math.floor(
            Date.now() / 1000
          );


        const currentMinute =
          Math.floor(
            now / 60
          ) * 60;


        /*
          Find existing candle belonging
          to the current minute.
        */

        let runningIndex =
          candles.findIndex(
            candle =>
              candle.time ===
              currentMinute
          );


        /*
          If current minute candle exists,
          update it.
        */

        if (
          runningIndex >= 0
        ) {

          const running =
            candles[
              runningIndex
            ];


          running.high =
            Math.max(
              running.high,
              livePrice
            );


          running.low =
            Math.min(
              running.low,
              livePrice
            );


          running.close =
            livePrice;


          running.datetime =
            new Date(
              running.time * 1000
            ).toISOString();


        } else {

          /*
            Create a new running candle.

            Open:
            previous close

            High:
            max(previous close, live)

            Low:
            min(previous close, live)

            Close:
            live
          */

          const previous =
            candles[
              candles.length - 1
            ];


          const open =
            previous
              ? previous.close
              : livePrice;


          const running = {

            time:
              currentMinute,

            datetime:
              new Date(
                currentMinute * 1000
              ).toISOString(),

            open,

            high:
              Math.max(
                open,
                livePrice
              ),

            low:
              Math.min(
                open,
                livePrice
              ),

            close:
              livePrice,

            volume:
              null,

            isRunning:
              true

          };


          candles.push(
            running
          );

        }

      }


      /*
      ==========================================================
        STEP 4
        APPLY CANDLE TIME ALIGNMENT
      ==========================================================

        IMPORTANT:

        We do NOT change OHLC values.

        We only shift the displayed timestamp.

        This addresses the situation:

        Quotex:
        22:40

        Source:
        22:37

        Offset:
        +3 minutes

        Finorix:
        22:40
      */

      const alignedCandles =
        candles.map(
          candle => ({

            ...candle,

            time:
              candle.time +
              CANDLE_SYNC_OFFSET_SECONDS,

            datetime:
              new Date(
                (
                  candle.time +
                  CANDLE_SYNC_OFFSET_SECONDS
                ) * 1000
              ).toISOString(),

            originalTime:
              candle.time

          })
        );


      /*
      ==========================================================
        STEP 5
        REMOVE DUPLICATES AFTER ALIGNMENT
      ==========================================================
      */

      const finalCandles =
        removeDuplicateCandles(
          alignedCandles
        );


      /*
      ==========================================================
        STEP 6
        MARKET INFO
      ==========================================================
      */

      const marketInfo =
        buildMarketInfo(
          finalCandles,
          interval,
          livePrice
        );


      return res.status(200).json({

        status:
          "ok",

        source:
          "Twelve Data + Live Price",

        market:
          "REAL",

        symbol:
          candleData?.meta?.symbol ||
          symbol,

        interval,

        timezone:
          "UTC",

        count:
          finalCandles.length,

        indicatorReady:
          finalCandles.length >= 60,

        livePrice,

        livePriceTime,

        synchronization: {

          enabled:
            true,

          offsetMinutes:
            CANDLE_SYNC_OFFSET_MINUTES,

          offsetSeconds:
            CANDLE_SYNC_OFFSET_SECONDS,

          mode:
            "DISPLAY_TIME_ALIGNMENT"

        },

        marketInfo,

        candles:
          finalCandles

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

          status:
            "error",

          source:
            "Finorix OTC Adapter",

          market:
            "OTC",

          message:
            "OTC feed is not configured",

          instruction:
            "Add OTC_FEED_URL in Vercel Environment Variables"

        });

      }


      const otcParams =
        new URLSearchParams({

          symbol,

          interval,

          limit:
            "180"

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

            cache: "no-store",

            headers: {

              Accept:
                "application/json"

            }

          }
        );


      let data;


      try {

        data =
          await response.json();

      } catch {

        return res.status(502).json({

          status:
            "error",

          source:
            "OTC Feed",

          market:
            "OTC",

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

          status:
            "error",

          source:
            "OTC Feed",

          market:
            "OTC",

          message:
            data?.message ||
            "OTC feed request failed"

        });

      }


      /*
      ==========================================================
        FLEXIBLE OTC FORMAT
      ==========================================================
      */

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
        candles.length < 30
      ) {

        return res.status(422).json({

          status:
            "error",

          source:
            "OTC Feed",

          market:
            "OTC",

          message:
            "OTC feed returned insufficient candles",

          count:
            candles.length

        });

      }


      /*
      ==========================================================
        OTC TIMESTAMP ALIGNMENT
      ==========================================================

        OTC feed should ideally already match
        the broker clock.

        Therefore we do NOT automatically
        apply the REAL-market +3 minute offset
        to OTC.

        If the OTC provider itself is delayed,
        configure a separate offset later.
      */

      const finalCandles =
        removeDuplicateCandles(
          candles
        );


      const latest =
        finalCandles[
          finalCandles.length - 1
        ];


      const marketInfo =
        buildMarketInfo(
          finalCandles,
          interval,
          latest?.close || null
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

        count:
          finalCandles.length,

        indicatorReady:
          finalCandles.length >= 60,

        synchronization: {

          enabled:
            false,

          offsetMinutes:
            0,

          mode:
            "OTC_SOURCE_TIME"

        },

        marketInfo,

        candles:
          finalCandles

      });

    }


  } catch (
    error
  ) {

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
        Number.isFinite(
          Number(
            item.volume
          )
        )
          ? Number(
              item.volume
            )
          : null,

      isRunning:
        Boolean(
          item.isRunning
        )

    });

  }


  candles.sort(
    (a, b) =>
      a.time - b.time
  );


  return removeDuplicateCandles(
    candles
  );

}


/* ============================================================
   REMOVE DUPLICATES
============================================================ */

function removeDuplicateCandles(
  candles
) {

  const map =
    new Map();


  for (
    const candle of candles
  ) {

    if (
      !candle ||
      !Number.isFinite(
        candle.time
      )
    ) {

      continue;

    }


    /*
      If duplicate timestamp appears,
      keep the latest candle object.
    */

    map.set(
      candle.time,
      candle
    );

  }


  return Array.from(
    map.values()
  ).sort(
    (a, b) =>
      a.time - b.time
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


  /*
    Unix timestamp
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
    ISO datetime
  */

  let date =
    new Date(text);


  /*
    Twelve Data format:

    2026-08-17 16:51:00

    Explicit UTC.
  */

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
   MARKET INFO
============================================================ */

function buildMarketInfo(
  candles,
  interval,
  livePrice
) {

  if (
    !Array.isArray(candles) ||
    candles.length === 0
  ) {

    return {

      dataQuality:
        "NO_DATA"

    };

  }


  const latest =
    candles[
      candles.length - 1
    ];


  const now =
    Math.floor(
      Date.now() / 1000
    );


  /*
    NOTE:

    Because real-market candles may have
    a synchronization offset, age is calculated
    from the original candle time when available.
  */

  const originalTime =
    Number.isFinite(
      latest.originalTime
    )
      ? latest.originalTime
      : latest.time;


  const ageSeconds =
    Math.max(
      0,
      now - originalTime
    );


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


  const candleDuration =
    durationMap[
      interval
    ] || 60;


  const staleLimit =
    Math.max(
      candleDuration * 5,
      300
    );


  const isStale =
    ageSeconds >
    staleLimit;


  const recent =
    candles.slice(
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


  let dataQuality =
    "OK";


  if (
    isStale
  ) {

    dataQuality =
      "STALE";

  } else if (
    flatMarket
  ) {

    dataQuality =
      "FLAT";

  }


  /*
    Detect missing candles.
  */

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


  return {

    latestCandleTime:
      latest.datetime,

    latestTimestamp:
      latest.time,

    originalLatestTimestamp:
      originalTime,

    latestPrice:
      livePrice !== null &&
      livePrice !== undefined
        ? livePrice
        : latest.close,

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
