import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mgesm.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const yahooHeaders = {
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

async function getYahooSearch(query: string) {
  const response = await fetch("https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(query) + "&quotesCount=12&newsCount=0", { headers: yahooHeaders });
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

function yahooSearchItems(data: any, originalInput: string) {
  const quotes = data?.quotes || [];
  return quotes.slice(0, 8).map((q: any) => ({
    symbol: originalInput.toUpperCase(),
    instrument_name: q?.shortname || q?.longname || q?.name || originalInput.toUpperCase(),
    instrument_type: "Fondo de inversión",
    currency: q?.currency || "EUR",
  }));
}

async function yahooQuote(input: string) {
  const symbol = await yahooSymbolFor(input);
  const result = await yahooChart(symbol, "1mo", "1d");
  const meta = result?.meta;
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(
    (v: any) => v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0
  );
  const price = closes.length ? Number(closes[closes.length - 1]) : Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    const known = knownFunds[input.toUpperCase()];
    if (known) return { symbol: input.toUpperCase(), name: known.name, price: String(known.lastPublishedNav), currency: "EUR", is_backup_nav: true, nav_date: known.navDate };
    throw new Error("No se ha podido obtener el valor liquidativo de este fondo");
  }
  const prevClose = closes.length > 1 ? Number(closes[closes.length - 2]) : Number(meta?.chartPreviousClose || meta?.previousClose || price);
  const change = price - prevClose;
  const percent_change = prevClose > 0 ? (change / prevClose) * 100 : 0;
  return {
    symbol: input.toUpperCase(),
    name: meta?.shortName || meta?.longName || knownFunds[input.toUpperCase()]?.name || input.toUpperCase(),
    price: String(price),
    close: String(price),
    previous_close: String(prevClose),
    change: String(change),
    percent_change: String(percent_change),
    currency: meta?.currency || "EUR",
    datetime: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
  };
}

async function yahooHistory(input: string, interval: string, outputsize: number) {
  const symbol = await yahooSymbolFor(input);
  const isIntraday = interval === "5min";
  const range = isIntraday ? "5d" : outputsize <= 35 ? "1mo" : outputsize <= 190 ? "1y" : "5y";
  const yahooInterval = isIntraday ? "5m" : "1d";
  const result = await yahooChart(symbol, range, yahooInterval);
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const values = timestamps.map((ts: number, i: number) => {
    const close = closes[i];
    if (close === null || close === undefined || !Number.isFinite(Number(close)) || Number(close) <= 0) return null;
    const iso = new Date(ts * 1000).toISOString();
    return { datetime: isIntraday ? iso.slice(0, 16) : iso.slice(0, 10), close: String(close) };
  }).filter(Boolean).slice(-Math.max(2, Math.min(outputsize, 5000)));
  return { meta: { symbol: input.toUpperCase(), currency: result?.meta?.currency || "EUR", source: "yahoo-fund" }, values };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Autenticación obligatoria con JWT del usuario
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Cabecera Authorization requerida" }, { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return Response.json({ error: "Sesión no válida o expirada" }, { status: 401, headers: corsHeaders });
    }

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
