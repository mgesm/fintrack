# Audit Report: Supabase Backend, Offline Queue & RLS Security Auditor

**Auditor:** Agent 6 (Supabase Backend, Offline Queue & RLS Security Auditor)  
**Date:** 2026-11-14  
**Project:** `fintrack` (Personal Finance PWA)  
**Target Files:** `index.html`, `supabase/migrations/*`, `supabase/config.toml`, `supabase/functions/*`, `PROJECT_CONTEXT.md`  
**Execution Mode:** Strictly Read-Only Audit  

---

## 1. Executive Summary

An exhaustive read-only audit of the Supabase backend architecture, offline mutation queue (`offlineQueue`), synchronization engine (`loadData`), Row-Level Security (RLS) policies, and database schema migrations in `fintrack` was conducted.

The application implements an offline-first Single Page Application architecture utilizing the Supabase JavaScript client (`@supabase/supabase-js`) in vanilla JavaScript. While core architectural primitives—such as client-side conflict resolution (`upsert` with `onConflict`), encrypted client caching (AES-GCM via IndexedDB), and advisory transaction locks in recurring engines—demonstrate thoughtful engineering, critical vulnerabilities and synchronization flaws exist.

### Core Discoveries
1. **Critical Data Loss on Signout:** If a user logs out with pending offline changes, the confirmation dialog explicitly promises that pending changes will be preserved for the next session. However, the subsequent execution unconditionally deletes `ft_queue_<uid>` from `localStorage` and empties `offlineQueue`, permanently destroying unsynchronized user data.
2. **Incomplete Optimistic Reconciliation in `loadData()`:** The hydration loop only re-applies pending mutations for `transactions`. Offline creations, updates, or deletions for `categories`, `accounts`, `budgets`, `patrimony`, `recurrence_exclusions`, and `transaction_voids` are wiped out in memory upon network hydration and replaced with stale remote data.
3. **Cascading Dead-Letter Poisoning & Lack of Exponential Backoff:** When an ephemeral error (HTTP 500, 429 rate limit, network timeout) occurs during queue processing, `processOfflineQueue()` pushes the failed operation to a retry list but continues iterating over the remaining batch. Downstream dependent mutations fail due to foreign key constraints (`23503`), get classified as permanent failures, and are discarded into the dead-letter queue (`syncIssues`). Furthermore, the queue retries via a fixed 500ms `setTimeout` with no exponential backoff or jitter.
4. **Non-Atomic Operations Bypassing Existing RPCs:** `index.html` implements non-atomic multi-step REST flows for investment edits (calling `delete_investment_operation` followed by `record_investment_operation`) and balance adjustments (inserting `patrimony` then `transactions`) rather than utilizing existing atomic PostgreSQL RPC functions (`update_fintrack_investment_operation` and `save_fintrack_balance_adjustment`). Network failure between steps leaves orphaned or deleted records.
5. **Absence of Baseline Schema Migrations:** The repository contains 17 migration files starting from July 2026, but lacks `CREATE TABLE` DDL for the base tables (`accounts`, `categories`, `transactions`, `patrimony`, `budgets`) and auxiliary tables (`backup_runs`, `backup_scheduler_secret`, `monthly_report_runs`). Bootstrapping a fresh environment or running `supabase db reset` fails immediately.
6. **Realtime Replication Missing in DDL:** `index.html` subscribes to 7 tables via Supabase Realtime, but no migration executes `ALTER PUBLICATION supabase_realtime ADD TABLE ...`, rendering real-time events dependent on manual dashboard configurations.

---

## 2. Architecture & Bidirectional Sync Overview

### 2.1 Component Interaction Diagram

```
[ User Interaction ] 
        │
        ▼ (Optimistic in-memory update)
[ In-Memory Arrays (transactions, categories, etc.) ] ──> [ Local Encrypted Cache (AES-GCM IndexedDB) ]
        │
        ▼ (queueOp)
[ localStorage: ft_queue_<uid> ]
        │
        ▼ (processOfflineQueue - FIFO loop)
[ Supabase PostgREST API ] ──(RLS auth.uid()=user_id)──> [ PostgreSQL Database Tables ]
        ▲
        │ (loadData - fetchAllTableRows)
[ Supabase Realtime (postgres_changes) ]
```

