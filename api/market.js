export default async function handler(req, res) {
  try {
    // ==============================
    // 1. API KEY
    // ==============================
    const API_KEY = process.env.TWELVE_DATA_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        status: "error",
        message: "TWELVE_DATA_API_KEY is missing in Vercel Environment Variables"
      });
    }

    // ==============================
    // 2. INPUT
    // ==============================
    const symbol = req.query.symbol || "EUR/USD";
    const interval = req.query.interval || "1min";

    // শুধুমাত্র অনুমোদিত interval
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
        message: "Invalid interval"
      });
    }

    // ==============================
    // 3. TWELVE DATA REQUEST
    // ==============================
    const url =
      "https://api.twelvedata.com/time_series" +
      "?symbol=" + encodeURIComponent(symbol) +
      "&interval=" + encodeURIComponent(interval) +
      "&outputsize=100";

    const response = await fetch(url, {
      headers: {
        "Authorization": "apikey " + API_KEY
      }
    });

    const data = await response.json();

    // ==============================
    // 4. TWELVE DATA ERROR
    // ==============================
    if (!response.ok || data.status === "error") {
      return res.status(response.status || 400).json({
        status: "error",
        message: data.message || "Twelve Data request failed",
        code: data.code || null
      });
    }

    // ==============================
    // 5. NORMALIZE CANDLES
    // ==============================
    const candles = (data.values || [])
      .map(item => ({
        time: item.datetime,
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close)
      }))
      .filter(item =>
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close)
      )
      .reverse();

    // ==============================
    // 6. RETURN TO FINORIX
    // ==============================
    return res.status(200).json({
      status: "ok",

      source: "Twelve Data",

      symbol: data.meta?.symbol || symbol,

      interval,

      candles
    });

  } catch (error) {

    console.error("MARKET API ERROR:", error);

    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error.message
    });
  }
}
