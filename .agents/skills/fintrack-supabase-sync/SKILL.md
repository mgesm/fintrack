---
name: fintrack-supabase-sync
description: >-
  Audits Supabase backend integrations, offline queue synchronization, schema migrations,
  and RLS security policies in fintrack. Use when modifying database queries, offline queues,
  processOfflineQueue, local caching, Edge Functions, or Supabase migration scripts.
---

# fintrack — Supabase Backend & Offline Sync Engine

This skill governs all database interactions, multi-tenant security, and offline data synchronization in **fintrack**.

## 1. Backend Security & Client Architecture

### 1.1 Public Anon Key Only
- The client in [`index.html`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/index.html) initializes `supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`.
- **Absolute prohibition:** The `service_role` secret key must **NEVER** be committed or exposed to the client.

### 1.2 Multi-Tenant Data Isolation (Row Level Security - RLS)
- Every table in PostgreSQL must have Row Level Security enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
- All queries and mutations must explicitly filter by `user_id = auth.uid()`.
- Client requests must always include the active `user.id` on inserted records to prevent RLS insert rejections.

---

## 2. Offline-First Architecture & `processOfflineQueue`

fintrack works completely offline and synchronizes mutations when connectivity is restored.

### 2.1 The Mutation Queue (`offlineQueue`)
- When the device is offline or a request fails due to network interruption:
  1. The mutation is applied optimistically to local in-memory arrays (`transactions`, `accounts`, etc.).
  2. Local state is serialized into `localStorage`.
  3. The exact payload and operation (`INSERT`, `UPDATE`, `DELETE`) are appended to `offlineQueue` in `localStorage`.
  4. The UI immediately reflects the change.

### 2.2 Replay & Idempotency Rules
- When the browser fires the `online` event or the user triggers a sync:
  - `processOfflineQueue()` processes items in FIFO order.
  - **Idempotency:** Every transaction or record created offline must have a pre-generated client-side UUID (`crypto.randomUUID()`).
  - Insertion queries must use `.upsert()` with `onConflict: 'id'` to avoid duplicate rows if the same offline batch is submitted twice.
- If an item fails due to a schema or validation error (not network), it must be logged and handled gracefully rather than blocking the rest of the queue indefinitely.

### 2.3 Cache Invalidation & `loadData()`
- Once the offline queue has flushed, `loadData()` fetches the remote state and merges it with local memory.
- UI elements re-render cleanly without page reloads.

---

## 3. Database Migrations & Edge Functions

- All database schema modifications belong in [`supabase/migrations/`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/supabase/migrations/).
- Never alter table structures directly in production without a corresponding timestamped migration file (e.g. `YYYYMMDDHHMMSS_description.sql`).
- Edge Functions reside in [`supabase/functions/`](file:///C:/Users/migue/.gemini/antigravity/scratch/fintrack/supabase/functions/). They run on Deno and must also validate JWT tokens.

---

## 4. Verification & Testing

Before approving backend-related changes, run:

```powershell
# Validate backend query structures and Supabase models:
node scripts/audit-backend-supabase.js
```