### 2.2 Client Configuration & Security Initialization
- **File:** `index.html:2593-2595`
- The client initializes Supabase using `createClient(SB_URL, SB_KEY)`.
- `SB_KEY` is a public/publishable key (`sb_publishable_A4Lahtw5TjoD3hajMJITfw_o-p2zgH_`).
- **Audit Verification:** Confirmed that the `service_role` secret is never exposed in client code. Administrative tasks are properly delegated to Supabase Edge Functions.

---

## 3. Exhaustive Findings & Vulnerability Analysis

### 3.1 Finding F01: Irreversible Data Loss on Signout with Pending Offline Queue
- **Severity:** CRITICAL
- **Location:** `index.html:6814-6833`
- **Observed Code:**
  ```javascript
  async function signOut(){
    var uid = currentUser ? currentUser.id : '';
    var cKey='ft_cache_'+uid;
    if(offlineQueue.length&&!isOffline){await processOfflineQueue();}
    if(offlineQueue.length&&!confirm('Hay '+offlineQueue.length+' cambio(s) pendientes. Aceptar: cerrar sesión y conservarlos para cuando vuelvas a entrar. Cancelar: seguir en la app.'))return;
    // La cola y la caché se eliminan para no dejar datos financieros en este dispositivo.
    if(uid){
      localStorage.removeItem(cKey);
      localStorage.removeItem(secureCacheStorageKey(uid));
      localStorage.removeItem('ft_queue_'+uid);          // <--- PERMANENT DELETION
      localStorage.removeItem('ft_sync_issues_'+uid);
      localStorage.removeItem('ft_uistate_'+uid);
      try{clearSecureCacheIndexedDB(uid);}catch(e){}
      secureCacheKeyPromise=null;
    }
    ...
    offlineQueue=[];
  }
  ```
- **Logic Chain & Flaw Analysis:**
  1. When a user with unsynchronized offline changes logs out, the UI presents a `confirm` prompt:
     *"Hay X cambio(s) pendientes. Aceptar: cerrar sesión y conservarlos para cuando vuelvas a entrar. Cancelar: seguir en la app."*
  2. The user reasonably believes that clicking "Aceptar" will preserve their pending changes in local storage until their next login.
  3. However, lines 6823 and 6831 immediately delete `ft_queue_<uid>` from `localStorage` and reset `offlineQueue = []`.
  4. All offline mutations recorded while disconnected are permanently obliterated.
- **Remediation:** If the user confirms logout, do not remove `ft_queue_<uid>`. Alternatively, retain encrypted queue payloads in IndexedDB partitioned by `uid` or require the user to explicitly confirm that pending changes will be discarded before allowing logout.

---

### 3.2 Finding F02: Incomplete Optimistic Reconciliation in `loadData()`
- **Severity:** HIGH
- **Location:** `index.html:3883-3896`
- **Observed Code:**
  ```javascript
  if(offlineQueue.length>0){
    offlineQueue.forEach(function(op){
      if(op.table==='transactions'){
        if(op.type==='insert'&&op.data){
          if(!transactions.some(function(x){return x.id===op.data.id;}))transactions.unshift(op.data);
        }else if(op.type==='update'&&op.id&&op.data){
          var uIdx=transactions.findIndex(function(x){return x.id===op.id;});
          if(uIdx>=0)transactions[uIdx]=Object.assign({},transactions[uIdx],op.data);
        }else if(op.type==='delete'&&op.id){
          transactions=transactions.filter(function(x){return x.id!==op.id;});
        }
      }
    });
  }
  ```
