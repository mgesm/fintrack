import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const euro = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backup-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const base64 = (bytes: Uint8Array) => { let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); };
const median = (values: number[]) => { const v = values.slice().sort((a,b)=>a-b), m = Math.floor(v.length / 2); return v.length ? (v.length % 2 ? v[m] : (v[m-1]+v[m])/2) : 0; };

async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticatedUser(db: any, req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await db.auth.getUser(token);
  return error ? null : user;
}

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

function buildEmailHtml(monthTitle: string, income: number, expense: number, balance: number, categories: Array<{name:string;spent:number;budget:number}>, targetEmail: string, preview: boolean, key: string) {
  const topCategories = categories
    .filter(c => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 4);

  const savingsRate = income > 0 ? Math.max(0, ((income - expense) / income) * 100).toFixed(1) : null;
  const balanceSign = balance >= 0 ? "+" : "";
  const balanceColor = balance >= 0 ? "#1e3a8a" : "#b91c1c";

  const categoriesRows = topCategories.map(c => {
    const pct = expense > 0 ? ((c.spent / expense) * 100).toFixed(0) : "0";
    return `
      <tr>
        <td style="padding: 10px 0; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9;">
          <strong>${c.name}</strong>
        </td>
        <td style="padding: 10px 0; font-size: 13px; color: #64748b; text-align: right; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums;">
          ${pct} %
        </td>
        <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums;">
          ${euro(c.spent)}
        </td>
      </tr>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>fintrack · Resumen de ${monthTitle}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #0f172a;">
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);">
          <!-- Header fintrack -->
          <tr>
            <td style="padding: 32px 32px 20px 32px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 800; letter-spacing: -0.6px; color: #0f172a; line-height: 1;">
                      fin<span style="color: #16a34a;">track.</span>
                    </div>
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; margin-top: 6px;">
                      ${preview ? "Vista previa · " : "Resumen mensual · "}${monthTitle}
                    </div>
                  </td>
                  <td align="right" valign="top">
                    <span style="display: inline-block; padding: 4px 10px; background-color: #f1f5f9; color: #475569; font-size: 11px; font-weight: 600; border-radius: 9999px; letter-spacing: 0.02em;">
                      ${preview ? "VISTA PREVIA" : "CONSOLIDADO"}
                    </span>
                  </td>
                </tr>
              </table>
              <div style="height: 1px; background-color: #f1f5f9; margin-top: 20px;"></div>
            </td>
          </tr>

          <!-- Intro copy -->
          <tr>
            <td style="padding: 0 32px 20px 32px; font-size: 14px; line-height: 1.5; color: #475569;">
              Aquí tienes el resumen financiero consolidado de <strong>${monthTitle}</strong>. El documento completo con el arqueo de cuentas, control presupuestario y libro mayor agrupado se encuentra adjunto en formato PDF.
            </td>
          </tr>

          <!-- KPI Cards -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- Ingresos -->
                  <td width="31%" valign="top" style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-radius: 14px; padding: 12px 14px;">
                    <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #166534;">
                      Ingresos
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #15803d; margin-top: 4px; font-variant-numeric: tabular-nums;">
                      ${euro(income)}
                    </div>
                  </td>
                  <td width="3.5%"></td>
                  <!-- Gastos -->
                  <td width="31%" valign="top" style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 14px; padding: 12px 14px;">
                    <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #991b1b;">
                      Gastos
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #b91c1c; margin-top: 4px; font-variant-numeric: tabular-nums;">
                      ${euro(expense)}
                    </div>
                  </td>
                  <td width="3.5%"></td>
                  <!-- Balance -->
                  <td width="31%" valign="top" style="background-color: #eff6ff; border: 1px solid #dbeafe; border-radius: 14px; padding: 12px 14px;">
                    <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #1e40af;">
                      Balance
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: ${balanceColor}; margin-top: 4px; font-variant-numeric: tabular-nums;">
                      ${balanceSign}${euro(balance)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${savingsRate !== null ? `
          <!-- Tasa de ahorro -->
          <tr>
            <td style="padding: 0 32px 20px 32px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
                <tr>
                  <td style="padding: 10px 16px; font-size: 12px; font-weight: 600; color: #475569;">
                    Tasa de ahorro del periodo
                  </td>
                  <td align="right" style="padding: 10px 16px; font-size: 13px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums;">
                    ${savingsRate} %
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ""}

          ${topCategories.length > 0 ? `
          <!-- Categorías destacadas -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">
                Mayores gastos por categoría
              </div>
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                ${categoriesRows}
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- PDF callout -->
          <tr>
            <td style="padding: 0 32px 28px 32px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px;">
                <tr>
                  <td style="padding: 14px 16px; font-size: 12px; line-height: 1.55; color: #475569;">
                    <strong style="color: #0f172a;">Informe editorial adjunto:</strong> Encuentras el documento <span style="font-family: monospace; font-size: 11px; color: #0f172a;">fintrack-${key}.pdf</span> adjunto a este correo con el informe completo en diseño White Edition, libro mayor agrupado por jornadas y balance de cuentas.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 0 32px 32px 32px;">
              <a href="https://mgesm.github.io/fintrack/" style="display: inline-block; padding: 12px 28px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 9999px; font-size: 13px; font-weight: 600; letter-spacing: -0.2px;">
                Abrir fintrack
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px;">
                fintrack · finanzas personales privadas
              </div>
              <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
                Este resumen se ha generado automáticamente con el cierre del periodo.<br>
                Tus datos financieros son privados y están cifrados.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

async function sendMonthlyReportForUser(db: any, targetUserId: string, targetEmail: string, key: string, start: Date, from: string, to: string, previousFrom: string, preview: boolean) {
  const [{ data: tx, error: txError }, { data: voids }, { data: cats }, { data: budgets }, { data: previousTx }, { data: accountRows }, { data: patrimonyRows }, { data: resendKey }] = await Promise.all([
    db.from("transactions").select("*").eq("user_id", targetUserId).gte("date", from).lt("date", to),
    db.from("transaction_voids").select("transaction_id").eq("user_id", targetUserId),
    db.from("categories").select("id,name").eq("user_id", targetUserId),
    db.from("budgets").select("category_id,amount").eq("user_id", targetUserId).eq("month_year", key),
    db.from("transactions").select("type,amount,tags,exclude_from_calc,is_balance_adjustment").eq("user_id", targetUserId).gte("date", previousFrom).lt("date", from),
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
  const previousExpense = (previousTx ?? []).filter((x: any) => x.type === "expense" && !x.is_balance_adjustment).reduce((s: number, x: any) => s + Number(x.amount), 0);
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
  const emailHtml = buildEmailHtml(monthTitle, income, expense, balance, categories, targetEmail, preview, key);
  const email = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "fintrack <onboarding@resend.dev>",
      to: [targetEmail],
      subject: (preview ? "fintrack · Vista previa de " : "fintrack · Resumen de ") + monthTitle,
      html: emailHtml,
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
    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    const user = await authenticatedUser(db, req);
    const cronToken = req.headers.get("x-backup-cron-token") || "";

    const now = new Date();
    const preview = body?.preview === true && typeof body?.month === "string" && /^\d{4}-\d{2}$/.test(body.month);
    const requested = preview
      ? new Date(Date.UTC(Number(body.month.slice(0, 4)), Number(body.month.slice(5, 7)) - 1, 1))
      : (typeof body?.month === "string" && /^\d{4}-\d{2}$/.test(body.month))
        ? new Date(Date.UTC(Number(body.month.slice(0, 4)), Number(body.month.slice(5, 7)) - 1, 1))
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const start = requested;
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const key = start.toISOString().slice(0, 7);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const previousFrom = previous.toISOString().slice(0, 10);

    // 1. Modalidad Usuario Autenticado (vía Bearer JWT)
    if (user) {
      const res = await sendMonthlyReportForUser(db, user.id, user.email, key, start, from, to, previousFrom, preview);
      return json({ ok: true, ...res });
    }

    // 2. Modalidad Cron (vía cabecera x-backup-cron-token)
    if (!cronToken) {
      return json({ error: "Unauthorized" }, 401);
    }
    const { data: secret } = await db.from("backup_scheduler_secret").select("token_hash").eq("singleton", true).maybeSingle();
    const expectedToken = Deno.env.get("BACKUP_CRON_TOKEN") || "";
    const isCronValid = (secret && await sha256(cronToken) === secret.token_hash) || (expectedToken && cronToken === expectedToken);
    if (!isCronValid) {
      return json({ error: "Cron unauthorized" }, 401);
    }

    const madridHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    if (body?.source === "supabase-cron" && madridHour !== 14) {
      return json({ ok: true, status: "outside_madrid_delivery_window" });
    }

    // Procesar todos los usuarios registrados en Supabase
    const results: Array<{ userId: string; status: string; detail?: string }> = [];
    for (let page = 1; ; page += 1) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return json({ error: "Could not list users: " + error.message }, 500);
      const users = data.users ?? [];
      if (!users.length) break;
      for (const account of users) {
        if (!account.email) continue;
        const { data: sent } = await db.from("monthly_report_runs").select("id").eq("user_id", account.id).eq("report_month", key).eq("status", "completed").maybeSingle();
        if (sent) {
          results.push({ userId: account.id, status: "already_sent" });
          continue;
        }
        try {
          const res = await sendMonthlyReportForUser(db, account.id, account.email, key, start, from, to, previousFrom, false);
          results.push({ userId: account.id, status: res.status });
        } catch (err) {
          const detail = err instanceof Error ? err.message : "Unknown report error";
          await db.from("monthly_report_runs").upsert({
            user_id: account.id,
            report_month: key,
            path: account.id + "/failed-" + key + ".pdf",
            status: "failed",
            error_message: detail
          }, { onConflict: "user_id,report_month" });
          results.push({ userId: account.id, status: "failed", detail });
        }
      }
      if (users.length < 200) break;
    }

    return json({ ok: true, results, month: key });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
