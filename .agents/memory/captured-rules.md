---
status: temporary
last_verified: 2026-06-25
---

# Captured Rules - Pending Review

Rules automatically captured from conversations. Review and promote to permanent storage.

---

## Pending Rules

### 2026-06-25 09:23 CEST - Workflow: GitHub Board Status Semantics

**User said (redacted):**

> "Human Review: is for HUMAN ACTION!!! fixing PRs is for AI agents."

**Rule extracted:**

- **Type**: ALWAYS
- **Action**: Use `Human Review` only when a human action is mandatory. PRs that need code, CI, typecheck, or merge-conflict fixes are AI-agent work and should be `In Progress`. Move closed/deployed/code-complete work to `Done`.
- **Context**: GitHub project board issue and PR status triage.
- **Category**: workflow

**Status**: PENDING_REVIEW

---

## Processed Rules

### 2026-06-25 10:28 CEST - Workflow: No Production Workarounds

**User said (redacted):**

> "never ... do workaround. only clean code."

**Rule extracted:**

- **Type**: NEVER
- **Action**: Do not introduce workaround or escape-hatch production configuration as a fix. Implement the clean, canonical solution even when it takes longer.
- **Context**: Production infrastructure, auth configuration, deployment fixes, and code changes.
- **Category**: workflow

**Status**: PROCESSED

**Promoted to:** `AGENTS.md`, `CLAUDE.md`, `CODEX.md`
