---
name: agent-protocol
description: Core system protocols, final verification checklists, and agent mode mappings. Single source of truth for script execution.
allowed-tools: Read, Write, Edit, Execute
version: 1.1
priority: CRITICAL
---

# Agent Protocol & Meta-Workflow

## Rule 0: Spec-First Awareness (MANDATORY)

> 🔴 **NEVER code without a clear understanding of the 'Why'.** If you don't have the Spec or Requirement document, **ASK** for it or search for it. Every change must be justifiable by business logic, not just technical "correctness".

## Rule 1: Strict Debugging Protocol (MANDATORY)

> 🔴 **NO GUESSING.** Every bug report must go through Phase 1-3 of `systematic-debugging`:
>
> 1. **Reproduction**: Show the steps/logs that prove the bug exists.
> 2. **Isolation**: Identify the exact line/component causing the issue.
> 3. **Proof**: Explain _why_ the bug is happening with evidence.
> 4. **Fix**: Propose a solution only AFTER the above are clear.

## Rule 2: Divergent Discovery (MANDATORY)

> 🔴 **AVOID TUNNEL VISION.** Before deep-diving into a solution:
>
> 1. **List 3 Hypotheses**: Brainstorm at least 3 different potential areas where the issue could exist.
> 2. **Quick Verify**: Spend 2-3 tool calls to quickly rule out or support each hypothesis.
> 3. **Pick & Prove**: Only then focus on the most likely candidate.

## Final Checklist Protocol

**Trigger:** When the user says "run final checks", "kiểm tra cuối cùng", "audit project", or similar phrases.

| Task Stage       | Command                                            | Purpose                        |
| ---------------- | -------------------------------------------------- | ------------------------------ |
| **Manual Audit** | `python .agent/scripts/checklist.py .`             | Priority-based project audit   |
| **Pre-Deploy**   | `python .agent/scripts/checklist.py . --url <URL>` | Full Suite + Performance + E2E |

**Priority Execution Order:**

1. **Security** → 2. **Lint** → 3. **Schema** → 4. **Tests** → 5. **UX** → 6. **Seo** → 7. **Lighthouse/E2E**

**Rules:**

- **Completion:** A task is NOT finished until the checklist returns success.
- **Reporting:** If it fails, fix the **Critical** blockers first (Security/Lint).

## Verification Scripts Hub

> 🔴 **EXECUTION RULE:** The Orchestrator can run `checklist.py` to trigger all checks. Specialized agents should ONLY run the scripts matching their current skill domain via `python .agent/skills/<skill>/scripts/<script>.py`.

| Script                     | Skill Domain          | When to Use         |
| -------------------------- | --------------------- | ------------------- |
| `security_scan.py`         | vulnerability-scanner | Always on deploy    |
| `dependency_analyzer.py`   | vulnerability-scanner | Weekly / Deploy     |
| `lint_runner.py`           | lint-and-validate     | Every code change   |
| `test_runner.py`           | testing-patterns      | After logic change  |
| `schema_validator.py`      | database-design       | After DB change     |
| `ux_audit.py`              | frontend-design       | After UI change     |
| `accessibility_checker.py` | frontend-design       | After UI change     |
| `seo_checker.py`           | seo-fundamentals      | After page change   |
| `bundle_analyzer.py`       | performance-profiling | Before deploy       |
| `mobile_audit.py`          | mobile-design         | After mobile change |
| `lighthouse_audit.py`      | performance-profiling | Before deploy       |
| `playwright_runner.py`     | webapp-testing        | Before deploy       |

## Gemini/Agent Mode Mapping

| Mode     | Agent             | Behavior                                     |
| -------- | ----------------- | -------------------------------------------- |
| **plan** | `project-planner` | 4-phase methodology. NO CODE before Phase 4. |
| **ask**  | -                 | Focus on understanding. Ask questions.       |
| **edit** | `orchestrator`    | Execute. Check `{task-slug}.md` first.       |

**Plan Mode (4-Phase Workflow):**

1. **ANALYSIS** → Research context, ask clarifying questions.
2. **PLANNING** → Create `{task-slug}.md`, break down tasks.
3. **SOLUTIONING** → Architecture, system design (NO CODE!).
4. **IMPLEMENTATION** → Ready for Edit/Code mode.

> 🔴 **Edit mode rule:** If implementing a multi-file or structural change → Offer to create `{task-slug}.md` to track progress. For minor, single-file fixes → Proceed directly.