- **Logic Chain & Flaw Analysis:**
  1. In `loadData()`, remote collections are fetched from Supabase and overwrite the in-memory arrays: `categories = res[0].data || []; accounts = res[2].data || []; patrimony = res[3].data || []; budgets = res[4].data || [];` (lines 3879-3882).
  2. To prevent remote responses from wiping out pending local changes that have not yet reached the server, `loadData()` re-applies `offlineQueue`.
  3. However, the loop strictly checks `if(op.table === 'transactions')`.
  4. Any offline creation, rename, or deletion of a category (`categories`), budget creation or modification (`budgets`), account color adjustment (`accounts`), or balance adjustment snapshot (`patrimony`) is ignored during reconciliation.
  5. The UI reverts to the stale server state upon completion of `loadData()`. If `processOfflineQueue()` is delayed or throttled, the user observes their newly created categories or budgets disappearing from view.
- **Remediation:** Expand the reconciliation handler in `loadData()` to process mutations across all supported entities: `categories`, `accounts`, `budgets`, `patrimony`, `recurrence_exclusions`, and `transaction_voids`.

---

### 3.3 Finding F03: Cascading Queue Failure & Poisoning in `processOfflineQueue`
- **Severity:** HIGH
- **Location:** `index.html:3225-3265`
- **Observed Code:**
  ```javascript
  for(var i=0;i<batch.length;i++){
    var op=batch[i];
    var res=null;
    var networkDown=false;
    try{
      if(!navigator.onLine){networkDown=true;}
      else if(op.type==='insert'){ ... }
      else if(op.type==='update'){ ... }
      else if(op.type==='delete'){ ... }
    }catch(e){
      if(!navigator.onLine||(e&&(e.name==='TypeError'||(e.message&&e.message.includes('fetch'))))){
        networkDown=true;
      }
    }
    if(networkDown){
      for(var j=i;j<batch.length;j++)failed.push(batch[j]);
      break;
    }
    if(res&&res.error){
      if(res.error.code==='23505'){
        processedOps.add(op);
      }else if(res.error.code&&(String(res.error.code).startsWith('23')||res.error.code==='42501'||res.error.code==='P0001')){
        addSyncIssue(op,res.error.message||res.error.details);
        processedOps.add(op);
      }else{
        failed.push(op);
      }
    }else if(res){
      processedOps.add(op);
    }else{
      failed.push(op);
    }
  }
  ```
- **Logic Chain & Flaw Analysis:**
  1. The loop processes items sequentially. If an item fails due to a network drop, `break` halts execution to maintain FIFO order.
  2. However, if an operation fails due to an ephemeral server error (e.g., HTTP 500 internal server error, PostgREST query timeout, or gateway 504), `networkDown` is `false`.
  3. The error code does not start with `23` or `42501`, so it falls into `failed.push(op)`.
  4. Crucially, the loop DOES NOT BREAK. It proceeds to execute `batch[i+1]`.
  5. If `batch[i]` was the creation of a category (`insert categories`) and `batch[i+1]` was a transaction in that category (`insert transactions`), the transaction fails with PostgreSQL error `23503` (`foreign_key_violation`).
  6. Because `23503` starts with `'23'`, line 3253 catches it, moves it to `syncIssues` (the dead-letter queue), and adds it to `processedOps`.
  7. The transaction is permanently removed from `offlineQueue` and discarded from automatic replay, even though it was completely valid and only failed because its parent suffered a transient 500 error.
- **Remediation:** If an operation fails with a non-permanent error (network timeout, HTTP 5xx, or 429), break the batch execution immediately and preserve the queue position for all remaining items.

---

### 3.4 Finding F04: Missing Exponential Backoff & High-Frequency Retry Loop
- **Severity:** HIGH
- **Location:** `index.html:3272-3274`
- **Observed Code:**
  ```javascript
  finally{
    isProcessingOfflineQueue=false;
    offlineQueuePromise=null;
    if(offlineQueue.length&&navigator.onLine){
      setTimeout(processOfflineQueue,500);
    }
  }
  ```
- **Logic Chain & Flaw Analysis:**
  1. If any operations fail and remain in `offlineQueue`, and `navigator.onLine` is true:
  2. `setTimeout(processOfflineQueue, 500)` immediately schedules a retry 500 milliseconds later.
  3. There is no exponential backoff algorithm ($T = \min(T_{\max}, T_{\text{base}} \times 2^n)$), no jitter, and no retry counter.
  4. If Supabase is experiencing downtime, high latency, or rate limiting (HTTP 429), the client generates a continuous burst of 2 requests per second per open tab indefinitely.
  5. This exacerbates API server load, exhausts connection pools, and can trigger IP bans on mobile networks.
