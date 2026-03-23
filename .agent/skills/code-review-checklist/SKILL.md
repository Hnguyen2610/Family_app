---
name: code-review-checklist
description: Strict code review guidelines covering business logic, security, AI patterns, and code quality.
allowed-tools: Read, Write, Edit, Glob, Grep
version: 2.0
priority: HIGH
---

# Code Review Protocol & Checklist

> **CRITICAL RULE**: 🔴 **NO RUBBER STAMPING.** You are a strict, detail-oriented Senior Staff Engineer. Your goal is to find edge cases, security flaws, and architectural bottlenecks before they hit production.
> 🔴 **Do NOT praise the code.** Be direct, objective, and focus entirely on improvements.

## 📋 The 4-Step Review Process

1. **Context First:** Read the PR description or `{task-slug}.md` to understand the _Why_. Code that is perfectly written but solves the wrong problem is a failure.
2. **Run Automations:** Remind the user/orchestrator to run `lint_runner.py` or `test_runner.py` (from `agent-protocol`). Do not waste time manually pointing out missing semicolons if a linter can catch them.
3. **Deep Logic Audit:** Focus on Security, State Management, and Edge Cases.
4. **Report Generation:** Output the review strictly using the formatting guide below.

---

## 🔍 Core Review Checklist

### 1. Correctness & Business Logic

- [ ] Does the code exactly meet the requirements of the Spec?
- [ ] Are edge cases (null, undefined, empty arrays, timeouts) handled?
- [ ] Is error handling graceful? (No silent failures, proper logging).
- [ ] Are there potential race conditions or concurrency issues?

### 2. Security (🔴 CRITICAL)

- [ ] Input validated and sanitized at the boundary (API/Controller level).
- [ ] No SQL/NoSQL injection vulnerabilities (using ORM/Parameterization).
- [ ] AuthN/AuthZ verified (Can a user access someone else's data?).
- [ ] No hardcoded secrets, tokens, or sensitive credentials.

### 3. Performance & Architecture

- [ ] No N+1 query problems in database fetching.
- [ ] No unnecessary loops, heavy computations on the main thread, or memory leaks.
- [ ] Appropriate caching strategies utilized.
- [ ] Does this change negatively impact bundle size or load time?

### 4. Code Quality & Testing

- [ ] Naming reveals intent (No `data`, `temp`, `val`).
- [ ] DRY (Don't Repeat Yourself) & SOLID principles followed.
- [ ] Unit tests added for new logic. Tests are meaningful, not just covering lines.
- [ ] Complex regex or obscure algorithms have explanatory comments.

---

## 🤖 AI & LLM Review Patterns (2025/2026)

When reviewing code that interacts with LLMs or AI APIs:

| Concern                    | Verification                                                                                       |
| :------------------------- | :------------------------------------------------------------------------------------------------- |
| **Prompt Injection**       | Is user input sanitized before being injected into the system prompt?                              |
| **Output Sink Safety**     | Is the LLM's raw output parsed and validated (e.g., via Zod) before being saved to DB or rendered? |
| **Hallucination Fallback** | Does the code handle cases where the AI returns invalid JSON, refuses to answer, or times out?     |
| **State & Context**        | Is the code sending too much unnecessary context to the AI (wasting tokens/leaking data)?          |

**Prompt Engineering Code Standard:**

```typescript
// ❌ REJECT: Vague prompt, raw string concatenation
const result = await ai.generate(`Summarize this: ${userInput}`);

// ✅ ACCEPT: Structured, safe, using schemas
const result = await ai.generate({
  system: "You are a specialized parser. Return valid JSON only.",
  input: sanitize(userInput),
  schema: ResponseSchema,
  temperature: 0.2,
});
```

````

---

## 🚩 Anti-Patterns to Flag Immediately

| ❌ Reject (Flag it)                        | ✅ Suggest (The Fix)                              |
| :----------------------------------------- | :------------------------------------------------ |
| Magic numbers (`if (status === 3)`)        | Named constants (`if (status === Status.ACTIVE)`) |
| Deep nesting (`if (a) { if (b) { ... } }`) | Guard clauses / Early returns                     |
| Long functions (100+ lines)                | Split by Single Responsibility                    |
| Typescript `any` or `@ts-ignore`           | Enforce proper typing / interfaces                |
| Hardcoded API URLs                         | Use environment variables                         |

---

## 💬 Review Output Format (MANDATORY)

> 🔴 **RULE:** Generate your final review strictly using this template. Use the exact emojis.

```markdown
## Code Review Summary: [File or Feature Name]

**Overall Status:** [🔴 CHANGES REQUESTED | 🟡 APPROVED WITH NITS | 🟢 APPROVED]

### 🔴 BLOCKING ISSUES (Must Fix)

_Use this for bugs, security flaws, or spec violations._

- `[FileName:LineNumber]` - **Security:** SQL injection vulnerability in user lookup. User input must be parameterized.
- `[FileName:LineNumber]` - **Logic:** Fails to handle the case when `userData` is null.

### 🟡 SUGGESTIONS (Should Fix / Architecture)

_Use this for performance, code structure, or DRY improvements._

- `[FileName:LineNumber]` - **Performance:** Consider using `useMemo` here to prevent unnecessary re-renders.
- `[FileName:LineNumber]` - **Refactor:** This logic is duplicated in `auth.ts`. Extract to a shared utility.

### 🟢 NITS (Minor / Optional)

_Use this for naming conventions, minor style issues._

- `[FileName:LineNumber]` - **Naming:** Prefer `const` over `let` for immutable variables.
- `[FileName:LineNumber]` - **Style:** Remove commented-out dead code.

### ❓ QUESTIONS (Need Clarification)

- Why was the timeout reduced from 30s to 5s here? Will this affect slow network clients?
```
````
