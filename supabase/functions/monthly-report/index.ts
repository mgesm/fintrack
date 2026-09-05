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
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("");
const base64 = (bytes: Uint8Array) => { let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); };
const median = (values: number[]) => { const v = values.slice().sort((a,b)=>a-b), m = Math.floor(v.length / 2); return v.length ? (v.length % 2 ? v[m] : (v[m-1]+v[m])/2) : 0; };

async function exportPdf(title: string, income: number, expense: number, balance: number, txs: any[], categories: Array<{name:string;spent:number;budget:number}>, unusual: Array<{note:string;amount:number}>, accounts: any[], patrimony: any[]) {
  const pdf=await PDFDocument.create(), normal=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595,H=842,M=45; let page=pdf.addPage([W,H]), y=H-38;
  const text=(s:string,x:number,size=10,strong=false,color=rgb(.16,.16,.16))=>page.drawText(s.slice(0,100),{x,y,size,font:strong?bold:normal,color});
  const newPage=()=>{page=pdf.addPage([W,H]);y=H-38;};
  const ensure=(height:number)=>{if(y-height<42)newPage();};
  const section=(s:string)=>{ensure(28);y-=10;text(s,M,13,true);y-=18;};
  const money=(v:number)=>euro(v);

  page.drawRectangle({x:0,y:H-86,width:W,height:86,color:rgb(.102,.094,.078)});
  y=H-42;text("fintrack",M,20,true,rgb(1,1,1)); y-=21;text("Informe · "+title,M,11,false,rgb(.85,.84,.81));
  y=H-112; const cards=[["INGRESOS",income,rgb(.88,.96,.93),rgb(.18,.58,.40)],["GASTOS",expense,rgb(.98,.92,.91),rgb(.80,.29,.22)],["BALANCE",balance,rgb(.92,.95,.98),rgb(.17,.43,.69)]];
  cards.forEach((c,i)=>{const x=M+i*169;page.drawRectangle({x,y:y-56,width:158,height:49,color:c[2] as any});page.drawText(c[0] as string,{x:x+11,y:y-20,size:8,font:bold,color:rgb(.42,.42,.42)});page.drawText(((i===2&&Number(c[1])>=0?"+":"")+money(Number(c[1]))),{x:x+11,y:y-41,size:13,font:bold,color:c[3] as any});});
  y-=76; section("Distribución de gastos");
  const max=Math.max(...categories.map(c=>c.spent),1);
  categories.filter(c=>c.spent>0).sort((a,b)=>b.spent-a.spent).slice(0,8).forEach(c=>{ensure(18);text(c.name,M,9);page.drawRectangle({x:M+145,y:y-7,width:210,height:5,color:rgb(.93,.92,.9)});page.drawRectangle({x:M+145,y:y-7,width:210*c.spent/max,height:5,color:rgb(.18,.58,.4)});page.drawText(money(c.spent),{x:W-M,y,size:9,font:bold,color:rgb(.16,.16,.16)});y-=16;});
  section("Cuentas");
  accounts.forEach(a=>{ensure(18);const snapshots=patrimony.filter(p=>p.account_id===a.id).sort((p,q)=>String(q.reset_date||"").localeCompare(String(p.reset_date||"")));const p=snapshots[0];text(a.name||"Cuenta",M,10,true);page.drawText(p?money(Number(p.amount)):"—",{x:W-M-80,y,size:10,font:bold});y-=17;});
  section("Gastos por categoría");
  categories.filter(c=>c.spent>0).sort((a,b)=>b.spent-a.spent).forEach(c=>{ensure(18);text(c.name.slice(0,22),M,9);page.drawRectangle({x:M+145,y:y-7,width:210,height:5,color:rgb(.93,.92,.9)});page.drawRectangle({x:M+145,y:y-7,width:210*c.spent/max,height:5,color:rgb(.18,.58,.4)});page.drawText(money(c.spent)+(c.budget?" / "+money(c.budget):""),{x:W-M-130,y,size:8,font:bold});y-=16;});

  newPage(); text("Movimientos · "+title,M,14,true);y-=20;
  const head=()=>{page.drawRectangle({x:M,y:y-8,width:W-2*M,height:15,color:rgb(.102,.094,.078)});page.drawText("Fecha",{x:M+5,y:y-3,size:8,font:bold,color:rgb(1,1,1)});page.drawText("Categoría",{x:M+68,y:y-3,size:8,font:bold,color:rgb(1,1,1)});page.drawText("Nota",{x:M+185,y:y-3,size:8,font:bold,color:rgb(1,1,1)});page.drawText("Importe",{x:W-M-50,y:y-3,size:8,font:bold,color:rgb(1,1,1)});y-=19;}; head();
  txs.sort((a,b)=>String(b.date).localeCompare(String(a.date))).forEach((t,i)=>{if(y<48){newPage();head();}if(i%2===0)page.drawRectangle({x:M,y:y-8,width:W-2*M,height:15,color:rgb(.97,.96,.95)});text(String(t.date||"").slice(8,10)+"/"+String(t.date||"").slice(5,7),M+5,8);text((t.category_name||"Transferencia").slice(0,20),M+68,8);text((t.note||t.subcategory||"").slice(0,34),M+185,8);page.drawText((t.type==="expense"?"-":t.type==="income"?"+":"")+money(Number(t.amount)),{x:W-M-52,y,size:8,font:bold,color:t.type==="expense"?rgb(.8,.29,.22):t.type==="income"?rgb(.18,.58,.4):rgb(.17,.43,.69)});y-=15;});

  newPage();text("Análisis del mes · "+title,M,15,true,rgb(.05,.48,.29));y-=28;section("Presupuestos superados");
  const over=categories.filter(c=>c.budget>0&&c.spent>c.budget).sort((a,b)=>(b.spent-b.budget)-(a.spent-a.budget)); if(!over.length)text("No has superado ningún presupuesto.",M,10);else over.forEach(c=>{ensure(18);text(c.name+": "+money(c.spent)+" de "+money(c.budget)+"  (+"+money(c.spent-c.budget)+")",M,10);y-=17;});
  section("Gastos extraordinarios");if(!unusual.length)text("No se han detectado gastos excepcionalmente altos.",M,10);else unusual.forEach(x=>{ensure(18);text((x.note||"Gasto sin descripción")+": "+money(x.amount),M,10);y-=17;});
  section("Lectura rápida");text("El balance del mes ha sido "+money(balance)+".",M,10);y-=17;text("Tus categorías de mayor gasto se detallan en la página anterior.",M,10);
  return pdf.save();
}

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
  const voided = new Set((voids??[]).map(x=>x.transaction_id)), active=(tx??[]).filter(x=>!voided.has(x.id)&&x.type!=="transfer"&&!x.is_balance_adjustment), expensesTx=active.filter(x=>x.type==="expense");
  const income=active.filter(x=>x.type==="income").reduce((s,x)=>s+Number(x.amount),0), expense=expensesTx.reduce((s,x)=>s+Number(x.amount),0), previousExpense=(previousTx??[]).filter(x=>x.type==="expense"&&!x.is_balance_adjustment).reduce((s,x)=>s+Number(x.amount),0);
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
