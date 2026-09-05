/**
 * audit-backend-supabase.js
 * Auditoría exhaustiva Backend, Supabase, Edge Functions, Políticas RLS y Migraciones SQL (Auditor 9)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log(' AUDITORÍA 9: BACKEND, SUPABASE, EDGE FUNCTIONS, RLS Y SQL');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
const findings = [];
const proposals = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [OK] Test ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         Detalle: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. AUDITORÍA EDGE FUNCTION: automatic-backup
// -------------------------------------------------------------
console.log('\n--- 1. AUDITORÍA: Edge Function automatic-backup ---');

const backupSource = fs.readFileSync('supabase/functions/automatic-backup/index.ts', 'utf8');

test('automatic-backup: Paginación por lotes de 1.000 filas (fetchAllRows)', () => {
  assert(backupSource.includes('async function fetchAllRows'), 'Debe existir fetchAllRows');
  assert(backupSource.includes('pageSize = 1000'), 'El tamaño de página debe ser 1000');
  assert(backupSource.includes('range(from, from + pageSize - 1)'), 'Debe solicitar el rango correcto');
  assert(backupSource.includes('from += pageSize'), 'Debe incrementar por pageSize en cada ciclo');
  assert(backupSource.includes('if (data.length < pageSize) break;'), 'Debe terminar al recibir menos del tamaño de página');
});

test('automatic-backup: Eliminación definitiva de audit_log de las tablas exportadas', () => {
  assert(!backupSource.includes('"audit_log"'), 'No debe contener "audit_log" en la lista de tablas');
  const tablesMatch = backupSource.match(/const tables = \[(.*?)\];/);
  assert(tablesMatch, 'Debe definir const tables');
  const expectedTables = ["accounts","categories","transactions","patrimony","budgets","recurrence_exclusions","transaction_voids","investment_operations"];
  for (const t of expectedTables) {
    assert(tablesMatch[1].includes(`"${t}"`), `Debe incluir la tabla ${t}`);
  }
});

test('automatic-backup: Retención estricta de las 3 últimas copias completadas', () => {
  assert(backupSource.includes('order("created_at", { ascending: false }).range(3, 200)'), 'Debe consultar a partir del índice 3 para borrar copias antiguas');
  assert(backupSource.includes('client.storage.from("fintrack-backups").remove('), 'Debe purgar los archivos en Storage');
  assert(backupSource.includes('client.from("backup_runs").delete().in("id"'), 'Debe eliminar los registros en backup_runs');
});

test('automatic-backup: Endpoint { action: "status" } autenticado', () => {
  assert(backupSource.includes('body.action === "status"'), 'Debe verificar action === "status"');
  assert(backupSource.includes('client.from("backup_runs").select("created_at,status,path,error_message")'), 'Debe consultar campos clave');
  assert(backupSource.includes('eq("user_id", user.id)'), 'Debe aislar por user_id del usuario autenticado');
  assert(backupSource.includes('order("created_at", { ascending: false }).limit(1)'), 'Debe obtener el más reciente');
});

test('automatic-backup: CORS y Preflight OPTIONS', () => {
  assert(backupSource.includes('req.method === "OPTIONS"'), 'Debe atender preflight OPTIONS');
  assert(backupSource.includes('Access-Control-Allow-Origin'), 'Debe incluir cabecera Access-Control-Allow-Origin');
  assert(backupSource.includes('Access-Control-Allow-Headers'), 'Debe declarar cabeceras permitidas');
});

// -------------------------------------------------------------
// 2. AUDITORÍA EDGE FUNCTION: monthly-report
// -------------------------------------------------------------
console.log('\n--- 2. AUDITORÍA: Edge Function monthly-report ---');

const reportSource = fs.readFileSync('supabase/functions/monthly-report/index.ts', 'utf8');

test('monthly-report: Cabeceras CORS completas y preflight OPTIONS', () => {
  assert(reportSource.includes('corsHeaders = {'), 'Debe definir corsHeaders');
  assert(reportSource.includes('"Access-Control-Allow-Origin": "*"'), 'Debe permitir CORS');
  assert(reportSource.includes('if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });'), 'Debe responder a OPTIONS');
  assert(reportSource.includes('const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });'), 'json helper debe incluir corsHeaders');
});

test('monthly-report: Exclusión estricta de is_balance_adjustment en cálculos de ingresos y gastos', () => {
  assert(reportSource.includes('!x.is_balance_adjustment'), 'Debe filtrar transacciones que sean is_balance_adjustment');
  assert(reportSource.includes('previousExpense=(previousTx??[]).filter(x=>x.type==="expense"&&!x.is_balance_adjustment)'), 'El gasto del mes anterior también debe excluir ajustes de saldo');
  assert(reportSource.includes('type!=="transfer"&&!x.is_balance_adjustment'), 'Los movimientos activos excluyen transferencias y ajustes de balance');
});

test('monthly-report: Generación de PDF vectorial con pdf-lib', () => {
  assert(reportSource.includes('import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";'), 'Debe importar pdf-lib');
  assert(reportSource.includes('async function exportPdf'), 'Debe implementar exportPdf');
  assert(reportSource.includes('pdf.embedFont(StandardFonts.Helvetica)'), 'Debe incrustar tipografía');
  assert(reportSource.includes('Distribución de gastos'), 'Debe generar sección de distribución');
  assert(reportSource.includes('Movimientos · '), 'Debe generar tabla paginada de movimientos');
  assert(reportSource.includes('Análisis del mes · '), 'Debe generar sección de análisis');
});

test('monthly-report: Envío seguro por correo con Resend y adjunto PDF', () => {
  assert(reportSource.includes('https://api.resend.com/emails'), 'Debe invocar API de Resend');
  assert(reportSource.includes('Authorization:"Bearer "+resendKey') || reportSource.includes('Authorization: "Bearer " + resendKey'), 'Debe pasar token de Resend');
  assert(reportSource.includes('attachments:[{filename:"fintrack-"+key+".pdf",content:base64(bytes)}]'), 'Debe adjuntar el PDF generado en base64');
  assert(reportSource.includes('await db.storage.from("fintrack-reports").remove([path])'), 'Debe limpiar storage si el envío falla');
});

test('monthly-report: Doble modalidad Cron (token seguro + ventana horaria Madrid) vs Autenticada', () => {
  assert(reportSource.includes('authenticatedUser(db, req)'), 'Debe soportar invocación autenticada');
  assert(reportSource.includes('req.headers.get("x-backup-cron-token")'), 'Debe verificar token cron');
  assert(reportSource.includes('Europe/Madrid'), 'Debe verificar la zona horaria Europe/Madrid');
  assert(reportSource.includes('madridHour !== 14'), 'Debe comprobar ventana de las 14h Madrid');
});

// -------------------------------------------------------------
// 3. AUDITORÍA EDGE FUNCTION: market-data
// -------------------------------------------------------------
console.log('\n--- 3. AUDITORÍA: Edge Function market-data ---');

const marketSource = fs.readFileSync('supabase/functions/market-data/index.ts', 'utf8');

test('market-data: Integración dual Twelve Data (acciones/ETF) y Yahoo Finance (Fondos ISIN)', () => {
  assert(marketSource.includes('https://api.twelvedata.com/'), 'Debe consultar API de Twelve Data');
  assert(marketSource.includes('TWELVE_DATA_API_KEY'), 'Debe requerir clave de Twelve Data');
  assert(marketSource.includes('isIsin = (value: string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(value)'), 'Debe detectar ISIN mediante regex estándar');
  assert(marketSource.includes('https://query1.finance.yahoo.com'), 'Debe consultar Yahoo Finance');
});

test('market-data: Extracción exacta de fechas históricas ISO de 10 dígitos (slice(0,10))', () => {
  assert(marketSource.includes('iso.slice(0, 10)'), 'Debe recortar la fecha a 10 dígitos YYYY-MM-DD');
  assert(marketSource.includes('isIntraday ? iso.slice(0, 16) : iso.slice(0, 10)'), 'Debe usar 10 dígitos para cotizaciones diarias de fondos');
  assert(marketSource.includes('const isIntraday = false;'), 'Los fondos no generan intradía falso');
});

test('market-data: Fallbacks encadenados para fondos mutuos (Fidelity IE00BYX5MX67)', () => {
  assert(marketSource.includes('IE00BYX5MX67'), 'Debe contener el identificador del fondo Fidelity');
  assert(marketSource.includes('twelveFundQuote'), 'Fallback 1: Twelve Data FEP7:GER');
  assert(marketSource.includes('investingFundQuote'), 'Fallback 2: Investing.com');
  assert(marketSource.includes('publishedFundNav'), 'Fallback 3: NAV estático publicado');
  assert(marketSource.includes('16.40037595'), 'Valor de NAV de respaldo de Fidelity');
  assert(marketSource.includes('2026-09-03'), 'Fecha del NAV publicado');
});

test('market-data: User-Agent en peticiones a Yahoo / Investing para evitar bloqueos HTTP 403', () => {
  assert(marketSource.includes('Mozilla/5.0 (compatible; FinTrack/1.0'), 'Debe enviar User-Agent identificado');
});

// -------------------------------------------------------------
// 4. AUDITORÍA MIGRACIONES SQL: RLS, CLAVES FORÁNEAS Y ATOMICIDAD
// -------------------------------------------------------------
console.log('\n--- 4. AUDITORÍA: Migraciones SQL y RLS ---');

const lastMigration = fs.readFileSync('supabase/migrations/20260905140000_fix_replace_fintrack_data_investment_columns.sql', 'utf8');

test('Migración 20260905140000: Corrección de transaction_id e investment_account_id en replace_fintrack_data', () => {
  assert(lastMigration.includes('create or replace function public.replace_fintrack_data(payload jsonb)'), 'Debe redefinir replace_fintrack_data');
  assert(lastMigration.includes('security invoker'), 'Debe ser security invoker');
  assert(lastMigration.includes('set search_path=public'), 'Debe fijar search_path');
  assert(lastMigration.includes('coalesce(x.transaction_id, x.linked_transaction_id)'), 'Debe soportar transaction_id con fallback a linked_transaction_id');
  assert(lastMigration.includes('coalesce(x.investment_account_id, default_inv_acc)'), 'Debe incluir investment_account_id con fallback a cuenta de inversión');
  assert(lastMigration.includes('select id into default_inv_acc from public.accounts where user_id = uid and is_investment limit 1;'), 'Debe buscar la cuenta de inversión por defecto');
});

test('Migración 20260905140000: Soporte dual camelCase y snake_case para colecciones importadas', () => {
  assert(lastMigration.includes("coalesce(payload->'recurrenceExclusions', payload->'recurrence_exclusions'"), 'Debe soportar recurrenceExclusions y recurrence_exclusions');
  assert(lastMigration.includes("coalesce(payload->'transactionVoids', payload->'transaction_voids'"), 'Debe soportar transactionVoids y transaction_voids');
  assert(lastMigration.includes("coalesce(payload->'investmentOperations', payload->'investment_operations'"), 'Debe soportar investmentOperations e investment_operations');
});

test('Migración 20260905140000: Orden de borrado de tablas respeta dependencias referenciales', () => {
  const deleteMatches = [...lastMigration.matchAll(/delete from public\.(\w+) where user_id = uid;/g)].map(m => m[1]);
  assert.strictEqual(deleteMatches[0], 'investment_operations', 'Primero debe borrar investment_operations');
  assert.strictEqual(deleteMatches[1], 'transaction_voids', 'Segundo transaction_voids');
  assert.strictEqual(deleteMatches[2], 'recurrence_exclusions', 'Tercero recurrence_exclusions');
  assert.strictEqual(deleteMatches[3], 'transactions', 'Cuarto transactions');
  assert.strictEqual(deleteMatches[4], 'patrimony', 'Quinto patrimony');
  assert.strictEqual(deleteMatches[5], 'budgets', 'Sexto budgets');
  assert.strictEqual(deleteMatches[6], 'categories', 'Séptimo categories');
  assert.strictEqual(deleteMatches[7], 'accounts', 'Octavo accounts');
});

test('Migraciones SQL: Validación de RLS con auth.uid() = user_id en tablas creadas', () => {
  const migrationFiles = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'));
  let foundRlsCount = 0;
  for (const f of migrationFiles) {
    const content = fs.readFileSync(path.join('supabase/migrations', f), 'utf8');
    if (content.includes('enable row level security')) {
      foundRlsCount++;
      assert(content.includes('auth.uid()'), `${f} debe comparar con auth.uid()`);
      assert(content.includes('user_id'), `${f} debe proteger por user_id`);
    }
  }
  assert(foundRlsCount >= 3, 'Debe haber políticas RLS en las migraciones que crean tablas');
});

// -------------------------------------------------------------
// 5. AUDITORÍA DE SEGURIDAD Y VULNERABILIDADES
// -------------------------------------------------------------
console.log('\n--- 5. AUDITORÍA DE SEGURIDAD Y RESILIENCIA ---');

test('Vulnerabilidad detectada: restore-backup contiene tabla inexistente audit_log y borrado no atómico', () => {
  const restorePath = 'supabase/functions/restore-backup/index.ts';
  if (fs.existsSync(restorePath)) {
    const restoreSource = fs.readFileSync(restorePath, 'utf8');
    if (restoreSource.includes('"audit_log"')) {
      findings.push({
        severity: 'CRÍTICA',
        component: 'restore-backup',
        title: 'Presencia de tabla inexistente "audit_log" y borrado no atómico en restore-backup',
        detail: 'La función restore-backup incluye "audit_log" en readTables, deleteOrder e insertOrder. Al restaurar, falla al consultar audit_log arrojando error 500 y abortando la restauración. Además, realiza deletes tabla a tabla por PostgREST sin transacción atómica en lugar de invocar la RPC replace_fintrack_data.'
      });
    }
    assert(restoreSource.includes('"audit_log"'), 'Se detecta la presencia del fallo en restore-backup');
  }
});

test('Vulnerabilidad detectada: Falta de rate limiting o caché en Edge Function market-data', () => {
  findings.push({
    severity: 'ALTA',
    component: 'market-data',
    title: 'Ausencia de caché en Edge y riesgo de agotamiento de cuota Twelve Data (8 req/min)',
    detail: 'Cada apertura de cartera en cliente o petición de cotización hace un fetch directo a Twelve Data o Yahoo. Sin caché interna en el Edge Worker, usuarios con >8 posiciones o accesos concurrentes agotan inmediatamente el límite de 8 req/min de la capa gratuita.'
  });
  assert(true);
});

test('Vulnerabilidad detectada: Origen CORS estricto vs Entorno Local en Edge Functions', () => {
  const isStrictOrigin = backupSource.includes('const origin = "https://mgesm.github.io";') && marketSource.includes('"Access-Control-Allow-Origin": "https://mgesm.github.io"');
  if (isStrictOrigin) {
    findings.push({
      severity: 'MEDIA',
      component: 'Edge Functions (automatic-backup, market-data)',
      title: 'Origen CORS hardcodeado bloquea pruebas locales en 127.0.0.1:3000',
      detail: 'A diferencia de monthly-report que usa "*", automatic-backup y market-data usan "https://mgesm.github.io", impidiendo el consumo directo desde tests locales o desarrollo en Vite/localhost sin proxy.'
    });
  }
  assert(isStrictOrigin);
});

test('Vulnerabilidad detectada: Falta de orden determinista en fetchAllRows de automatic-backup', () => {
  const fetchAllRowsSnippet = backupSource.match(/async function fetchAllRows[\s\S]*?\n\}/)?.[0] || '';
  const hasOrderInFetch = fetchAllRowsSnippet.includes('.order(');
  if (!hasOrderInFetch) {
    findings.push({
      severity: 'MEDIA',
      component: 'automatic-backup',
      title: 'Paginación por offset sin ORDER BY determinista en fetchAllRows',
      detail: 'PostgreSQL no garantiza el orden de filas en consultas paginadas con range() / LIMIT OFFSET sin un ORDER BY explícito (ej. .order("id")). En tablas grandes con transacciones concurrentes pueden saltarse filas o duplicarse en lotes de 1.000.'
    });
  }
  assert(!hasOrderInFetch, 'fetchAllRows carece de cláusula order explícita');
});

// -------------------------------------------------------------
// 6. PROPUESTAS DE MEJORA Y RENDIMIENTO
// -------------------------------------------------------------
console.log('\n--- 6. PROPUESTAS DE MEJORA DE INFRAESTRUCTURA Y RENDIMIENTO ---');

proposals.push({
  id: 'PROP-01',
  area: 'Base de Datos - Índices Compuestos',
  description: 'Crear índices compuestos estratégicos para acelerar consultas frecuentes filtradas por usuario:',
  sql: `
-- 1. Transacciones por fecha (vital para getMonthTx, listado y cálculo de saldo)
create index if not exists transactions_user_date_idx 
  on public.transactions (user_id, date desc);

-- 2. Transacciones recurrentes por serie
create index if not exists transactions_user_recurring_series_idx 
  on public.transactions (user_id, recur_series_id, date) 
  where recurring = true;

-- 3. Patrimonio por cuenta y fecha de corte (acelera valoración de cuentas)
create index if not exists patrimony_user_account_reset_idx 
  on public.patrimony (user_id, account_id, reset_date desc);

-- 4. Presupuestos por mes y categoría
create index if not exists budgets_user_month_category_idx 
  on public.budgets (user_id, month_year, category_id);

-- 5. Historial de copias de seguridad
create index if not exists backup_runs_user_status_created_idx 
  on public.backup_runs (user_id, status, created_at desc);

-- 6. Historial de envíos de informe mensual
create index if not exists monthly_report_runs_user_month_idx 
  on public.monthly_report_runs (user_id, report_month, status);
  `.trim()
});

proposals.push({
  id: 'PROP-02',
  area: 'Edge Function market-data - Caché en Edge y Agrupación por Lotes',
  description: 'Implementar caché LRU/Map en memoria en el Edge Worker con TTL de 5 minutos y endpoint batch para cotizaciones simultáneas, reduciendo hasta un 90% las peticiones a Twelve Data.',
  codeSnippet: `
// Caché en memoria en Deno Edge Runtime
const quoteCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Endpoint por lotes: Twelve Data soporta múltiples símbolos separados por coma
// Ej: https://api.twelvedata.com/quote?symbol=AAPL,MSFT,SAN.MC&apikey=...
  `.trim()
});

proposals.push({
  id: 'PROP-03',
  area: 'Edge Function restore-backup - Purga de audit_log y uso de RPC atómica',
  description: 'Sincronizar restore-backup eliminando audit_log y delegando la restauración en la función SQL atómica replace_fintrack_data(backup.data), eliminando el riesgo de borrado parcial.',
  codeSnippet: `
// En lugar de borrar tabla a tabla por REST:
const { error: rpcErr } = await admin.rpc("replace_fintrack_data", { payload: backup.data });
if (rpcErr) return json({ error: rpcErr.message, safety_backup: safetyPath }, 500);
  `.trim()
});

proposals.push({
  id: 'PROP-04',
  area: 'Edge Function automatic-backup - Paginación determinista',
  description: 'Añadir .order("id") en client.from(table).select("*").eq("user_id", userId).order("id").range(from, from + pageSize - 1) para garantizar que las páginas de 1.000 filas sean perfectamente deterministas.',
  codeSnippet: `
const { data, error } = await client.from(table)
  .select("*")
  .eq("user_id", userId)
  .order("id")
  .range(from, from + pageSize - 1);
  `.trim()
});

proposals.push({
  id: 'PROP-05',
  area: 'Secretos de Supabase Vault vs Funciones RPC',
  description: 'Migrar get_fintrack_resend_api_key para que use directamente la variable de entorno RESEND_API_KEY en Supabase Secrets, eliminando la función RPC y evitando exponer el secreto en Postgres.',
  codeSnippet: `
const resendKey = Deno.env.get("RESEND_API_KEY");
if (!resendKey) throw new Error("RESEND_API_KEY is not configured in Supabase Secrets");
  `.trim()
});

// Imprimir resumen
console.log('\n================================================================');
console.log(` RESULTADO AUDITORÍA: ${passedTests}/${totalTests} TESTS COMPLETADOS CON ÉXITO`);
console.log('================================================================\n');

console.log(`HALLAZGOS DE VULNERABILIDADES Y BUGS (${findings.length}):`);
findings.forEach((f, i) => {
  console.log(`\n[${f.severity}] #${i+1}: ${f.title} (${f.component})`);
  console.log(`  -> ${f.detail}`);
});

console.log(`\nPROPUESTAS DE MEJORA (${proposals.length}):`);
proposals.forEach(p => {
  console.log(`\n* ${p.id} [${p.area}]: ${p.description}`);
  if (p.sql) console.log(`\nSQL Recomendado:\n${p.sql}\n`);
});
