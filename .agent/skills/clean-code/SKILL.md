---
name: clean-code
description: Pragmatic coding standards - concise, direct, no over-engineering, no unnecessary comments
allowed-tools: Read, Write, Edit, Execute
version: 2.1
priority: CRITICAL
---

# Clean Code - Pragmatic AI Coding Standards

> **CRITICAL RULE**: 🔴 **STRICT MODE IS ALWAYS ON.** You MUST ALWAYS act as a **Senior Developer**. Your code must be extremely concise, DRY, self-documenting, and free of any "AI-vibes" (like obvious comments, long boilerplate variable chains, or verbose JSDocs).
>
> **CRITICAL SKILL** - Be **concise, direct, and solution-focused**.

---

## Core Principles

| Principle     | Rule                                                       |
| ------------- | ---------------------------------------------------------- |
| **SRP**       | Single Responsibility - each function/class does ONE thing |
| **DRY**       | Don't Repeat Yourself - extract duplicates, reuse          |
| **KISS**      | Keep It Simple - simplest solution that works              |
| **YAGNI**     | You Aren't Gonna Need It - don't build unused features     |
| **Boy Scout** | Leave code cleaner than you found it                       |

---

## Naming Rules

| Element       | Convention                                            |
| ------------- | ----------------------------------------------------- |
| **Variables** | Reveal intent: `userCount` not `n`                    |
| **Functions** | Verb + noun: `getUserById()` not `user()`             |
| **Booleans**  | Question form: `isActive`, `hasPermission`, `canEdit` |
| **Constants** | SCREAMING_SNAKE: `MAX_RETRY_COUNT`                    |

> **Rule:** If you need a comment to explain a name, rename it.

---

## Function Rules

| Rule                | Description                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| **Small**           | Max 20 lines, ideally 5-10                                               |
| **One Thing**       | Does one thing, does it well                                             |
| **One Level**       | One level of abstraction per function                                    |
| **Few Args**        | Max 3 arguments, prefer 0-2                                              |
| **No Side Effects** | Don't mutate inputs unexpectedly                                         |
| **Testable**        | Pass dependencies as arguments (DI) instead of hardcoding instantiations |

---

## Code Structure

| Pattern           | Apply                             |
| ----------------- | --------------------------------- |
| **Guard Clauses** | Early returns for edge cases      |
| **Flat > Nested** | Avoid deep nesting (max 2 levels) |
| **Composition**   | Small functions composed together |
| **Colocation**    | Keep related code close           |

---

## AI Coding Style

| Situation             | Action                |
| --------------------- | --------------------- |
| User asks for feature | Write it directly     |
| User reports bug      | Fix it, don't explain |
| No clear requirement  | Ask, don't assume     |

---

## Anti-Patterns (DON'T)

| ❌ Pattern               | ✅ Fix                                |
| ------------------------ | ------------------------------------- |
| Comment every line       | Delete obvious comments               |
| Helper for one-liner     | Inline the code                       |
| Factory for 2 objects    | Direct instantiation                  |
| utils.ts with 1 function | Put code where used                   |
| "First we import..."     | Just write code                       |
| Deep nesting             | Guard clauses                         |
| Magic numbers            | Named constants                       |
| God functions            | Split by responsibility               |
| Leaving unused imports   | Remove unused, sort remaining imports |

---

## 🔴 Before Editing ANY File (THINK FIRST!)

**Before changing a file, ask yourself:**

| Question                        | Why                      |
| ------------------------------- | ------------------------ |
| **What imports this file?**     | They might break         |
| **What does this file import?** | Interface changes        |
| **What tests cover this?**      | Tests might fail         |
| **Is this a shared component?** | Multiple places affected |

**Quick Check:**

File to edit: UserService.ts
└── Who imports this? → UserController.ts, AuthController.ts
└── Do they need changes too? → Check function signatures

> 🔴 **Rule:** Edit the file + all dependent files in the SAME task.
> 🔴 **Never leave broken imports or missing updates.**

---

## 🤖 Anti "AI-Vibe" (Act like a Senior)

> **MANDATORY:** Your generated code MUST NEVER look like it was written by an AI tutorial.

| AI Vibe (❌ DO NOT DO)                          | Senior Dev (✅ DO THIS)                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `// TODO: Implement logic here`                 | Leave blank or write actual logic                                                  |
| `return { success: true, data: result }`        | `return result` (Let Global Interceptors handle wrapping!)                         |
| `/** Creates an instance of UserService */`     | `/** Handles user entity operations and caching */` (If JSDoc is forced by linter) |
| `// Find user by ID` (before `findById()`)      | **No comment**. The code is the documentation.                                     |
| Hardcoding mock data if not asked               | Write the correct interface/schema only                                            |
| `const p1 = db.find(); await Promise.all([p1])` | Inline straightforward promises: `await Promise.all([db.find(), ...])`             |
| Copy-pasting exact `where` clauses              | DRY: Extract `const baseCondition = {...}` and spread it `...baseCondition`        |
| Over-using `Promise.resolve(0)`                 | Use ternary directly inside the inline array: `condition ? db.count() : 0`         |

**Special Rule for JSDocs (NestJS/TS):**

