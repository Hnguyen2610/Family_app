---
name: subagent-driven-development
description: Protocol for decomposing complex tasks and managing subagent interactions.
---

# Subagent-driven Development - Agent Delegation & Coordination Protocol

## Overview
This skill defines the formal communication protocol for delegating tasks to subagents. By structured task allocation, the Orchestrator acts as the "Architect" and dispatchers work to isolated "Workers", maintaining clean context and saving prompt token consumption.

---

## 🏗️ The Delegation Protocol

When the master agent decomposes a complex request, it must write a task specification file and launch a subagent using its internal agent dispatching tools.

### 1. Structure of a Task specification
A task dispatched to a subagent must be saved under `.agent/tasks/{task-id}.md` (or in project root if `/tasks` directory is unavailable). It must contain:

```markdown
# TASK SPECIFICATION: [task-id] - [Brief Title]

---

## 🎯 Objective
[Detailed description of what the subagent must achieve]

## 🛠️ Tech Stack & Scope
* **Scope Files:** [List of absolute paths to files the subagent is allowed to read/write]
* **Banned Files:** [List of files or domains the subagent MUST NOT touch]

## 📥 Inputs
[Specific variables, raw code snippets, API paths, schemas, or requirements]

## 📤 Expected Outputs
[Specify output files, format structure, or exact variables]

## 🏁 Verification Steps
[List of exact tests, compile directives, or scripts the subagent must execute before reporting completion]
```

---

## 🤖 Subagent Selection Rules
Assign the correct specialized subagent for the task as outlined below:

| Specialist Subagent | File Ownership / Domain | Script Responsibility |
|:---|:---|:---|
| `frontend-specialist` | UI components, pages, styles (`**/*.{tsx,jsx,vue,css}`) | `ux_audit.py`, `accessibility_checker.py` |
| `backend-specialist` | Server routes, controllers, services (`backend/src/**`) | Server compilation checks |
| `database-architect` | Database schema, config, queries (`**/prisma/**`) | `schema_validator.py` |
| `test-engineer` | Tests (`**/*.test.ts`, `**/__tests__/**`) | `test_runner.py`, `playwright_runner.py` |
| `devops-engineer` | CI/CD, docker configurations, launch files | `security_scan.py` |
| `debugger` | Troubleshooting existing logged runtime errors | Log inspection |

---

## 🔄 Interaction Cycle

```
[Orchestrator] ────(1) Write Task File────>  [.agent/tasks/{id}.md]
      │                                             │
      ├────(2) Invoke Subagent with Task Spec───────┤
      │                                             ▼
      │                                        [Subagent]
      │                                             │
      │                                       (3) Exec Code
      │                                             │
      │                                       (4) Run Test
      │                                             ▼
[Orchestrator] <───(5) Read Output & Verify─── [Write Report]
```

### 4. Code Ownership Gate
If a subagent (e.g., `frontend-specialist`) realizes it needs to edit a file outside its domain (e.g., creating a backend endpoint or writing a test file):
1. The subagent **MUST NOT** edit that file.
2. The subagent must stop and write a report back to the Orchestrator stating: *"Backend edit needed for c:\path\to\api.ts"*.
3. The Orchestrator will then launch a `backend-specialist` subagent to complete that specific file edit.

---

## 📝 Subagent Completion Report
Every subagent must write its report in the task file under the header `## 📝 Completion Report` before exiting:
* **Files Modified/Created:** List of absolute paths.
* **Test results:** Command output showing tests passed.
* **Open Concerns / Blockers:** Issues the Orchestrator needs to handle next.
