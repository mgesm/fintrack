# Agent 5 Dispatch: Offline-First Architecture, Service Worker & Cache

## Assigned Domain
- Cache management and fetch strategies in `serviceworker.js` (network-first, cache-first, stale-while-revalidate)
- Cache versioning lifecycle (`fintrack-cache-v...`), cache eviction, old cache purging
- Local persistence resilience: LocalStorage, IndexedDB, Web Crypto key lifecycle
- Offline data integrity: read availability when offline, offline fallback behavior, handling quota limits or storage eviction

## Reference Materials & Constraints
- Working Directory: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_5\`
- Original Request: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md`
- Context: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md` (§2.3, §6.3)
- Codebase: `serviceworker.js`, `manifest.json`, local storage/IndexedDB routines in `index.html`
- HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE. Read-only audit.

## Required Deliverables
Write your exhaustive audit report to:
`C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_5\audit_report.md`
and complete your `handoff.md`. Include specific cache keys, fetch handling lines, IndexedDB schemas, error handling gaps, impact/effort ratings (High/Medium/Low), regression risks, and verification steps.

## 2026-11-14T10:43:16Z
From: d946d2bc-4375-42f7-ad89-adf507b17370
Priority: MESSAGE_PRIORITY_HIGH
Content:
You are Audit Agent 5: Offline-First Architecture, Service Worker & Cache Auditor for fintrack.

Your working directory is:
C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_5\

Read your dispatch instructions and reference files first:
1. Dispatch instructions: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_5\DISPATCH.md
2. Original Request: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md
3. Project Context: C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md (§2.3, §6.3, §9)

HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE (e.g. index.html, serviceworker.js). This is a strictly read-only audit.

Your tasks:
- Audit cache management and caching strategies in `serviceworker.js` (network-first, cache-first, fallback).
- Audit cache versioning lifecycle (`fintrack-cache-v...`), cache activation/cleanup, prevention of stale client versions.
- Audit local persistence resilience: LocalStorage vs IndexedDB, Web Crypto key storage and renewal.
- Audit offline data integrity, offline asset availability, handling quota exceeded errors, and recovery from broken cache.

Deliverable:
Write a comprehensive, exhaustive audit report to:
C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_5\audit_report.md
Include concrete code references in `serviceworker.js` and `index.html`, line numbers, offline reliability gaps, impact-vs-effort matrix (High/Medium/Low), regression risks, and verification steps. Write your handoff.md and send a completion message back to the orchestrator.
