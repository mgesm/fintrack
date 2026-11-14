# Handoff Report: Audit Agent 6 (Supabase Backend, Offline Queue & RLS Security)

## 1. Observation
- **O1 (Signout Deletion of Offline Queue):** In `index.html:6818-6824`, `signOut()` executes:
  ```javascript
  if(offlineQueue.length&&!confirm('Hay '+offlineQueue.length+' cambio(s) pendientes. Aceptar: cerrar sesión y conservarlos para cuando vuelvas a entrar. Cancelar: seguir en la app.'))return;
  if(uid){
    localStorage.removeItem(cKey);
    localStorage.removeItem(secureCacheStorageKey(uid));
    localStorage.removeItem('ft_queue_'+uid);
    ...
  }
  offlineQueue=[];
  ```
  The user is promised pending changes will be kept, but `localStorage.removeItem('ft_queue_'+uid)` wipes them out.
- **O2 (Incomplete Reconciliation in `loadData`):** In `index.html:3883-3896`, `loadData()` only applies `offlineQueue` items if `op.table === 'transactions'`. Pending offline mutations for `categories`, `accounts`, `budgets`, `patrimony`, `recurrence_exclusions`, and `transaction_voids` are ignored and overwritten by stale remote arrays.
- **O3 (Failure Cascades in `processOfflineQueue`):** In `index.html:3245-3258`, when an ephemeral non-network error occurs (e.g. 500 error or query timeout), `failed.push(op)` is executed without breaking the loop. Subsequent dependent mutations fail with `23503` (foreign key violation), are caught by line 3253 (`String(res.error.code).startsWith('23')`), and are dropped into `syncIssues` (dead-letter queue) and removed from `offlineQueue`.
- **O4 (Fixed 500ms Retry Loop):** In `index.html:3272-3274`, `finally { if(offlineQueue.length&&navigator.onLine){ setTimeout(processOfflineQueue,500); } }`. There is no exponential backoff or jitter.
- **O5 (Cross-Tab Concurrency):** In `index.html:3214-3218`, the queue mutex (`offlineQueuePromise`, `isProcessingOfflineQueue`) is memory-only and lacks `navigator.locks`, allowing multiple tabs to replay the same `offlineQueue` simultaneously on reconnect.
- **O6 (Non-Atomic Investment Trade Edits):** In `index.html:6689`, the edit handler calls `sb.rpc('delete_investment_operation', {p_operation_id: o.id})` followed by `sb.rpc('record_investment_operation', { ... })`, completely bypassing the atomic RPC `update_fintrack_investment_operation` authored in `supabase/migrations/20260923140000_security_and_integrity_fixes.sql:70-125`.
- **O7 (Missing Base Table DDL in Migrations):** The 17 SQL files in `supabase/migrations/` contain no `CREATE TABLE` statements for `accounts`, `categories`, `transactions`, `patrimony`, `budgets`, `backup_runs`, `backup_scheduler_secret`, or `monthly_report_runs`. Running `supabase db reset` fails with `relation "public.categories" does not exist`.
- **O8 (Missing Realtime Publication DDL):** In `index.html:3352`, the client listens to `postgres_changes` across 7 tables, but no migration in `supabase/migrations/` executes `ALTER PUBLICATION supabase_realtime ADD TABLE ...`.
- **O9 (Non-Tenant Category IDs in Repair RPC):** In `supabase/migrations/20260727090000_balance_adjustment_transactions.sql:54-56`, `repair_fintrack_balance_adjustments()` hardcodes `'cat_balance_adjustment_expense'` and `'cat_balance_adjustment_income'` on conflict do nothing, causing multi-tenant primary key collisions.
- **O10 (Non-Atomic Balance Adjustment REST Calls):** In `index.html:5614-5622`, saving an adjustment online performs separate REST calls for `patrimony` and `transactions` instead of using `sb.rpc('save_fintrack_balance_adjustment')`.
- **O11 (Silent Mutation Drop on Quota Exhaustion):** In `index.html:3342-3346` vs lines 7275, 7184, 7260, mutators mutate in-memory arrays before calling `queueOp()` without checking its boolean return value.
- **O12 (Documentation Drift):** In `PROJECT_CONTEXT.md:237-248`, Section 6.2 lists only 10 migrations, omitting the 7 migrations between `20260904122000` and `20261026130000`.

## 2. Logic Chain
1. *From O1:* The confirmation prompt leads the user to believe their offline data is safe upon logout. Because `localStorage.removeItem('ft_queue_'+uid)` is executed regardless of the user's choice, user data is irrecoverably lost upon logout when offline mutations are pending.
2. *From O2:* When a client reconnects, `loadData()` fetches the current database state and re-applies `offlineQueue`. Because the re-application only filters for `transactions`, any pending edits or creations of categories, budgets, or accounts are overwritten in memory, causing UI flicker or disappearing elements.
3. *From O3 & O4:* When Supabase has a transient glitch or rate limits a request, continuing the batch causes child operations to fail with foreign key errors, incorrectly moving them to the dead-letter queue. Meanwhile, the 500ms fixed timer hammers the failing endpoint twice every second.
4. *From O6 & O10:* In both investment trade edits and balance adjustments, atomic PostgreSQL RPCs were already written and deployed to avoid multi-step inconsistency. The frontend's continued use of sequential REST calls exposes users to data loss or orphaned ledger entries if connectivity drops mid-sequence.
5. *From O7 & O8:* Database schema files in Git must allow full reconstruction of the system. Without DDL for the base tables and Realtime publications, clean environments cannot be deployed and real-time synchronization will silently fail.

## 3. Caveats
- No direct source code changes were made during this audit in compliance with the read-only mandate.
- Production Supabase database internals (`sswktibdpxqrumsqsegi`) were inspected via local repository migrations and context documentation; live database catalog queries were not executed directly against production.

## 4. Conclusion
The backend integration and offline architecture in `fintrack` has a solid foundation (AES-GCM encryption, subquery-cached RLS policies, idempotency target resolution), but contains two critical data-loss flaws (signout queue deletion and non-atomic investment edits) and four high-priority synchronization vulnerabilities (incomplete `loadData` reconciliation, cascading dead-letter poisoning, fixed 500ms retry storms, and unverified `queueOp` returns). All findings are actionable, localized, and prioritized into a 3-phase remediation plan.

## 5. Verification Method
Independently verify all findings by executing the automated test suite in this workspace:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_6\verify_audit.ps1"
```
**Expected Outcome:** 12 / 12 tests PASS.

**Key Files to Inspect:**
- `index.html` lines 3225-3275, 3883-3896, 5614-5622, 6689, 6814-6833, 7275.
- `supabase/migrations/20260727090000_balance_adjustment_transactions.sql` lines 54-56.
- `supabase/migrations/20260923140000_security_and_integrity_fixes.sql` lines 70-125.
- `PROJECT_CONTEXT.md` lines 236-248.
