import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const USER_ID = "44293831-17db-4832-a690-09945bf6b9a4";
const euro = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("");
const base64 = (bytes: Uint8Array) => { let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); };
const median = (values: number[]) => { const v = values.slice().sort((a,b)=>a-b), m = Math.floor(v.length / 2); return v.length ? (v.length % 2 ? v[m] : (v[m-1]+v[m])/2) : 0; };

async function reportPdf(title: string, income: number, expense: number, prevExpense: number, categories: Array<{name:string;spent:number;budget:number}>, unusual: Array<{note:string;amount:number}>) {
  const pdf = await PDFDocument.create(), normal = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595,842]), y = 790;
  const add = (text: string, size=11, strong=false, green=false) => {
    if (y < 55) { page = pdf.addPage([595,842]); y = 790; }
    page.drawText(text.slice(0,108), { x:45, y, size, font: strong ? bold : normal, color: green ? rgb(0.05,0.48,0.29) : rgb(0.12,0.14,0.18) }); y -= size + 8;
  };
  const heading = (s:string) => { y -= 10; add(s,15,true,true); };
  add("FT. · Informe mensual",24,true,true); add(title,15,true); y -= 8;
  heading("Resumen"); add("Ingresos: " + euro(income)); add("Gastos: " + euro(expense)); add("Balance: " + euro(income-expense),12,true);
  if (prevExpense) { const change=(expense-prevExpense)/prevExpense*100; add("Gasto frente al mes anterior: " + (change>=0?"+":"") + change.toFixed(1) + "%."); }
  heading("Presupuesto"); const over = categories.filter(x=>x.budget>0&&x.spent>x.budget).sort((a,b)=>(b.spent-b.budget)-(a.spent-a.budget));
  if (!over.length) add("No has superado ningún presupuesto de categoría."); else over.forEach(x=>add(x.name + ": " + euro(x.spent) + " de " + euro(x.budget) + "  (+" + euro(x.spent-x.budget) + ")",10));
  heading("Mayor gasto por categorías"); categories.filter(x=>x.spent>0).sort((a,b)=>b.spent-a.spent).slice(0,6).forEach(x=>add(x.name + ": " + euro(x.spent) + (x.budget ? " · presupuesto " + euro(x.budget) : ""),10));
  heading("Movimientos a revisar"); if (!unusual.length) add("No se han detectado gastos excepcionalmente altos."); else unusual.forEach(x=>add((x.note || "Gasto sin descripción") + ": " + euro(x.amount),10));
  y -= 18; add("Generado automáticamente por FinTrack.",8,false);
  return pdf.save();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error:"Method not allowed" },405);
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth:{persistSession:false,autoRefreshToken:false} });
  const supplied = req.headers.get("x-backup-cron-token");
  const { data: secret } = await db.from("backup_scheduler_secret").select("token_hash").eq("singleton",true).maybeSingle();
  if (!secret || !supplied || await sha256(supplied) !== secret.token_hash) return json({error:"Unauthorized"},401);
  const now=new Date(), start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)), end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)), previous=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-2,1));
  const key=start.toISOString().slice(0,7), from=start.toISOString().slice(0,10), to=end.toISOString().slice(0,10), previousFrom=previous.toISOString().slice(0,10);
  const { data: sent }=await db.from("monthly_report_runs").select("id").eq("user_id",USER_ID).eq("report_month",key).eq("status","completed").maybeSingle();
  if (sent) return json({ok:true,status:"already_sent",month:key});
  try {
    const { data: user, error: userError } = await db.auth.admin.getUserById(USER_ID); if (userError || !user.user.email) throw new Error("No destination email configured");
    const [{data: tx,error:txError},{data:voids},{data:cats},{data:budgets},{data:previousTx},{data:resendKey}] = await Promise.all([
      db.from("transactions").select("*").eq("user_id",USER_ID).gte("date",from).lt("date",to),
      db.from("transaction_voids").select("transaction_id").eq("user_id",USER_ID),
      db.from("categories").select("id,name").eq("user_id",USER_ID),
      db.from("budgets").select("category_id,amount").eq("user_id",USER_ID).eq("month_year",key),
      db.from("transactions").select("type,amount").eq("user_id",USER_ID).gte("date",previousFrom).lt("date",from),
      db.rpc("get_fintrack_resend_api_key")
    ]);
    if (txError || !resendKey) throw new Error(txError?.message || "Email sender not configured");
    const voided = new Set((voids??[]).map(x=>x.transaction_id)), active=(tx??[]).filter(x=>!voided.has(x.id)&&x.type!=="transfer"), expensesTx=active.filter(x=>x.type==="expense");
    const income=active.filter(x=>x.type==="income").reduce((s,x)=>s+Number(x.amount),0), expense=expensesTx.reduce((s,x)=>s+Number(x.amount),0), previousExpense=(previousTx??[]).filter(x=>x.type==="expense").reduce((s,x)=>s+Number(x.amount),0);
    const names=new Map((cats??[]).map(x=>[x.id,x.name])), budgetByCategory=new Map((budgets??[]).filter(x=>x.category_id).map(x=>[x.category_id,Number(x.amount)])), totals=new Map<string,number>();
    expensesTx.forEach(x=>totals.set(x.category,(totals.get(x.category)??0)+Number(x.amount)));
    const categories=Array.from(new Set([...totals.keys(),...budgetByCategory.keys()])).map(id=>({name:names.get(id)??"Sin categoría",spent:totals.get(id)??0,budget:budgetByCategory.get(id)??0}));
    const med=median(expensesTx.map(x=>Number(x.amount))), unusual=expensesTx.filter(x=>med>0&&Number(x.amount)>=Math.max(med*2.5,100)).sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,6).map(x=>({note:x.note,amount:Number(x.amount)}));
    const monthTitle=new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric"}).format(start), bytes=await reportPdf(monthTitle,income,expense,previousExpense,categories,unusual), path=USER_ID+"/informe-"+key+".pdf";
    const {error: uploadError}=await db.storage.from("fintrack-reports").upload(path,bytes,{contentType:"application/pdf",upsert:false}); if(uploadError) throw new Error(uploadError.message);
    const email=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json"},body:JSON.stringify({from:"FinTrack <onboarding@resend.dev>",to:[user.user.email],subject:"FinTrack · Informe de "+monthTitle,html:"<p>Ya tienes listo tu informe mensual de <strong>"+monthTitle+"</strong>.</p><p>Adjunto encontrarás el PDF con el cierre y los principales avisos.</p>",attachments:[{filename:"fintrack-"+key+".pdf",content:base64(bytes)}]})});
    if(!email.ok) { await db.storage.from("fintrack-reports").remove([path]); throw new Error("Email service returned "+email.status); }
    const {error: recordError}=await db.from("monthly_report_runs").insert({user_id:USER_ID,report_month:key,path,status:"completed"}); if(recordError) throw new Error(recordError.message);
    return json({ok:true,status:"sent",month:key});
  } catch(error) {
    const detail=error instanceof Error?error.message:"Unknown report error";
    await db.from("monthly_report_runs").upsert({user_id:USER_ID,report_month:key,path:USER_ID+"/failed-"+key+".pdf",status:"failed",error_message:detail},{onConflict:"user_id,report_month"});
    return json({ok:false,error:detail},500);
  }
});