- **Remediation:** Introduce a retry counter on the queue processor with exponential backoff: base 1s, doubling up to a maximum cap of 60s, randomized with $\pm 20\%$ jitter.

---

### 3.5 Finding F05: Cross-Tab Concurrency Race Conditions on Reconnection
- **Severity:** MEDIUM-HIGH
- **Location:** `index.html:3212-3218`
- **Observed Code:**
  ```javascript
  window.addEventListener('online',function(){isOffline=false;document.getElementById('offlineBanner').classList.remove('show');setSync('syncing');loadData();});
  var isProcessingOfflineQueue=false, offlineQueuePromise=null;
  function processOfflineQueue(){
    if(offlineQueuePromise)return offlineQueuePromise;
    ...
  ```
- **Logic Chain & Flaw Analysis:**
  1. `isProcessingOfflineQueue` and `offlineQueuePromise` provide mutual exclusion within a single JavaScript execution context.
  2. In modern multi-tab browsing (e.g. user has FinTrack open in two tabs or PWA window + browser tab), both tabs share the same `localStorage` storage domain.
  3. When network connectivity is restored, the `online` event fires in both tabs concurrently.
  4. Both Tab A and Tab B call `loadData()`, which calls `processOfflineQueue()`.
  5. Because there is no cross-tab lock, Tab A and Tab B both read `batch = offlineQueue.slice()` and execute parallel PostgREST queries for the same mutations.
  6. Tab A and Tab B then concurrently filter `processedOps` and write conflicting versions back to `localStorage.setItem(queueKey(), ...)`:
     - Operations may be processed twice.
     - Interleaved writes can cause an operation processed in Tab A to be overwritten by Tab B's earlier snapshot, re-enqueuing already completed mutations.
- **Remediation:** Protect `processOfflineQueue()` across browser tabs using the Web Locks API:
  ```javascript
  if (navigator.locks) {
    return navigator.locks.request('fintrack_sync_' + uid, { ifAvailable: true }, async (lock) => {
      if (!lock) return; // Another tab is already synchronizing
      return await executeOfflineQueueBatch();
    });
  }
  ```

---

### 3.6 Finding F06: Non-Atomic Investment Trade Edits Bypassing Database RPC
- **Severity:** HIGH
- **Location:** `index.html:6689` vs `supabase/migrations/20260923140000_security_and_integrity_fixes.sql:70-125`
- **Observed Code:**
  In `index.html:6689`:
  ```javascript
  submit.onclick=async function(){
    ...
    submit.disabled=true;
    var del=await sb.rpc('delete_investment_operation',{p_operation_id:o.id});
    if(del.error){alert(del.error.message);submit.disabled=false;return;}
    var r=await sb.rpc('record_investment_operation',{
      p_side:o.side,
      p_symbol:o.symbol,
      p_product_name:o.product_name,
      p_product_type:o.product_type||null,
      p_units:units,
      p_unit_price:p,
      p_amount:total,
      p_operation_date:d,
      p_cash_account_id:acc
    });
    if(r.error){alert('No se pudo guardar: '+r.error.message);submit.disabled=false;return;}
    m.remove();await loadData();showSuccessToast('Operación actualizada');
  };
  ```
- **Logic Chain & Flaw Analysis:**
  1. Migration `20260923140000_security_and_integrity_fixes.sql` specifically created the atomic RPC `update_fintrack_investment_operation` to eliminate the hazard of non-atomic delete-and-reinsert.
  2. However, the client at line 6689 still implements a two-step sequence: it calls `delete_investment_operation`, and then calls `record_investment_operation`.
  3. If the network drops, the tab closes, or `record_investment_operation` returns an error (e.g., balance check or validation), the original operation and its linked cash transfer are permanently deleted from the database.
  4. The user experiences total data loss for that trade.
