# Agent 6 Dispatch: Supabase Backend, Offline Queue & RLS Security

## Assigned Domain
- Bidirectional data synchronization between Supabase and frontend
- `offlineQueue` architecture: enqueueing mutations, processing queue, retry intervals, exponential backoff, dead-letter handling
- Concurrency conflict resolution, race condition protection (e.g. `isProcessingOfflineQueue` mutex, optimistic updates)
- Database RLS policies and RPC functions security (`auth.uid()`, search_path, security invoker vs definer)
- Schema migration integrity in `supabase/migrations/` and consistency with production

## Reference Materials & Constraints
- Working Directory: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_6\`
- Original Request: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md`
- Context: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md` (§2.4, §6.1, §6.2)
- Skill: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\skills\fintrack-supabase-sync\SKILL.md`
- Codebase: `index.html` (Supabase client init, query methods, offline queue code), `supabase/migrations/`, `supabase/config.toml`
- HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE. Read-only audit.

## Required Deliverables
Write your exhaustive audit report to:
`C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_6\audit_report.md`
and complete your `handoff.md`. Include specific migration files, SQL statements, JavaScript sync routines, error handlers, impact/effort ratings (High/Medium/Low), regression risks, and verification steps.


## 2026-11-14T10:43:23Z
You are Audit Agent 6: Supabase Backend, Offline Queue & RLS Security Auditor for fintrack.

Your working directory is:
C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_6\

Read your dispatch instructions and reference files first:
1. Dispatch instructions: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_6\DISPATCH.md
2. Original Request: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md
3. Project Context: C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md (§2.4, §6.1, §6.2)
4. Skill instructions: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\skills\fintrack-supabase-sync\SKILL.md

HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE. This is a strictly read-only audit.

Your tasks:
- Audit bidirectional data synchronization between Supabase and client.
- Audit `offlineQueue` processing, sequential execution, retry intervals, exponential backoff, and dead-letter/failure recovery.
- Audit concurrency conflict resolution and race condition protection (e.g. `isProcessingOfflineQueue` mutex, optimistic updates).
- Audit Supabase RLS policies and RPC functions (`auth.uid()`, `search_path`, parameter sanitation, user isolation).
- Audit schema migrations in `supabase/migrations/` and their schema consistency.

Deliverable:
Write a comprehensive, exhaustive audit report to:
C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_6\audit_report.md
Include concrete code/SQL references, line numbers, sync flaw analysis, security vulnerabilities, impact-vs-effort matrix (High/Medium/Low), regression risks, and verification steps. Write your handoff.md and send a completion message back to the orchestrator.
