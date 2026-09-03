import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const origin = "https://mgesm.github.io";
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backup-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const tables = ["accounts","categories","transactions","patrimony","budgets","recurrence_exclusions","transaction_voids","investment_operations","audit_log"];

async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function snapshot(client: any, userId: string, reason: string) {
  const entries = await Promise.all(tables.map(async (table) => {
    const { data, error } = await client.from(table).select("*").eq("user_id", userId);
    if (error) throw new Error(table + ": " + error.message);
    return [table, data ?? []] as const;
  }));
  const now = new Date();
  const path = userId + "/fintrack-" + now.toISOString().replace(/[:.]/g, "-") + ".json";
  const payload = { version: 2, exported_at: now.toISOString(), user_id: userId, reason, data: Object.fromEntries(entries) };
  const { error: uploadError } = await client.storage.from("fintrack-backups").upload(path, JSON.stringify(payload), { contentType: "application/json", upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { error: recordError } = await client.from("backup_runs").insert({ user_id: userId, path, status: "completed" });
  if (recordError) {
    await client.storage.from("fintrack-backups").remove([path]);
    throw new Error(recordError.message);
  }
  const { data: oldRuns } = await client.from("backup_runs").select("id,path").eq("user_id", userId).eq("status", "completed").order("created_at", { ascending: false }).range(3, 200);
  if (oldRuns?.length) {
    await client.storage.from("fintrack-backups").remove(oldRuns.map((run: any) => run.path));
    await client.from("backup_runs").delete().in("id", oldRuns.map((run: any) => run.id));
  }
  return { path, exported_at: now.toISOString() };
}
async function authenticatedUser(client: any, req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await client.auth.getUser(token);
  return error ? null : user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const user = await authenticatedUser(client, req);
  if (user) {
    try {
      const result = await snapshot(client, user.id, body.reason === "before_import" ? "before_import" : "manual");
      return json({ ok: true, backup: result });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "No se pudo crear la copia" }, 500);
    }
  }
  const token = req.headers.get("x-backup-cron-token");
  const { data: secret } = await client.from("backup_scheduler_secret").select("token_hash").eq("singleton", true).maybeSingle();
  if (!secret || !token || await sha256(token) !== secret.token_hash) return json({ error: "Unauthorized" }, 401);
  const results: Array<{ userId: string; status: string; detail?: string }> = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: "Could not list users" }, 500);
    const users = data.users ?? [];
    if (!users.length) break;
    for (const account of users) {
      const { data: latest } = await client.from("backup_runs").select("created_at").eq("user_id", account.id).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest && Date.now() - new Date(latest.created_at).getTime() < 5 * 24 * 60 * 60 * 1000) { results.push({ userId: account.id, status: "skipped" }); continue; }
      try { await snapshot(client, account.id, "automatic"); results.push({ userId: account.id, status: "completed" }); }
      catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown backup error";
        await client.from("backup_runs").insert({ user_id: account.id, path: account.id + "/failed-" + crypto.randomUUID() + ".json", status: "failed", error_message: detail });
        results.push({ userId: account.id, status: "failed", detail });
      }
    }
    if (users.length < 200) break;
  }
  return json({ ok: true, results });
});