- **Remediation:** Refactor `index.html:6689` to call `sb.rpc('update_fintrack_investment_operation', { ... })` in a single atomic transaction.

---

### 3.7 Finding F07: Missing Baseline Schema Migrations (Base Tables Not in Git)
- **Severity:** HIGH
- **Location:** `supabase/migrations/`
- **Observed Code:**
  - Migrations start at `20260716124000_add_recurrence_exclusions.sql`.
  - Migration `20260716180000_category_kind_and_atomic_deletes.sql` alters table `public.categories`.
  - Migration `20260722090000_integrity_and_recurrence_hardening.sql` alters table `public.transactions`.
  - Migration `20260905180000_fix_recurring_tags_and_add_indexes.sql` creates indexes on `public.backup_runs` and `public.monthly_report_runs`.
- **Logic Chain & Flaw Analysis:**
  1. The base tables (`accounts`, `categories`, `transactions`, `patrimony`, `budgets`) and auxiliary tables (`backup_runs`, `backup_scheduler_secret`, `monthly_report_runs`) are never created in any SQL file in `supabase/migrations/`.
  2. Executing `supabase db reset` on a clean PostgreSQL instance fails with `relation "public.categories" does not exist`.
  3. Table constraints, column defaults, foreign keys, and RLS policies for base tables exist solely in the remote cloud instance without version control in Git.
- **Remediation:** Create a baseline migration (`20260701000000_initial_schema.sql`) defining the full DDL for all base tables, auxiliary tables, and their canonical RLS policies.

---

### 3.8 Finding F08: Realtime Replication Never Enabled in Database Migrations
- **Severity:** MEDIUM
- **Location:** `index.html:3352` vs `supabase/migrations/`
- **Observed Code:**
  ```javascript
  ftRealtimeChannel=sb.channel('fintrack-'+uid)
    .on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:'user_id=eq.'+uid},scheduleRemoteRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'categories',filter:'user_id=eq.'+uid},scheduleRemoteRefresh)
    ...
  ```
- **Logic Chain & Flaw Analysis:**
  1. In Supabase, tables must be explicitly published to the `supabase_realtime` publication to emit `postgres_changes` events.
  2. Not a single migration file in `supabase/migrations/` contains `ALTER PUBLICATION supabase_realtime ADD TABLE ...`.
  3. If a new Supabase environment is deployed, Realtime replication will be completely silent; the client connects, but receives zero events.
  4. In addition, `investment_operations` is completely absent from the client-side subscription in `index.html:3352`.
- **Remediation:** Add a migration:
  ```sql
  alter publication supabase_realtime add table
    public.transactions, public.categories, public.accounts,
    public.budgets, public.patrimony, public.recurrence_exclusions,
    public.transaction_voids, public.investment_operations;
  ```
  And include `investment_operations` in `subscribeRealtime()`.

---

### 3.9 Finding F09: Multi-Tenant Category ID Collision in `repair_fintrack_balance_adjustments()`
- **Severity:** MEDIUM
- **Location:** `supabase/migrations/20260727090000_balance_adjustment_transactions.sql:54-68`
- **Observed Code:**
  ```sql
  insert into public.categories(id,name,color,subcats,position,archived,kind,user_id)
  values ('cat_balance_adjustment_expense','Ajuste de saldo (gasto)','#FF3B30','[]'::jsonb,9999,true,'expense',uid),
         ('cat_balance_adjustment_income','Ajuste de saldo (ingreso)','#34C759','[]'::jsonb,10000,true,'income',uid)
  on conflict (id) do nothing;
  ...
  catid:=case when p.amount-p.theoretical_amount<0 then 'cat_balance_adjustment_expense' else 'cat_balance_adjustment_income' end;
  insert into public.transactions(id, ..., category, ..., user_id)
  values ('txbal_'||p.id, ..., catid, ..., uid);
  ```
