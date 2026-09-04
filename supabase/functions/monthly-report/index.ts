import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

async function authenticatedUser(client: any, req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await client.auth.getUser(token);
  return error ? null : user;
}

async function sendMonthlyReportForUser(db: any, targetUserId: string, targetEmail: string, key: string, start: Date, from: string, to: string, previousFrom: string, preview: boolean) {
  const [{data: tx,error:txError},{data:voids},{data:cats},{data:budgets},{data:previousTx},{data:accountRows},{data:patrimonyRows},{data:resendKey}] = await Promise.all([
    db.from("transactions").select("*").eq("user_id",targetUserId).gte("date",from).lt("date",to),
    db.from("transaction_voids").select("transaction_id").eq("user_id",targetUserId),
    db.from("categories").select("id,name").eq("user_id",targetUserId),
    db.from("budgets").select("category_id,amount").eq("user_id",targetUserId).eq("month_year",key),
    db.from("transactions").select("type,amount").eq("user_id",targetUserId).gte("date",previousFrom).lt("date",from),
    db.from("accounts").select("*").eq("user_id",targetUserId),
    db.from("patrimony").select("*").eq("user_id",targetUserId),
    db.rpc("get_fintrack_resend_api_key")
  ]);
  if (txError || !resendKey) throw new Error(txError?.message || "Email sender not configured");
  const voided = new Set((voids??[]).map(x=>x.transaction_id)), active=(tx??[]).filter(x=>!voided.has(x.id)&&x.type!=="transfer"), expensesTx=active.filter(x=>x.type==="expense");
  const income=active.filter(x=>x.type==="income").reduce((s,x)=>s+Number(x.amount),0), expense=expensesTx.reduce((s,x)=>s+Number(x.amount),0), previousExpense=(previousTx??[]).filter(x=>x.type==="expense").reduce((s,x)=>s+Number(x.amount),0);
  const names=new Map((cats??[]).map(x=>[x.id,x.name])), budgetByCategory=new Map((budgets??[]).filter(x=>x.category_id).map(x=>[x.category_id,Number(x.amount)])), totals=new Map<string,number>();
  expensesTx.forEach(x=>totals.set(x.category,(totals.get(x.category)??0)+Number(x.amount)));
  const categories=Array.from(new Set([...totals.keys(),...budgetByCategory.keys()])).map(id=>({name:names.get(id)??"Sin categoría",spent:totals.get(id)??0,budget:budgetByCategory.get(id)??0}));
  const med=median(expensesTx.map(x=>Number(x.amount))), unusual=expensesTx.filter(x=>med>0&&Number(x.amount)>=Math.max(med*2.5,100)).sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,6).map(x=>({note:x.note,amount:Number(x.amount)}));
  const namedTransactions=active.map(x=>({...x,category_name:names.get(x.category)??"Sin categoría"}));
  const monthTitle=new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric"}).format(start), bytes=await exportPdf(monthTitle,income,expense,income-expense,namedTransactions,categories,unusual,accountRows??[],patrimonyRows??[]), path=targetUserId+"/"+(preview ? "vista-previa-"+key+"-"+Date.now() : "informe-"+key)+".pdf";
  const {error: uploadError}=await db.storage.from("fintrack-reports").upload(path,bytes,{contentType:"application/pdf",upsert:false}); if(uploadError) throw new Error(uploadError.message);
  const email=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json"},body:JSON.stringify({from:"FinTrack <onboarding@resend.dev>",to:[targetEmail],subject:(preview ? "Vista previa · " : "FinTrack · Informe de ")+monthTitle,html:"<p>"+(preview ? "Esta es una vista previa" : "Ya tienes listo tu informe mensual")+" de <strong>"+monthTitle+"</strong>.</p><p>Adjunto encontrarás el PDF con el cierre y los principales avisos.</p>",attachments:[{filename:"fintrack-"+key+".pdf",content:base64(bytes)}]})});
  if(!email.ok) { await db.storage.from("fintrack-reports").remove([path]); throw new Error("Email service returned "+email.status); }
  if (!preview) { const {error: recordError}=await db.from("monthly_report_runs").insert({user_id:targetUserId,report_month:key,path,status:"completed"}); if(recordError) throw new Error(recordError.message); }
  return { status: preview ? "preview_sent" : "sent", month: key };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error:"Method not allowed" },405);
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth:{persistSession:false,autoRefreshToken:false} });
  const body = await req.json().catch(() => ({}));
  const preview = body?.preview === true && typeof body?.month === "string" && /^\d{4}-\d{2}$/.test(body.month);
  const now=new Date(), requested=preview ? new Date(Date.UTC(Number(body.month.slice(0,4)),Number(body.month.slice(5,7))-1,1)) : new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)), start=requested, end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1)), previous=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()-1,1));
  const key=start.toISOString().slice(0,7), from=start.toISOString().slice(0,10), to=end.toISOString().slice(0,10), previousFrom=previous.toISOString().slice(0,10);

  // 1. Invocación autenticada por usuario (vista previa o reporte solicitado desde la app)
  const authUser = await authenticatedUser(db, req);
  if (authUser) {
    if (!authUser.email) return json({ error: "No destination email configured" }, 400);
    const { data: sent } = await db.from("monthly_report_runs").select("id").eq("user_id", authUser.id).eq("report_month", key).eq("status", "completed").maybeSingle();
    if (!preview && sent) return json({ ok: true, status: "already_sent", month: key });
    try {
      const result = await sendMonthlyReportForUser(db, authUser.id, authUser.email, key, start, from, to, previousFrom, preview);
      return json({ ok: true, ...result });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown report error";
      if (!preview) await db.from("monthly_report_runs").upsert({ user_id: authUser.id, report_month: key, path: authUser.id + "/failed-" + key + ".pdf", status: "failed", error_message: detail }, { onConflict: "user_id,report_month" });
      return json({ ok: false, error: detail }, 500);
    }
  }

  // 2. Invocación programada por cron mediante secret token
  const supplied = req.headers.get("x-backup-cron-token");
  const { data: secret } = await db.from("backup_scheduler_secret").select("token_hash").eq("singleton",true).maybeSingle();
  if (!secret || !supplied || await sha256(supplied) !== secret.token_hash) return json({error:"Unauthorized"},401);

  const madridHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  if (body?.source === "supabase-cron" && madridHour !== 14) return json({ ok: true, status: "outside_madrid_delivery_window" });

  const results: Array<{ userId: string; status: string; detail?: string }> = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: "Could not list users" }, 500);
    const users = data.users ?? [];
    if (!users.length) break;
    for (const account of users) {
      if (!account.email) continue;
      const { data: sent } = await db.from("monthly_report_runs").select("id").eq("user_id", account.id).eq("report_month", key).eq("status", "completed").maybeSingle();
      if (!preview && sent) { results.push({ userId: account.id, status: "already_sent" }); continue; }
      try {
        await sendMonthlyReportForUser(db, account.id, account.email, key, start, from, to, previousFrom, false);
        results.push({ userId: account.id, status: "completed" });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown report error";
        await db.from("monthly_report_runs").upsert({ user_id: account.id, report_month: key, path: account.id + "/failed-" + key + ".pdf", status: "failed", error_message: detail }, { onConflict: "user_id,report_month" });
        results.push({ userId: account.id, status: "failed", detail });
      }
    }
    if (users.length < 200) break;
  }
  return json({ ok: true, results, month: key });
});