- Only write JSDocs if the project linter (`jsdoc/require-jsdoc`) strictly forces it.
- **NEVER** write robotic descriptions like "Controller for X" or "Creates an instance of Y" or "Injects the required service for...".
- Write what the business context is (e.g. "Retrieves dashboard overview statistics based on user RBAC scope.").

---

## 🔴 Business Logic First (Spec-Driven)

> **MANDATORY:** You are a Business Solutions Partner, not just a Coder.

| Step               | Action                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| **1. SOURCE**      | Identify the Spec or Requirement (e.g., `.md` docs, Jira-like text).             |
| **2. WHY**         | Can you explain the business impact of this change to a non-technical manager?   |
| **3. EDGE CASES**  | What happens to "old data"? What happens if a field is null/missing in the spec? |
| **4. NO GUESSING** | If root cause is unclear, use logs/debugging to PROVE it before proposing a fix. |

> 🔴 **Rule:** "Chậm mà chắc" (Slow but sure). Accuracy to the Spec is HIGHER priority than speed.

---

# Summary

| Do                     | Don't                     |
| ---------------------- | ------------------------- |
| Write code directly    | Write tutorials           |
| Let code self-document | Add obvious comments      |
| Fix bugs immediately   | Explain the fix first     |
| Inline small things    | Create unnecessary files  |
| Name things clearly    | Use abbreviations         |
| Keep functions small   | Write 100+ line functions |

> **Remember: The user wants working code, not a programming lesson.**

---

## 🔴 Self-Check Before Completing (MANDATORY)

**Before saying "task complete", verify:**

| Check                     | Question                          |
| ------------------------- | --------------------------------- |
| ✅ **Goal met?**          | Did I do exactly what user asked? |
| ✅ **Files edited?**      | Did I modify all necessary files? |
| ✅ **Code works?**        | Did I test/verify the change?     |
| ✅ **No errors?**         | Lint and TypeScript pass?         |
| ✅ **Nothing forgotten?** | Any edge cases missed?            |

> 🔴 **Rule:** If ANY check fails, fix it before completing.

---

## Verification Scripts (MANDATORY)

> 🔴 **CRITICAL:** Each agent runs ONLY their own skill's scripts after completing work.

### Agent → Script Mapping

| Agent                     | Script          | Command                                                                        |
| ------------------------- | --------------- | ------------------------------------------------------------------------------ |
| **frontend-specialist**   | UX Audit        | `python .agent/skills/frontend-design/scripts/ux_audit.py .`                   |
| **frontend-specialist**   | A11y Check      | `python .agent/skills/frontend-design/scripts/accessibility_checker.py .`      |
| **backend-specialist**    | API Validator   | `python .agent/skills/api-patterns/scripts/api_validator.py .`                 |
| **mobile-developer**      | Mobile Audit    | `python .agent/skills/mobile-design/scripts/mobile_audit.py .`                 |
| **database-architect**    | Schema Validate | `python .agent/skills/database-design/scripts/schema_validator.py .`           |
| **security-auditor**      | Security Scan   | `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .`        |
| **seo-specialist**        | SEO Check       | `python .agent/skills/seo-fundamentals/scripts/seo_checker.py .`               |
| **seo-specialist**        | GEO Check       | `python .agent/skills/geo-fundamentals/scripts/geo_checker.py .`               |
| **performance-optimizer** | Lighthouse      | `python .agent/skills/performance-profiling/scripts/lighthouse_audit.py <url>` |
| **test-engineer**         | Test Runner     | `python .agent/skills/testing-patterns/scripts/test_runner.py .`               |
| **test-engineer**         | Playwright      | `python .agent/skills/webapp-testing/scripts/playwright_runner.py <url>`       |
| **Any agent**             | Lint Check      | `python .agent/skills/lint-and-validate/scripts/lint_runner.py .`              |
| **Any agent**             | Type Coverage   | `python .agent/skills/lint-and-validate/scripts/type_coverage.py .`            |
| **Any agent**             | i18n Check      | `python .agent/skills/i18n-localization/scripts/i18n_checker.py .`             |

> ❌ **WRONG:** `test-engineer` running `ux_audit.py`
> ✅ **CORRECT:** `frontend-specialist` running `ux_audit.py`

---

### 🔴 Script Output Handling (READ → SUMMARIZE → ASK)

**When running a validation script, you MUST:**

1. **Run the script** and capture ALL output
2. **Parse the output** - identify errors, warnings, and passes
3. **Summarize to user** in this format:

```markdown
## Script Results: [script_name.py]

### ❌ Errors Found (X items)

- [File:Line] Error description 1
- [File:Line] Error description 2

### ⚠️ Warnings (Y items)

- [File:Line] Warning description

### ✅ Passed (Z items)

- Check 1 passed
- Check 2 passed

**Should I fix the X errors?**
Wait for user confirmation before fixing.

After fixing → Re-run script to confirm.

🔴 VIOLATION: Auto-fixing script validation errors without asking = Not allowed. (Fixing direct user bug reports is fine).
🔴 VIOLATION: Running script and ignoring output = FAILED task.
🔴 Rule: Always READ output → SUMMARIZE → ASK → then fix.
```
