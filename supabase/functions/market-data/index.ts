const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mgesm.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};
const safe = (value: unknown, max = 64) => String(value || "").trim().slice(0, max);
const isIsin = (value: string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(value);

// Algunas clases de fondos se negocian en mercados con un símbolo distinto al ISIN.
// La búsqueda de Yahoo cubre el resto; estos alias hacen la resolución inmediata.
const knownFunds: Record<string, { symbol: string; name: string }> = {
  IE00BYX5MX67: { symbol: "IE00BYX5MX67.SG", name: "Fidelity S&P 500 Index Fund P-ACC-EUR" },
};

async function getYahooSearch(query: string) {
  const response = await fetch("https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(query) + "&quotesCount=12&newsCount=0");
  if (!response.ok) throw new Error("No se ha podido buscar el fondo");
  return await response.json();
}
async function yahooSymbolFor(input: string) {
  const upper = input.toUpperCase();
  if (knownFunds[upper]) return knownFunds[upper].symbol;
  if (!isIsin(upper)) return upper;
  const data = await getYahooSearch(upper);
  const match = (data?.quotes || []).find((q: any) => q?.symbol && (q?.quoteType === "MUTUALFUND" || q?.quoteType === "ETF" || q?.isYahooFinance));
  if (!match?.symbol) throw new Error("No se ha encontrado una cotización para este ISIN");
  return String(match.symbol);
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
  const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=7d&interval=1d");
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!response.ok || !result) throw new Error(payload?.chart?.error?.description || "No hay valor liquidativo disponible");
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter((v: unknown) => Number.isFinite(Number(v))).map(Number);
  const close = closes[closes.length - 1], previous = closes[closes.length - 2] || result?.meta?.previousClose || close;
  if (!Number.isFinite(close)) throw new Error("El fondo todavía no tiene un valor liquidativo disponible");
  return { symbol, close, price: close, previous_close: previous, percent_change: previous ? (close - previous) / previous * 100 : 0, currency: result?.meta?.currency || "EUR", volume: null, source: "yahoo-fund" };
}
async function yahooHistory(input: string, interval: string, outputsize: number) {
  const symbol = await yahooSymbolFor(input);
  // Los fondos publican NAV diario; no inventamos datos intradía cuando se elige 1D.
  const isIntraday = false;
  const range = isIntraday ? "5d" : interval === "1week" ? "5y" : outputsize <= 35 ? "3mo" : outputsize <= 190 ? "1y" : "5y";
  const yahooInterval = isIntraday ? "5m" : interval === "1week" ? "1wk" : "1d";
  const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=" + range + "&interval=" + yahooInterval);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!response.ok || !result) throw new Error(payload?.chart?.error?.description || "No hay histórico disponible");
  const values = (result.timestamp || []).map((ts: number, i: number) => {
    const close = result?.indicators?.quote?.[0]?.close?.[i];
    if (!Number.isFinite(Number(close))) return null;
    return { datetime: new Date(ts * 1000).toISOString().slice(isIntraday ? 0 : 10, isIntraday ? 16 : 10), close: String(close) };
  }).filter(Boolean).slice(-Math.max(2, Math.min(outputsize, 5000)));
  return { meta: { symbol, currency: result?.meta?.currency || "EUR", source: "yahoo-fund" }, values };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const action = safe(body?.action, 16);
    const input = safe(action === "search" ? body?.query : body?.symbol, 64);
    if (!input) throw new Error(action === "search" ? "Query required" : "Symbol required");

    // Los ISIN se resuelven por la fuente especializada de fondos.
    if (isIsin(input)) {
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
