export default async function handler(req, res) {

  try {

    /*
    ============================================================
      FINORIX MARKET API v3 (EXACT MATCH)

      Requirement:
        Finorix = Exact match with real market (0 advance).
    ============================================================
    */

    const TWELVE_DATA_API_KEY =
      process.env.TWELVE_DATA_API_KEY;

    const OTC_FEED_URL =
      process.env.OTC_FEED_URL;

    /*
      Exact match: 0 advance candles so it matches the real market precisely.
    */
    const DISPLAY_ADVANCE_CANDLES = 0;

    const DISPLAY_ADVANCE_SECONDS =
      DISPLAY_ADVANCE_CANDLES * 60;

    const symbol =
      String(
        req.query.symbol ||
        "EUR/USD"
      ).trim();

    const interval =
      String(
        req.query.interval ||
        "1min"
      ).trim();

    const marketType =
      String(
        req.query.market ||
        "real"
      )
        .trim()
        .toLowerCase();

    if(
      !["real","otc"]
        .includes(marketType)
    ){
      return res.status(400).json({
        status:"error",
        message:"market must be real or otc"
      });
    }

    if(interval !== "1min"){
      return res.status(400).json({
        status:"error",
        message:"This Finorix version supports 1min only."
      });
    }

    if(marketType === "real"){

      if(!TWELVE_DATA_API_KEY){
        return res.status(500).json({
          status:"error",
          source:"Finorix API",
          market:"REAL",
          message:"TWELVE_DATA_API_KEY is missing."
        });
      }

      const params =
        new URLSearchParams({
          symbol,
          interval:"1min",
          outputsize:"150",
          timezone:"UTC",
          order:"asc",
          apikey:TWELVE_DATA_API_KEY
        });

      const apiUrl =
        "https://api.twelvedata.com/time_series?" +
        params.toString();

      const response =
        await fetch(apiUrl, {
          method:"GET",
          cache:"no-store",
          headers:{ Accept:"application/json" }
        });

      let data;
      try{
        data = await response.json();
      }catch{
        return res.status(502).json({
          status:"error",
          source:"Twelve Data",
          market:"REAL",
          message:"Twelve Data returned invalid JSON."
        });
      }

      if(!response.ok || data?.status === "error"){
        return res.status(response.ok ? 400 : response.status).json({
          status:"error",
          source:"Twelve Data",
          market:"REAL",
          message:data?.message || "Twelve Data request failed.",
          code:data?.code || null
        });
      }

      if(!Array.isArray(data?.values) || data.values.length === 0){
        return res.status(404).json({
          status:"error",
          source:"Twelve Data",
          market:"REAL",
          message:"No candle data returned.",
          symbol,
          interval
        });
      }

      const candles = normalizeCandles(data.values);

      if(candles.length < 60){
        return res.status(422).json({
          status:"error",
          source:"Twelve Data",
          market:"REAL",
          message:"Not enough candles.",
          count:candles.length
        });
      }

      const marketInfo =
        buildMarketInfo(
          candles,
          interval,
          DISPLAY_ADVANCE_CANDLES
        );

      return res.status(200).json({
        status:"ok",
        source:"Twelve Data",
        market:"REAL",
        symbol:data.meta?.symbol || symbol,
        interval,
        timezone:"UTC",
        serverTime:Math.floor(Date.now() / 1000),
        count:candles.length,
        candles,
        displayAdvanceCandles:DISPLAY_ADVANCE_CANDLES,
        displayAdvanceSeconds:DISPLAY_ADVANCE_SECONDS,
        marketInfo,
        feed:{
          latestSourceTime:marketInfo.latestTimestamp,
          ageSeconds:marketInfo.ageSeconds,
          lagMinutes:marketInfo.lagMinutes
        }
      });

    }

    if(marketType === "otc"){

      if(!OTC_FEED_URL){
        return res.status(503).json({
          status:"error",
          source:"Finorix OTC Adapter",
          market:"OTC",
          message:"OTC_FEED_URL is not configured."
        });
      }

      const otcParams =
        new URLSearchParams({
          symbol,
          interval:"1min",
          limit:"150"
        });

      const separator =
        OTC_FEED_URL.includes("?") ? "&" : "?";

      const otcUrl =
        OTC_FEED_URL + separator + otcParams.toString();

      const response =
        await fetch(otcUrl, {
          method:"GET",
          cache:"no-store",
          headers:{ Accept:"application/json" }
        });

      let data;
      try{
        data = await response.json();
      }catch{
        return res.status(502).json({
          status:"error",
          source:"OTC Feed",
          market:"OTC",
          message:"OTC feed returned invalid JSON."
        });
      }

      if(!response.ok){
        return res.status(response.status).json({
          status:"error",
          source:"OTC Feed",
          market:"OTC",
          message:data?.message || "OTC feed request failed."
        });
      }

      let rawCandles = [];
      if(Array.isArray(data)){
        rawCandles = data;
      }else if(Array.isArray(data?.candles)){
        rawCandles = data.candles;
      }else if(Array.isArray(data?.values)){
        rawCandles = data.values;
      }else if(data?.data && Array.isArray(data.data.candles)){
        rawCandles = data.data.candles;
      }

      const candles = normalizeCandles(rawCandles);

      if(candles.length < 60){
        return res.status(422).json({
          status:"error",
          source:"OTC Feed",
          market:"OTC",
          message:"OTC feed returned insufficient candles.",
          count:candles.length
        });
      }

      const marketInfo =
        buildMarketInfo(
          candles,
          interval,
          DISPLAY_ADVANCE_CANDLES
        );

      return res.status(200).json({
        status:"ok",
        source:"Authorized OTC Feed",
        market:"OTC",
        symbol,
        interval,
        timezone:"UTC",
        serverTime:Math.floor(Date.now() / 1000),
        count:candles.length,
        candles,
        displayAdvanceCandles:DISPLAY_ADVANCE_CANDLES,
        displayAdvanceSeconds:DISPLAY_ADVANCE_SECONDS,
        marketInfo,
        feed:{
          latestSourceTime:marketInfo.latestTimestamp,
          ageSeconds:marketInfo.ageSeconds,
          lagMinutes:marketInfo.lagMinutes
        }
      });

    }

  }catch(error){
    console.error("FINORIX MARKET API ERROR:", error);
    return res.status(500).json({
      status:"error",
      source:"Finorix API",
      message:"Internal server error",
      error:error?.message || "Unknown error"
    });
  }

}

