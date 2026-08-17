export default async function handler(req, res) {

  try {

    // =====================================================
    // FINORIX LIVE PRICE API
    // Twelve Data -> Latest Price
    // =====================================================

    const API_KEY =
      process.env.TWELVE_DATA_API_KEY;


    // -----------------------------------------------------
    // 1. API KEY CHECK
    // -----------------------------------------------------

    if (!API_KEY) {

      return res.status(500).json({

        status: "error",

        source: "Finorix Price API",

        message:
          "TWELVE_DATA_API_KEY is missing in Vercel Environment Variables"

      });

    }


    // -----------------------------------------------------
    // 2. SYMBOL
    // -----------------------------------------------------

    const symbol =
      String(
        req.query.symbol ||
        "EUR/USD"
      ).trim();


    if (!symbol) {

      return res.status(400).json({

        status: "error",

        source: "Finorix Price API",

        message:
          "Market symbol is required"

      });

    }


    // -----------------------------------------------------
    // 3. TWELVE DATA REQUEST
    // -----------------------------------------------------

    const params =
      new URLSearchParams({

        symbol,

        apikey:
          API_KEY

      });


    const apiUrl =
      "https://api.twelvedata.com/price?" +
      params.toString();


    // -----------------------------------------------------
    // 4. FETCH
    // -----------------------------------------------------

    const response =
      await fetch(
        apiUrl,
        {
          method:"GET",

          headers:{
            Accept:
              "application/json"
          },

          cache:"no-store"
        }
      );


    let data;


    try {

      data =
        await response.json();

    } catch {

      return res.status(502).json({

        status:"error",

        source:"Twelve Data",

        message:
          "Invalid JSON response from Twelve Data"

      });

    }


    // -----------------------------------------------------
    // 5. TWELVE DATA ERROR
    // -----------------------------------------------------

    if (
      !response.ok ||
      data?.status === "error"
    ) {

      return res.status(
        response.ok
          ? 400
          : response.status
      ).json({

        status:"error",

        source:"Twelve Data",

        message:
          data?.message ||
          "Twelve Data price request failed",

        code:
          data?.code ||
          null

      });

    }


    // -----------------------------------------------------
    // 6. PRICE VALIDATION
    // -----------------------------------------------------

    const price =
      Number(data?.price);


    if (
      !Number.isFinite(price)
    ) {

      return res.status(502).json({

        status:"error",

        source:"Twelve Data",

        message:
          "Invalid price received from Twelve Data",

        symbol

      });

    }


    // -----------------------------------------------------
    // 7. RESPONSE
    // -----------------------------------------------------

    return res.status(200).json({

      status:"ok",

      source:"Twelve Data",

      symbol,

      price,

      timestamp:
        Math.floor(
          Date.now() / 1000
        )

    });


  } catch (error) {

    console.error(
      "FINORIX PRICE API ERROR:",
      error
    );


    return res.status(500).json({

      status:"error",

      source:"Finorix Price API",

      message:
        "Internal server error",

      error:
        error?.message ||
        "Unknown error"

    });

  }

}