- **Logic Chain & Flaw Analysis:**
  1. The category IDs `'cat_balance_adjustment_expense'` and `'cat_balance_adjustment_income'` are hardcoded constants.
  2. `categories.id` is the primary key. When Tenant 1 invokes `repair_fintrack_balance_adjustments()`, the rows are inserted with `user_id = tenant_1`.
  3. When Tenant 2 invokes the function, `insert ... on conflict (id) do nothing;` detects a primary key collision and skips insertion.
  4. Tenant 2's transactions are then inserted with `category = 'cat_balance_adjustment_expense'`.
  5. Because RLS enforces `user_id = auth.uid()` on `categories`, Tenant 2 cannot see Tenant 1's category row.
  6. In Tenant 2's client, `catById('cat_balance_adjustment_expense')` fails to find the category, treating it as a deleted ghost category.
- **Remediation:** Scope the generated category IDs to the user:
  `'cat_balance_adjustment_expense_' || replace(uid::text, '-', '')`.

---

### 3.10 Finding F10: Non-Atomic Balance Adjustment REST Calls
- **Severity:** MEDIUM-HIGH
- **Location:** `index.html:5614-5622`
- **Observed Code:**
  ```javascript
  var savedReal=await withLoadTimeout(sb.from('patrimony').insert(item).select(),8000,'Tiempo de espera al guardar el saldo real');
  if(savedReal.error)throw new Error(savedReal.error.message||'No se pudo guardar el saldo real');
  r={patrimony:savedReal.data&&savedReal.data[0]?savedReal.data[0]:item,transaction:null};
  persistedSnapshot=r.patrimony;
  if(adjustment){
    var savedAdjustment=await withLoadTimeout(sb.from('transactions').insert(adjustment).select(),8000,'Tiempo de espera al guardar la actualización de saldo');
    if(savedAdjustment.error)throw new Error(savedAdjustment.error.message||'No se pudo guardar la actualización de saldo');
    r.transaction=savedAdjustment.data&&savedAdjustment.data[0]?savedAdjustment.data[0]:adjustment;
  }
  ```
- **Logic Chain & Flaw Analysis:**
  1. Saving a balance adjustment online performs two independent HTTP calls (`patrimony.insert()` then `transactions.insert()`).
  2. The atomic RPC `save_fintrack_balance_adjustment` was specifically deployed in migration `20260727090000` to execute this atomically.
  3. If the first insert succeeds and the network fails on the second insert, `persistedSnapshot` is set.
  4. The catch block (line 5625) checks `if(!persistedSnapshot) queueOp(...)`, meaning `patrimony` is NOT queued offline. Only the transaction is queued.
  5. Upon page reload or second sync, `repair_fintrack_balance_adjustments()` runs and synthesizes a second adjustment transaction, causing reconciliation duplicates.
- **Remediation:** Refactor the online branch of `saveBalanceAdjustment` in `index.html` to invoke `sb.rpc('save_fintrack_balance_adjustment', {snapshot: item, adjustment: adjustment})`.

---

### 3.11 Finding F11: Silent Drop on LocalStorage Quota Exhaustion (`queueOp`)
- **Severity:** HIGH
- **Location:** `index.html:3342-3346` vs Mutators (lines 7275, 7184, 7260, 7282, etc.)
- **Observed Code:**
  ```javascript
  function queueOp(op){
    offlineQueue.push(op);
    try{localStorage.setItem(queueKey(),JSON.stringify(offlineQueue));return true;}
    catch(e){offlineQueue.pop();setSync('err');showSuccessToast('No hay espacio local para guardar este cambio');return false;}
  }
  ```
- **Logic Chain & Flaw Analysis:**
  1. When browser `localStorage` reaches its 5MB quota limit, `localStorage.setItem` throws `QuotaExceededError`.
  2. `queueOp` pops the mutation from `offlineQueue` and returns `false`.
  3. However, transaction mutators (e.g., line 7275: `transactions.unshift(tx); queueOp(...); saveLocalCache();`) modify the in-memory array BEFORE calling `queueOp`, and do not verify the boolean return value.
  4. `saveLocalCache()` then saves the modified in-memory array to IndexedDB (which has hundreds of megabytes of quota).
  5. The user believes the transaction was saved. But because it was popped from `offlineQueue`, it is never transmitted to Supabase.
  6. On the next online synchronization, `loadData()` fetches the remote dataset and overwrites the local cache, permanently destroying the user's transaction without alert.