function normalizeCandles(raw){
  if(!Array.isArray(raw)){ return []; }
  const map = new Map();

  for(const item of raw){
    if(!item){ continue; }
    const rawTime = item.datetime ?? item.date ?? item.time ?? item.timestamp;
    const time = normalizeTime(rawTime);
    const open = Number(item.open);
    const high = Number(item.high);
    const low = Number(item.low);
    const close = Number(item.close);

    if(!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)){
      continue;
    }

    if(high < low || high < open || high < close || low > open || low > close){
      continue;
    }

    const minuteTime = Math.floor(time / 60) * 60;
    map.set(minuteTime, {
      time: minuteTime,
      datetime: new Date(minuteTime * 1000).toISOString(),
      open, high, low, close,
      volume: item.volume !== undefined ? Number(item.volume) : null
    });
  }

  const candles = Array.from(map.values());
  candles.sort((a,b) => a.time - b.time);
  return candles;
}

function normalizeTime(value){
  if(typeof value === "number" && Number.isFinite(value)){
    return value > 1000000000000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if(!value){ return NaN; }
  const text = String(value).trim();
  if(/^\d+$/.test(text)){
    const numeric = Number(text);
    return numeric > 1000000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  let date = new Date(text);
  if(isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}\s/.test(text)){
    date = new Date(text.replace(" ", "T") + "Z");
  }
  if(isNaN(date.getTime())){ return NaN; }
  return Math.floor(date.getTime() / 1000);
}

function buildMarketInfo(candles, interval, displayAdvanceCandles){
  const latest = candles[candles.length - 1];
  const now = Math.floor(Date.now() / 1000);
  const candleDuration = 60;
  const currentMinute = Math.floor(now / 60) * 60;
  const latestMinute = Math.floor(latest.time / 60) * 60;

  const lagMinutes = Math.max(0, Math.floor((currentMinute - latestMinute) / 60));
  const ageSeconds = Math.max(0, now - latest.time);
  const isDelayed = lagMinutes >= 2;
  const isStale = ageSeconds > 300;

  let dataQuality = "LIVE";
  if(isStale){ dataQuality = "STALE"; }
  else if(isDelayed){ dataQuality = "DELAYED"; }

  let missingIntervals = 0;
  for(let i = 1; i < candles.length; i++){
    const diff = candles[i].time - candles[i - 1].time;
    if(diff > 60){
      missingIntervals += Math.max(0, Math.round(diff / 60) - 1);
    }
  }

  const displayAdvanceSeconds = displayAdvanceCandles * 60;
  const displayLatestTimestamp = latest.time + displayAdvanceSeconds;
  const displayTargetTimestamp = displayLatestTimestamp + 60;

  return {
    latestCandleTime: latest.datetime,
    latestTimestamp: latest.time,
    latestPrice: latest.close,
    serverTime: now,
    currentMinute,
    ageSeconds,
    lagMinutes,
    candleDuration,
    displayAdvanceCandles,
    displayAdvanceSeconds,
    displayLatestTimestamp,
    displayLatestTime: new Date(displayLatestTimestamp * 1000).toISOString(),
    nextCandleTimestamp: displayTargetTimestamp,
    nextCandleTime: new Date(displayTargetTimestamp * 1000).toISOString(),
    missingIntervals,
    isDelayed,
    isStale,
    dataQuality,
    alignment: lagMinutes <= displayAdvanceCandles ? "DISPLAY_ALIGNMENT_ACTIVE" : "SOURCE_TOO_OLD"
  };
}

