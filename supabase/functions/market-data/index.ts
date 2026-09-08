const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mgesm.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};
const safe = (value: unknown, max = 64) => String(value || "").trim().slice(0, max);
const isIsin = (value: string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(value);

// Algunas clases de fondos se negocian en mercados con un símbolo distinto al ISIN.
// La búsqueda de Yahoo cubre el resto; estos alias hacen la resolución inmediata.
const knownFunds: Record<string, { symbol: string; twelveSymbol: string; name: string; lastPublishedNav: number; navDate: string }> = {
  // En Yahoo Finance, los fondos europeos tienen sus series de NAV y cotizaciones diarias
  // bajo el ticker de Morningstar (0P...). Stuttgart (.SG) no publica cierres diarios.
  IE00BYX5MX67: { symbol: "0P0001CLDM.F", twelveSymbol: "FEP7:GER", name: "Fidelity S&P 500 Index Fund P-ACC-EUR", lastPublishedNav: 16.4232, navDate: "2026-09-04" },
  IE00BYX5NX33: { symbol: "0P0001CLDK.F", twelveSymbol: "", name: "Fidelity MSCI World Index Fund P-ACC-EUR", lastPublishedNav: 14.2305, navDate: "2026-09-04" },
  IE00B03HCZ61: { symbol: "0P00000RQC.F", twelveSymbol: "", name: "Vanguard Global Stock Index Inv EUR Acc", lastPublishedNav: 53.12, navDate: "2026-09-04" },
};

async function getYahooSearch(query: string) {
  const response = await fetch("https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(query) + "&quotesCount=12&newsCount=0");
  if (!response.ok) throw new Error("No se ha podido buscar el fondo");
  return await response.json();
}
async function yahooSymbolFor(input: string) {
  const upper = input.toUpperCase();
  if (knownFunds[upper]) return knownFunds[upper].symbol;
  if (!isIsin(upper) && !upper.startsWith("0P")) return upper;
  const data = await getYahooSearch(upper);
  const quotes = data?.quotes || [];
  // Priorizar identificador Morningstar (0P...) de Yahoo ya que contiene el NAV real y serie diaria
  const morningstarMatch = quotes.find((q: any) => q?.symbol && String(q.symbol).startsWith("0P"));
  const match = morningstarMatch || quotes.find((q: any) => q?.symbol && (q?.quoteType === "MUTUALFUND" || q?.quoteType === "ETF" || q?.isYahooFinance));
  if (!match?.symbol) throw new Error("No se ha encontrado una cotización para este ISIN");
  return String(match.symbol);
}
const yahooHeaders = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};
async function yahooChart(symbol: string, range: string, interval: string) {
  const path = "/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=" + encodeURIComponent(range) + "&interval=" + encodeURIComponent(interval) + "&includePrePost=false&events=div%2Csplits";
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  const failures: string[] = [];
  for (const host of hosts) {
    try {
      const response = await fetch(host + path, { headers: yahooHeaders });
      const raw = await response.text();
      let payload: any = null;
      try { payload = JSON.parse(raw); } catch { /* se informa abajo con el estado */ }
      const result = payload?.chart?.result?.[0];
      if (response.ok && result) return result;
      failures.push(new URL(host).hostname + " (" + response.status + "): " + (payload?.chart?.error?.description || raw.slice(0, 120) || "sin detalle"));
    } catch (error) {
      failures.push(new URL(host).hostname + ": " + (error instanceof Error ? error.message : "error de red"));
    }
  }
  throw new Error("Yahoo Finance no ha devuelto datos para este fondo. " + failures.join(" · "));
}
// Respaldo para clases de fondos que Yahoo Finance no sirve desde sus endpoints
// públicos. La ficha de Investing contiene el último NAV publicado y su cierre.
async function investingFundQuote(input: string) {
  if (input.toUpperCase() !== "IE00BYX5MX67") throw new Error("No hay una fuente alternativa para este fondo");
  const response = await fetch("https://www.investing.com/funds/ie00byx5mx67", { headers: yahooHeaders });
  const raw = await response.text();
  if (!response.ok) throw new Error("La fuente alternativa no está disponible (" + response.status + ")");
  const readNumber = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) {
        const value = Number(match[1].replace(/,/g, ""));
        if (Number.isFinite(value)) return value;
      }
    }
    return null;
  };
  const price = readNumber([
    /"last_last"\s*:\s*"?([0-9]+(?:[.,][0-9]+)?)"?/i,
    /"last"\s*:\s*"?([0-9]+(?:[.,][0-9]+)?)"?/i,
    /data-test="instrument-header-details"[\s\S]{0,800}?([0-9]+\.[0-9]{2,4})/i,
  ]);
  const previous = readNumber([
    /"last_close"\s*:\s*"?([0-9]+(?:[.,][0-9]+)?)"?/i,
    /Prev\. Close[\s\S]{0,160}?([0-9]+\.[0-9]{2,4})/i,
  ]) || price;
  if (!price) throw new Error("La fuente alternativa no ha incluido el valor liquidativo");
  return { symbol: "IE00BYX5MX67", close: price, price, previous_close: previous, percent_change: previous ? (price - previous) / previous * 100 : 0, currency: "EUR", volume: null, source: "investing-fund" };
}
async function twelveFundQuote(input: string) {
  const known = knownFunds[input.toUpperCase()];
  const key = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!known || !key) throw new Error("No se ha configurado la fuente alternativa de fondos");
  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", known.twelveSymbol);
  url.searchParams.set("apikey", key);
  const response = await fetch(url);
  const data = await response.json();
  // En Twelve Data, price es la última cotización; close puede ser el cierre
  // anterior durante la sesión. Para valorar una cartera se usa el precio actual.
  const price = Number(data?.price || data?.close);
  const previous = Number(data?.previous_close || data?.close || price);
  if (!response.ok || data?.status === "error" || !Number.isFinite(price)) throw new Error(data?.message || "Twelve Data no ha devuelto NAV para este fondo");
  return { symbol: input.toUpperCase(), close: price, price, previous_close: previous, percent_change: previous ? (price - previous) / previous * 100 : 0, currency: data?.currency || "EUR", volume: null, source: "twelve-fund" };
}
function publishedFundNav(input: string) {
  const known = knownFunds[input.toUpperCase()];
  if (!known) throw new Error("No hay un NAV publicado de respaldo para este fondo");
  return { symbol: input.toUpperCase(), close: known.lastPublishedNav, price: known.lastPublishedNav, previous_close: known.lastPublishedNav, percent_change: 0, currency: "EUR", volume: null, source: "published-fund-nav", as_of: known.navDate };
}
function yahooSearchItems(data: any, input: string) {
  return (data?.quotes || []).filter((q: any) => q?.symbol).map((q: any) => ({
    // Conservamos el ISIN: así las posteriores consultas de precio e histórico
    // vuelven a pasar por el resolver de fondos, no por Twelve Data.
    symbol: isIsin(input) ? input.toUpperCase() : q.symbol,
    instrument_name: q.longname || q.shortname || q.symbol,
    instrument_type: q.quoteType === "MUTUALFUND" ? "Fondo de inversión" : q.quoteType === "ETF" ? "ETF" : q.quoteType || "Producto de inversión",
  }));
}
async function yahooQuote(input: string) {
  const symbol = await yahooSymbolFor(input);
  try {
    const result = await yahooChart(symbol, "7d", "1d");
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter((v: unknown) => Number.isFinite(Number(v))).map(Number);
    let close = closes[closes.length - 1];
    let previous = closes[closes.length - 2] || result?.meta?.previousClose || close;
    if (!Number.isFinite(close)) {
      const metaPrice = Number(result?.meta?.regularMarketPrice);
      if (Number.isFinite(metaPrice)) {
        close = metaPrice;
        previous = Number(result?.meta?.chartPreviousClose || result?.meta?.previousClose || metaPrice);
      }
    }
    if (!Number.isFinite(close)) throw new Error("El fondo todavía no tiene un valor liquidativo disponible");
    return {
      symbol: input.toUpperCase(),
      close,
      price: close,
      previous_close: previous,
      percent_change: previous ? (close - previous) / previous * 100 : 0,
      currency: result?.meta?.currency || "EUR",
      volume: null,
      source: "yahoo-fund"
    };
  } catch (error) {
    if (isIsin(input)) {
      try { return await twelveFundQuote(input); }
      catch { try { return await investingFundQuote(input); }
      catch { return publishedFundNav(input); } }
    }
    throw error;
  }
}
async function yahooHistory(input: string, interval: string, outputsize: number) {
  const symbol = await yahooSymbolFor(input);
  // Los fondos publican NAV diario; no inventamos datos intradía cuando se elige 1D.
  const isIntraday = false;
  const range = isIntraday ? "5d" : interval === "1week" ? "5y" : outputsize <= 35 ? "3mo" : outputsize <= 190 ? "1y" : "5y";
  const yahooInterval = isIntraday ? "5m" : interval === "1week" ? "1wk" : "1d";
  const result = await yahooChart(symbol, range, yahooInterval);
  const values = (result.timestamp || []).map((ts: number, i: number) => {
    const close = result?.indicators?.quote?.[0]?.close?.[i];
    if (!Number.isFinite(Number(close))) return null;
    const iso = new Date(ts * 1000).toISOString();
    return { datetime: isIntraday ? iso.slice(0, 16) : iso.slice(0, 10), close: String(close) };
  }).filter(Boolean).slice(-Math.max(2, Math.min(outputsize, 5000)));
  return { meta: { symbol: input.toUpperCase(), currency: result?.meta?.currency || "EUR", source: "yahoo-fund" }, values };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const action = safe(body?.action, 16);
    const input = safe(action === "search" ? body?.query : body?.symbol, 64);
    if (!input) throw new Error(action === "search" ? "Query required" : "Symbol required");

    // Los ISIN y códigos de fondos Morningstar (0P...) se resuelven por la fuente especializada de fondos.
    if (isIsin(input) || input.toUpperCase().startsWith("0P")) {
      if (action === "search") {
        const known = knownFunds[input.toUpperCase()];
        if (known) return Response.json({ data: { data: [{ symbol: input.toUpperCase(), instrument_name: known.name, instrument_type: "Fondo de inversión" }] } }, { headers: corsHeaders });
        return Response.json({ data: { data: yahooSearchItems(await getYahooSearch(input), input) } }, { headers: corsHeaders });
      }
      if (action === "quote") return Response.json({ data: await yahooQuote(input) }, { headers: corsHeaders });
      if (action === "history") return Response.json({ data: await yahooHistory(input, safe(body?.interval, 8), Number(body?.outputsize) || 90) }, { headers: corsHeaders });
    }

    const key = Deno.env.get("TWELVE_DATA_API_KEY");
    if (!key) throw new Error("Market data is not configured");
    const endpoint = action === "search" ? "symbol_search" : action === "quote" ? "quote" : action === "history" ? "time_series" : "";
    if (!endpoint) throw new Error("Unsupported action");
    const url = new URL("https://api.twelvedata.com/" + endpoint);
    if (action === "search") {
      if (input.length < 2) return Response.json({ data: [] }, { headers: corsHeaders });
      url.searchParams.set("symbol", input);
    } else {
      url.searchParams.set("symbol", input);
      if (action === "history") {
        const interval = safe(body?.interval, 8);
        url.searchParams.set("interval", ["5min", "1day", "1week"].includes(interval) ? interval : "1day");
        url.searchParams.set("outputsize", String(Math.max(2, Math.min(Number(body?.outputsize) || 90, 5000))));
      }
    }
    url.searchParams.set("apikey", key);
    const response = await fetch(url); const data = await response.json();
    if (!response.ok || data?.status === "error") throw new Error(data?.message || "Market data provider error");
    return Response.json({ data }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400, headers: corsHeaders });
  }
});