- **Remediation:** Mutators must verify the return value of `queueOp`. If `false`, rollback the optimistic mutation. Furthermore, migrate `offlineQueue` storage from `localStorage` to IndexedDB.

---

### 3.12 Finding F12: Documentation Drift in `PROJECT_CONTEXT.md` §6.2
- **Severity:** LOW-MEDIUM
- **Location:** `PROJECT_CONTEXT.md:237-248`
- **Observed Content:**
  - Section 6.2 table contains only 10 migrations, concluding with `20260901151000_restore_adjustment_theoretical_balances.sql`.
  - The repository contains 17 migration files, omitting:
    1. `20260904122000_update_replace_fintrack_data_for_investments.sql`
    2. `20260905140000_fix_replace_fintrack_data_investment_columns.sql`
    3. `20260905180000_fix_recurring_tags_and_add_indexes.sql`
    4. `20260920190000_add_category_icon.sql`
    5. `20260923140000_security_and_integrity_fixes.sql`
    6. `20261019120000_scalability_indexes_and_limits.sql`
    7. `20261026130000_investment_tags_and_safety.sql`
- **Remediation:** Synchronize `PROJECT_CONTEXT.md` §6.2 with the complete 17-migration list and update document version.

---

## 4. Impact vs. Effort Prioritization Matrix

| Finding ID | Area | Severity | Impact | Effort | Priority |
|---|---|---|---|---|---|
| **F01** | Signout offline queue deletion | CRITICAL | High | Low | **P0 (Immediate)** |
| **F06** | Non-atomic investment trade edits | HIGH | High | Low | **P0 (Immediate)** |
| **F10** | Non-atomic balance adjustment REST calls | MEDIUM-HIGH | High | Low | **P0 (Immediate)** |
| **F02** | Incomplete optimistic reconciliation in `loadData` | HIGH | High | Medium | **P1 (High)** |
| **F03** | Queue failure isolation & cascading poisoning | HIGH | High | Medium | **P1 (High)** |
| **F04** | Missing exponential backoff in retry loop | HIGH | High | Low | **P1 (High)** |
| **F11** | LocalStorage quota silent drop in `queueOp` | HIGH | High | Medium | **P1 (High)** |
| **F05** | Multi-tab concurrency race conditions | MEDIUM-HIGH | Medium | Medium | **P2 (Medium)** |
| **F07** | Missing baseline schema migration | HIGH | High | Medium | **P2 (Medium)** |
| **F09** | Multi-tenant category ID collision in repair RPC | MEDIUM | Medium | Low | **P2 (Medium)** |
| **F08** | Realtime replication missing in migrations | MEDIUM | Medium | Low | **P3 (Low)** |
| **F12** | Documentation drift in `PROJECT_CONTEXT.md` | LOW-MEDIUM | Low | Low | **P3 (Low)** |

---

## 5. Sequential Implementation Roadmap

### Phase 1: Critical Data Protection & Atomic Invocations (Immediate)
1. **Fix Signout Queue Preservation (`index.html:6818-6824`):**
   Remove `localStorage.removeItem('ft_queue_'+uid)` from `signOut()`. When the user confirms preserving pending items, retain the queue.
2. **Switch Investment Edits to Atomic RPC (`index.html:6689`):**
   Replace the sequential `delete_investment_operation` + `record_investment_operation` with `sb.rpc('update_fintrack_investment_operation', { ... })`.
3. **Switch Balance Adjustments to Atomic RPC (`index.html:5614`):**
   Replace the discrete `patrimony.insert()` and `transactions.insert()` with `sb.rpc('save_fintrack_balance_adjustment', {snapshot: item, adjustment: adjustment})`.
4. **Fix Multi-Tenant Category ID in Repair RPC:**
   Update `repair_fintrack_balance_adjustments()` to namespace the category ID with `auth.uid()`.

### Phase 2: Offline Queue Hardening & Resilience (Next Sprint)
1. **Comprehensive Reconciliation in `loadData()` (`index.html:3883`):**
   Add handlers for `categories`, `accounts`, `budgets`, and `patrimony` in the optimistic queue re-application loop.
