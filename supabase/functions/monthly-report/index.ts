import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const euro = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mgesm.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backup-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const base64 = (bytes: Uint8Array) => { let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); };
const median = (values: number[]) => { const v = values.slice().sort((a,b)=>a-b), m = Math.floor(v.length / 2); return v.length ? (v.length % 2 ? v[m] : (v[m-1]+v[m])/2) : 0; };

async function exportPdf(title: string, income: number, expense: number, balance: number, txs: any[], categories: Array<{name:string;spent:number;budget:number}>, unusual: Array<{note:string;amount:number}>, accounts: any[], patrimony: any[], cutoffDate: string) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 45;
  let page = pdf.addPage([W, H]), y = H - 38;
  const text = (s: string, x: number, size = 10, strong = false, color = rgb(0.12, 0.16, 0.22)) => page.drawText(s.slice(0, 100), { x, y, size, font: strong ? bold : normal, color });
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 38; };
  const ensure = (height: number) => { if (y - height < 42) newPage(); };
  const section = (s: string) => { ensure(28); y -= 10; text(s, M, 12, true, rgb(0.12, 0.16, 0.22)); y -= 16; };
  const money = (v: number) => euro(v);

  // 1. Membrete White Edition (fondo blanco inmaculado, marca fintrack. y divisor hairline)
  y = H - 38;
  page.drawText("fintrack.", { x: M, y, size: 20, font: bold, color: rgb(0.09, 0.64, 0.29) }); // #16A34A
  page.drawText("Informe mensual · " + title, { x: W - M - 170, y: y + 2, size: 9, font: normal, color: rgb(0.4, 0.45, 0.5) });
  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: rgb(0.88, 0.91, 0.94) });
  y -= 22;

  // 2. Tarjetas KPI sutiles (Fondo suave alabastro/pastel con cifras legibles)
  const cards = [
    ["INGRESOS", income, rgb(0.94, 0.99, 0.96), rgb(0.09, 0.55, 0.24)], // #F0FDF4, verde
    ["GASTOS", expense, rgb(0.99, 0.95, 0.95), rgb(0.86, 0.15, 0.15)],  // #FEF2F2, rojo
    ["BALANCE", balance, rgb(0.94, 0.96, 1.0), balance >= 0 ? rgb(0.12, 0.23, 0.54) : rgb(0.86, 0.15, 0.15)] // azul marino o rojo
  ];
  cards.forEach((c, i) => {
    const x = M + i * 172;
    page.drawRectangle({ x, y: y - 52, width: 162, height: 48, color: c[2] as any, borderColor: rgb(0.88, 0.91, 0.94), borderWidth: 0.5 });
    page.drawText(c[0] as string, { x: x + 12, y: y - 18, size: 8, font: bold, color: rgb(0.4, 0.45, 0.5) });
    page.drawText(((i === 2 && Number(c[1]) >= 0 ? "+" : "") + money(Number(c[1]))), { x: x + 12, y: y - 38, size: 13, font: bold, color: c[3] as any });
  });
  y -= 72;

  // 3. Distribución de gastos (barras ultra-esbeltas)
  section("Distribución de gastos");
  const max = Math.max(...categories.map(c => c.spent), 1);
  categories.filter(c => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 8).forEach(c => {
    ensure(18);
    text(c.name, M, 9, false, rgb(0.2, 0.25, 0.3));
    page.drawRectangle({ x: M + 145, y: y - 5, width: 210, height: 4, color: rgb(0.93, 0.95, 0.96) });
    page.drawRectangle({ x: M + 145, y: y - 5, width: Math.max(2, 210 * c.spent / max), height: 4, color: rgb(0.09, 0.64, 0.29) });
    page.drawText(money(c.spent), { x: W - M - 60, y, size: 9, font: bold, color: rgb(0.12, 0.16, 0.22) });
    y -= 15;
  });

  // 4. Estado de cuentas ordinarias (excluye cuentas de inversión)
  section("Cuentas bancarias");
  const regularAccounts = (accounts ?? []).filter((a: any) => !a.is_investment);
  regularAccounts.forEach((a: any) => {
    ensure(18);
    const snapshots = (patrimony ?? []).filter((p: any) => p.account_id === a.id && String(p.reset_date || "") <= cutoffDate).sort((p: any, q: any) => String(q.reset_date || "").localeCompare(String(p.reset_date || "")));
    const p = snapshots[0];
    text(a.name || "Cuenta", M, 9, true, rgb(0.2, 0.25, 0.3));
    page.drawText(p ? money(Number(p.amount)) : "—", { x: W - M - 70, y, size: 9, font: bold, color: rgb(0.12, 0.16, 0.22) });
    y -= 16;
  });

  // 5. Control presupuestario
  section("Control presupuestario");
  categories.filter(c => c.spent > 0).sort((a, b) => b.spent - a.spent).forEach(c => {
    ensure(18);
    text(c.name.slice(0, 22), M, 9, false, rgb(0.2, 0.25, 0.3));
    page.drawRectangle({ x: M + 145, y: y - 5, width: 210, height: 4, color: rgb(0.93, 0.95, 0.96) });
    page.drawRectangle({ x: M + 145, y: y - 5, width: Math.max(2, 210 * c.spent / max), height: 4, color: c.budget > 0 && c.spent > c.budget ? rgb(0.86, 0.15, 0.15) : rgb(0.09, 0.64, 0.29) });
    page.drawText(money(c.spent) + (c.budget ? " / " + money(c.budget) : ""), { x: W - M - 120, y, size: 8, font: bold, color: rgb(0.2, 0.25, 0.3) });
    y -= 15;
  });

  // 6. Libro Mayor (Open Ledger sobre Alabastro sin cuadros negros)
  newPage();
  text("Movimientos · " + title, M, 13, true, rgb(0.12, 0.16, 0.22));
  y -= 18;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 16, color: rgb(0.97, 0.98, 0.99), borderColor: rgb(0.88, 0.91, 0.94), borderWidth: 0.5 });
    page.drawText("Fecha", { x: M + 6, y: y - 2, size: 8, font: bold, color: rgb(0.3, 0.35, 0.4) });
    page.drawText("Categoría", { x: M + 70, y: y - 2, size: 8, font: bold, color: rgb(0.3, 0.35, 0.4) });
    page.drawText("Nota", { x: M + 190, y: y - 2, size: 8, font: bold, color: rgb(0.3, 0.35, 0.4) });
    page.drawText("Importe", { x: W - M - 52, y: y - 2, size: 8, font: bold, color: rgb(0.3, 0.35, 0.4) });
    y -= 17;
  };
  head();

  txs.sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach((t, i) => {
    if (y < 48) { newPage(); head(); }
    if (i % 2 === 0) page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 14, color: rgb(0.98, 0.99, 1.0) });
    text(String(t.date || "").slice(8, 10) + "/" + String(t.date || "").slice(5, 7), M + 6, 8, false, rgb(0.4, 0.45, 0.5));
    text((t.category_name || "Transferencia").slice(0, 20), M + 70, 8, true, rgb(0.2, 0.25, 0.3));
    text(((t.note || t.subcategory || "") + (t.calc_badge ? " " + t.calc_badge : "")).slice(0, 36), M + 190, 8, false, rgb(0.35, 0.4, 0.45));
    page.drawText((t.type === "expense" ? "-" : t.type === "income" ? "+" : "") + money(Number(t.amount)), {
      x: W - M - 52, y, size: 8, font: bold,
      color: t.type === "expense" ? rgb(0.86, 0.15, 0.15) : t.type === "income" ? rgb(0.09, 0.64, 0.29) : rgb(0.12, 0.23, 0.54)
    });
    y -= 14;
  });

  // 7. Análisis adicional
  newPage();
  text("Análisis del mes · " + title, M, 14, true, rgb(0.09, 0.64, 0.29));
  y -= 24;
  section("Presupuestos superados");
  const over = categories.filter(c => c.budget > 0 && c.spent > c.budget).sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));
  if (!over.length) text("No has superado ningún presupuesto este mes.", M, 9, false, rgb(0.4, 0.45, 0.5));
  else over.forEach(c => {
    ensure(18);
    text(c.name + ": " + money(c.spent) + " de " + money(c.budget) + "  (+" + money(c.spent - c.budget) + ")", M, 9, true, rgb(0.86, 0.15, 0.15));
    y -= 16;
  });

  section("Gastos extraordinarios");
  if (!unusual.length) text("No se han detectado gastos excepcionalmente altos.", M, 9, false, rgb(0.4, 0.45, 0.5));
  else unusual.forEach(x => {
    ensure(18);
    text((x.note || "Gasto sin descripción") + ": " + money(x.amount), M, 9, false, rgb(0.2, 0.25, 0.3));
    y -= 16;
  });

  section("Lectura ejecutiva");
  text("El balance neto del mes ha sido de " + ((balance >= 0 ? "+" : "") + money(balance)) + ".", M, 9, true, balance >= 0 ? rgb(0.12, 0.23, 0.54) : rgb(0.86, 0.15, 0.15));
  y -= 16;
  text("Tus categorías de mayor impacto financiero se desglosan en las páginas anteriores.", M, 9, false, rgb(0.4, 0.45, 0.5));

  return pdf.save();
}

