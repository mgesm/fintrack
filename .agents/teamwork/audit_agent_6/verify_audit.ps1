# verify_audit.ps1 — Independent Verification Script for Audit Agent 6
# Validates code references, line numbers, and architectural invariants

$ErrorActionPreference = "Stop"
$root = "C:\Users\migue\.gemini\antigravity\scratch\fintrack"
$indexFile = Join-Path $root "index.html"
$migrationsDir = Join-Path $root "supabase\migrations"
$functionsDir = Join-Path $root "supabase\functions"
$contextFile = Join-Path $root "PROJECT_CONTEXT.md"

$indexContent = Get-Content $indexFile
$totalLines = $indexContent.Length

Write-Host "================================================================"
Write-Host "   AUDIT AGENT 6: INDEPENDENT CODE & MIGRATION VERIFICATION   "
Write-Host "================================================================"
Write-Host "index.html total lines: $totalLines"

$findingsChecked = 0
$findingsPassed = 0

function Check-Finding($id, $desc, $cond) {
    $global:findingsChecked++
    if ($cond) {
        $global:findingsPassed++
        Write-Host "  [PASS] Finding $id : $desc"
    } else {
        Write-Host "  [FAIL] Finding $id : $desc"
    }
}

# Finding 1: Signout offline queue deletion
$signoutDialog = $indexContent[6817] -match "Hay '\+offlineQueue\.length\+' cambio\(s\) pendientes\. Aceptar: cerrar sesión y conservarlos"
$signoutRemove = $indexContent[6822] -match "localStorage\.removeItem\('ft_queue_'\+uid\)"
Check-Finding "F1" "Signout promises to preserve queue but removes ft_queue_<uid>" ($signoutDialog -and $signoutRemove)

# Finding 2: Incomplete reconciliation in loadData
$reconcileTxOnly = ($indexContent[3884] -match "if\(op\.table==='transactions'\)") -and -not ($indexContent[3883..3895] -match "op\.table==='categories'")
Check-Finding "F2" "loadData only reconciles transactions from offlineQueue" $reconcileTxOnly

# Finding 3: processOfflineQueue does not break on 500 error
$hasBreakOnNetwork = $indexContent[3244..3249] -match "break;"
$failedPushWithoutBreak = $indexContent[3256] -match "failed\.push\(op\);"
Check-Finding "F3" "processOfflineQueue pushes to failed without breaking on non-network error" ($hasBreakOnNetwork -and $failedPushWithoutBreak)

# Finding 4: Fixed 500ms retry without exponential backoff
$fixedTimeout = $indexContent[3272] -match "setTimeout\(processOfflineQueue,500\)"
Check-Finding "F4" "processOfflineQueue uses fixed 500ms setTimeout without backoff" $fixedTimeout

# Finding 5: Single-tab mutex lacks Web Locks
$hasLocalMutex = $indexContent[3213] -match "var isProcessingOfflineQueue=false, offlineQueuePromise=null;"
$lacksWebLocks = -not ($indexContent[3214..3275] -match "navigator\.locks")
Check-Finding "F5" "Offline queue mutex is memory-only, lacking navigator.locks for multi-tab" ($hasLocalMutex -and $lacksWebLocks)

# Finding 6: Frontend bypasses atomic update_fintrack_investment_operation
$deleteThenInsert = ($indexContent[6688] -match "delete_investment_operation") -and ($indexContent[6688] -match "record_investment_operation")
$migrationHasAtomic = (Get-Content (Join-Path $migrationsDir "20260923140000_security_and_integrity_fixes.sql")) -match "create or replace function public\.update_fintrack_investment_operation"
Check-Finding "F6" "index.html uses non-atomic delete+insert despite atomic RPC in migration" ($deleteThenInsert -and $migrationHasAtomic)

# Finding 7: Base tables missing from migrations
$migrationFiles = Get-ChildItem $migrationsDir -Filter "*.sql"
$createAccounts = $migrationFiles | ForEach-Object { Get-Content $_.FullName } | Select-String "create table.*public\.accounts\b"
Check-Finding "F7" "Base tables (accounts, categories, etc.) lack CREATE TABLE in migrations" ($createAccounts.Count -eq 0)

# Finding 8: Realtime publication missing from migrations
$realtimePub = $migrationFiles | ForEach-Object { Get-Content $_.FullName } | Select-String "supabase_realtime"
$clientListens = $indexContent[3351] -match "postgres_changes"
Check-Finding "F8" "Client listens to Realtime but migrations lack supabase_realtime publication" (($realtimePub.Count -eq 0) -and $clientListens)

# Finding 9: repair_fintrack_balance_adjustments hardcoded category IDs
$repairMigration = Get-Content (Join-Path $migrationsDir "20260727090000_balance_adjustment_transactions.sql")
$hasHardcodedCat = $repairMigration -match "'cat_balance_adjustment_expense'"
Check-Finding "F9" "repair_fintrack_balance_adjustments uses non-tenant-scoped category IDs" ($hasHardcodedCat.Length -gt 0)

# Finding 10: saveBalanceAdjustment non-atomic REST queries
$patInsert = $indexContent[5613] -match "sb\.from\('patrimony'\)\.insert"
$txInsert = $indexContent[5618] -match "sb\.from\('transactions'\)\.insert"
Check-Finding "F10" "saveBalanceAdjustment uses 2 REST calls instead of save_fintrack_balance_adjustment RPC" ($patInsert -and $txInsert)

# Finding 11: queueOp returns false on QuotaExceeded but mutator ignores it
$queueOpPop = $indexContent[3344] -match "offlineQueue\.pop\(\)"
$txUnshiftBeforeQueue = $indexContent[7274] -match "transactions\.unshift\(tx\);queueOp\(\{type:'insert'"
Check-Finding "F11" "tx mutator unshifts to local array before queueOp without checking return" ($queueOpPop -and $txUnshiftBeforeQueue)

# Finding 12: Documentation drift in PROJECT_CONTEXT.md §6.2 table
$sec62Lines = (Get-Content $contextFile)[235..250]
$sec62HasLast10 = ($sec62Lines | Select-String "20260901151000_restore_adjustment_theoretical_balances\.sql").Count -ge 1
$sec62Has11to17 = ($sec62Lines | Select-String "20260904122000|20260905140000|20261026130000").Count -gt 0
Check-Finding "F12" "PROJECT_CONTEXT.md Section 6.2 table omits migrations 11 to 17" ($sec62HasLast10 -and -not $sec62Has11to17)

Write-Host "================================================================"
Write-Host "Verification result: $findingsPassed / $findingsChecked tests passed."
Write-Host "================================================================"