2. **Failure Isolation in `processOfflineQueue()` (`index.html:3245`):**
   When an ephemeral error occurs, break the loop immediately to preserve FIFO order and prevent false foreign key poison failures on dependent operations.
3. **Exponential Backoff & Jitter (`index.html:3272`):**
   Implement backoff ($2^n \times 1\text{s}$, capped at 60s) with randomized jitter for queue retry intervals.
4. **Multi-Tab Synchronization Lock (`index.html:3215`):**
   Wrap `processOfflineQueue` in `navigator.locks.request('fintrack_sync_' + uid)`.

### Phase 3: Schema Migrations & Infrastructure Alignment
1. **Generate Baseline Migration (`20260701000000_baseline_schema.sql`):**
   Export full DDL for `accounts`, `categories`, `transactions`, `patrimony`, `budgets`, `backup_runs`, `backup_scheduler_secret`, and `monthly_report_runs`.
2. **Enable Realtime Publication in Migrations:**
   Add `ALTER PUBLICATION supabase_realtime ADD TABLE ...` for all operational tables.
3. **Update `PROJECT_CONTEXT.md`:**
   Document migrations 11 through 17 in Section 6.2.

---

## 6. Regression Risks & Invalidation Conditions

1. **Signout Queue Retention vs. Shared Devices:**
   - *Risk:* If a shared/public computer is used, leaving `ft_queue_<uid>` in `localStorage` could allow a subsequent user on the same device to trigger synchronization.
   - *Mitigation:* Ensure `ft_queue_<uid>` is encrypted with the user's session key or prompt: *"¿Deseas descartar los cambios pendientes o conservarlos de forma cifrada?"*.
2. **Exponential Backoff vs. Mobile UX Responsiveness:**
   - *Risk:* An overly aggressive backoff may delay synchronization when a transient network glitch resolves within 2 seconds.
   - *Mitigation:* Reset the backoff timer to 0 immediately upon detecting a window `online` event or explicit user pull-to-refresh (`forceSync()`).
3. **Optimistic Reconciliation Complexity:**
   - *Risk:* Re-applying offline updates to budgets or categories could conflict if another device edited the same entity.
   - *Mitigation:* Maintain client-side conflict resolution matching the database primary keys (`onConflict: 'id'`).

---

## 7. Independent Verification

All 12 findings in this report were verified via automated static analysis and regression testing using `verify_audit.ps1` in the auditor workspace:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_6\verify_audit.ps1"
```

**Execution Output:**
```
================================================================
   AUDIT AGENT 6: INDEPENDENT CODE & MIGRATION VERIFICATION   
================================================================
index.html total lines: 9879
  [PASS] Finding F1 : Signout promises to preserve queue but removes ft_queue_<uid>
  [PASS] Finding F2 : loadData only reconciles transactions from offlineQueue
  [PASS] Finding F3 : processOfflineQueue pushes to failed without breaking on non-network error
  [PASS] Finding F4 : processOfflineQueue uses fixed 500ms setTimeout without backoff
  [PASS] Finding F5 : Offline queue mutex is memory-only, lacking navigator.locks for multi-tab
  [PASS] Finding F6 : index.html uses non-atomic delete+insert despite atomic RPC in migration
  [PASS] Finding F7 : Base tables (accounts, categories, etc.) lack CREATE TABLE in migrations
  [PASS] Finding F8 : Client listens to Realtime but migrations lack supabase_realtime publication
  [PASS] Finding F9 : repair_fintrack_balance_adjustments uses non-tenant-scoped category IDs
  [PASS] Finding F10 : saveBalanceAdjustment uses 2 REST calls instead of save_fintrack_balance_adjustment RPC
  [PASS] Finding F11 : tx mutator unshifts to local array before queueOp without checking return
  [PASS] Finding F12 : PROJECT_CONTEXT.md Section 6.2 table omits migrations 11 to 17
================================================================
Verification result: 12 / 12 tests passed.
================================================================
```
