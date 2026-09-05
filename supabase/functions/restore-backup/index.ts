import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://mgesm.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const readTables = ["accounts","categories","transactions","patrimony","budgets","recurrence_exclusions","transaction_voids","investment_operations"];
const deleteOrder = ["investment_operations","transaction_voids","recurrence_exclusions","budgets","patrimony","transactions","categories","accounts"];
const insertOrder = ["accounts","categories","transactions","patrimony","budgets","recurrence_exclusions","transaction_voids","investment_operations"];

function counts(data: Record<string, unknown[]>) {
  return Object.fromEntries(readTables.filter((table) => table !== "audit_log").map((table) => [table, Array.isArray(data?.[table]) ? data[table].length : 0]));
}
async function snapshot(client: any, userId: string) {
  const entries = await Promise.all(readTables.map(async (table) => {
    const { data, error } = await client.from(table).select("*").eq("user_id", userId);
    if (error) throw new Error(table + ": " + error.message);
    return [table, data ?? []] as const;
  }));
  const now = new Date(), path = userId + "/fintrack-before-restore-" + now.toISOString().replace(/[:.]/g, "-") + ".json";
  const payload = { version: 2, exported_at: now.toISOString(), user_id: userId, reason: "before_restore", data: Object.fromEntries(entries) };
  const { error: uploadError } = await client.storage.from("fintrack-backups").upload(path, JSON.stringify(payload), { contentType: "application/json", upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { error: recordError } = await client.from("backup_runs").insert({ user_id: userId, path, status: "completed" });
  if (recordError) throw new Error(recordError.message);
  const { data: oldRuns } = await client.from("backup_runs").select("id,path").eq("user_id", userId).eq("status", "completed").order("created_at", { ascending: false }).range(3, 200);
  if (oldRuns?.length) { await client.storage.from("fintrack-backups").remove(oldRuns.map((run: any) => run.path)); await client.from("backup_runs").delete().in("id", oldRuns.map((run: any) => run.id)); }
  return path;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL") ?? "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  let body: any = {}; try { body = await req.json(); } catch (_) {}
  const { data: run } = await admin.from("backup_runs").select("path,created_at").eq("user_id", user.id).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return json({ error: "No hay copias disponibles" }, 404);
  const { data: file, error: fileError } = await admin.storage.from("fintrack-backups").download(run.path);
  if (fileError || !file) return json({ error: "No se pudo leer la copia" }, 500);
  let backup: any; try { backup = JSON.parse(await file.text()); } catch (_) { return json({ error: "La copia no contiene JSON válido" }, 422); }
  if (backup.user_id !== user.id || !backup.data || typeof backup.data !== "object") return json({ error: "Copia no válida" }, 403);
  const summary = { created_at: run.created_at, counts: counts(backup.data) };
  if (body.action === "preview") return json({ ok: true, preview: summary });
  let safetyPath: string;
  try { safetyPath = await snapshot(admin, user.id); } catch (error) { return json({ error: "No se pudo crear la copia previa: " + (error instanceof Error ? error.message : "error") }, 500); }
  const userClient = createClient(url, key, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
  const { error: rpcError } = await userClient.rpc("replace_fintrack_data", { payload: backup.data });
  if (rpcError) {
    for (const table of deleteOrder) { const { error: delError } = await admin.from(table).delete().eq("user_id", user.id); if (delError) return json({ error: table + ": " + delError.message, safety_backup: safetyPath }, 500); }
    for (const table of insertOrder) {
      const rows = backup.data?.[table] || [];
      if (rows.length) { const { error: insertError } = await admin.from(table).insert(rows); if (insertError) return json({ error: table + ": " + insertError.message, safety_backup: safetyPath }, 500); }
    }
  }
  return json({ ok: true, restored: summary, safety_backup: safetyPath });
});