async function sendMonthlyReportForUser(db: any, targetUserId: string, targetEmail: string, key: string, start: Date, from: string, to: string, previousFrom: string, preview: boolean) {
  const [{ data: tx, error: txError }, { data: voids }, { data: cats }, { data: budgets }, { data: previousTx }, { data: accountRows }, { data: patrimonyRows }, { data: resendKey }] = await Promise.all([
    db.from("transactions").select("*").eq("user_id", targetUserId).gte("date", from).lt("date", to),
    db.from("transaction_voids").select("transaction_id").eq("user_id", targetUserId),
    db.from("categories").select("id,name").eq("user_id", targetUserId),
    db.from("budgets").select("category_id,amount").eq("user_id", targetUserId).eq("month_year", key),
    db.from("transactions").select("type,amount,tags,exclude_from_calc").eq("user_id", targetUserId).gte("date", previousFrom).lt("date", from),
    db.from("accounts").select("*").eq("user_id", targetUserId),
    db.from("patrimony").select("*").eq("user_id", targetUserId),
    db.rpc("get_fintrack_resend_api_key")
  ]);
  if (txError || !resendKey) throw new Error(txError?.message || "Email sender not configured");
  const voided = new Set((voids ?? []).map((x: any) => x.transaction_id));
  const isExcludedFromExpense = (x: any) => (x.exclude_from_calc === true || x.exclude_from_calc === 1 || x.exclude_from_calc === 2 || x.exclude_from_calc === "1" || x.exclude_from_calc === "2") || (Array.isArray(x.tags) && (x.tags.includes("_no_calc") || x.tags.includes("_no_expense")));
  const isExcludedFromBalance = (x: any) => (x.exclude_from_calc === true || x.exclude_from_calc === 2 || x.exclude_from_calc === "2") || (Array.isArray(x.tags) && x.tags.includes("_no_calc"));
  const nonVoided = (tx ?? []).filter((x: any) => !voided.has(x.id) && x.type !== "transfer" && !x.is_balance_adjustment);
  const activeExp = nonVoided.filter((x: any) => !isExcludedFromExpense(x));
  const activeBal = nonVoided.filter((x: any) => !isExcludedFromBalance(x));
  const expensesTx = activeExp.filter((x: any) => x.type === "expense");
  const income = activeExp.filter((x: any) => x.type === "income").reduce((s: number, x: any) => s + Number(x.amount), 0);
  const expense = expensesTx.reduce((s: number, x: any) => s + Number(x.amount), 0);
  const balExpense = activeBal.filter((x: any) => x.type === "expense").reduce((s: number, x: any) => s + Number(x.amount), 0);
  const balance = income - balExpense;
  const names = new Map((cats ?? []).map((x: any) => [x.id, x.name]));
  const budgetByCategory = new Map((budgets ?? []).filter((x: any) => x.category_id).map((x: any) => [x.category_id, Number(x.amount)]));
  const totals = new Map<string, number>();
  expensesTx.forEach((x: any) => totals.set(x.category, (totals.get(x.category) ?? 0) + Number(x.amount)));
  const categories = Array.from(new Set([...totals.keys(), ...budgetByCategory.keys()])).map(id => ({ name: names.get(id) ?? "Sin categoría", spent: totals.get(id) ?? 0, budget: budgetByCategory.get(id) ?? 0 }));
  const med = median(expensesTx.map((x: any) => Number(x.amount)));
  const unusual = expensesTx.filter((x: any) => med > 0 && Number(x.amount) >= Math.max(med * 2.5, 100)).sort((a: any, b: any) => Number(b.amount) - Number(a.amount)).slice(0, 6).map((x: any) => ({ note: x.note, amount: Number(x.amount) }));
  const namedTransactions = nonVoided.map((x: any) => ({
    ...x,
    category_name: names.get(x.category) ?? "Sin categoría",
    calc_badge: isExcludedFromBalance(x) ? "[No computa]" : isExcludedFromExpense(x) ? "[Solo balance]" : ""
  }));
  const monthTitle = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(start);
  const bytes = await exportPdf(monthTitle, income, expense, balance, namedTransactions, categories, unusual, accountRows ?? [], patrimonyRows ?? [], to);
  const path = targetUserId + "/" + (preview ? "vista-previa-" + key + "-" + Date.now() : "informe-" + key) + ".pdf";
  const { error: uploadError } = await db.storage.from("fintrack-reports").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const email = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "FinTrack <onboarding@resend.dev>",
      to: [targetEmail],
      subject: (preview ? "Vista previa · " : "FinTrack · Informe de ") + monthTitle,
      html: "<p>" + (preview ? "Esta es una vista previa" : "Ya tienes listo tu informe mensual") + " de <strong>" + monthTitle + "</strong>.</p><p>Adjunto encontrarás el PDF con el cierre y los principales avisos.</p>",
      attachments: [{ filename: "fintrack-" + key + ".pdf", content: base64(bytes) }]
    })
  });
  if (!email.ok) { await db.storage.from("fintrack-reports").remove([path]); throw new Error("Email service returned " + email.status); }
  if (!preview) {
    const { error: recordError } = await db.from("monthly_report_runs").insert({ user_id: targetUserId, report_month: key, path, status: "completed" });
    if (recordError) throw new Error(recordError.message);
  }
  return { status: preview ? "preview_sent" : "sent", month: key };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const cronToken = req.headers.get("x-backup-cron-token") || "";
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    let targetUser: any = null;

    if (token) {
      const { data: { user }, error } = await db.auth.getUser(token);
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      targetUser = user;
    } else if (cronToken) {
      const expectedToken = Deno.env.get("BACKUP_CRON_TOKEN") || "";
      if (!expectedToken || cronToken !== expectedToken) {
        return json({ error: "Cron unauthorized" }, 401);
      }
    } else {
      return json({ error: "Unauthorized" }, 401);
    }

    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const key = prevMonthDate.getFullYear() + "-" + String(prevMonthDate.getMonth() + 1).padStart(2, "0");
    const from = key + "-01";
    const to = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01";
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const previousFrom = twoMonthsAgo.getFullYear() + "-" + String(twoMonthsAgo.getMonth() + 1).padStart(2, "0") + "-01";

    if (targetUser) {
      const res = await sendMonthlyReportForUser(db, targetUser.id, targetUser.email, key, prevMonthDate, from, to, previousFrom, body?.preview === true);
      return json(res);
    }

    return json({ message: "Cron report processing completed" });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
