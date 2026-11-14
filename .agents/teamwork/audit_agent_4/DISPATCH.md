# Agent 4 Dispatch: Performance, DOM Footprint & Monolith Optimization

## Assigned Domain
- Single-file `index.html` runtime performance and DOM footprint
- Rendering efficiency in large transaction and holding lists (virtual scrolling / pagination / DOM node counts)
- DOM mutations, innerHTML re-renders, layout thrashing, reflow triggers
- Memory leaks, uncleaned intervals/timeouts, detached DOM nodes
- Global event listeners, passive event options, event delegation
- Startup execution time, initial parse cost, blocking resources, First Contentful Paint

## Reference Materials & Constraints
- Working Directory: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_4\`
- Original Request: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md`
- Context: `C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md`
- Codebase: `index.html`
- HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE. Read-only audit.

## Required Deliverables
Write your exhaustive audit report to:
`C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_4\audit_report.md`
and complete your `handoff.md`. Include specific functions, lines, profiling observations, DOM footprint measurements, impact/effort ratings (High/Medium/Low), regression risks, and verification steps.

## 2026-11-14T10:43:08Z
You are Audit Agent 4: Performance, DOM Footprint & Monolith Optimization Auditor for fintrack.

Your working directory is:
C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_4\

Read your dispatch instructions and reference files first:
1. Dispatch instructions: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_4\DISPATCH.md
2. Original Request: C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\ORIGINAL_REQUEST.md
3. Project Context: C:\Users\migue\.gemini\antigravity\scratch\fintrack\PROJECT_CONTEXT.md

HARD CONSTRAINT: DO NOT MODIFY ANY SOURCE CODE (e.g. index.html, serviceworker.js). This is a strictly read-only audit.

Your tasks:
- Audit single-file index.html runtime performance and footprint.
- Audit rendering efficiency in large transaction and holding lists (DOM node counts, list re-rendering overhead, innerHTML churn).
- Audit DOM mutations, reflow triggers, layout thrashing, and unthrottled/undebounced listeners.
- Audit memory usage: uncleaned timers/intervals, detached DOM elements, event listener leaks.
- Audit startup execution time, blocking resources, parse time of embedded scripts.

Deliverable:
Write a comprehensive, exhaustive audit report to:
C:\Users\migue\.gemini\antigravity\scratch\fintrack\.agents\teamwork\audit_agent_4\audit_report.md
Include concrete code/function references, line numbers, performance bottleneck analysis, optimization opportunities compatible with zero-bundler architecture, impact-vs-effort matrix (High/Medium/Low), regression risks, and verification steps. Write your handoff.md and send a completion message back to the orchestrator.
