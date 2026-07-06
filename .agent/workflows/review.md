---
description: Automate Code Review flow for requested changes. Runs code review checklist, security check and generates reports.
---

# /review - Automated Code Review Workflow

$ARGUMENTS

---

## Purpose

This command automates the code review process. It uses `code-reviewer` and `security-reviewer` agents to inspect changed files against the project's quality, accessibility, and security guidelines.

---

## Sub-commands

```
/review            - Review all uncommitted changes in current workspace
/review parent     - Review changes compared to parent branch (main/master)
/review file <url> - Review a specific file only
```

---

## 🔄 Review Steps

1. **Detect Changes:**
   - Run `git status` or use explorer agent to identity modified files.
2. **Assign Reviewers:**
   - All code edits $\rightarrow$ `code-reviewer` (applies `code-review-checklist`).
   - Security/Auth/Backend edits $\rightarrow$ `security-reviewer` (applies OWASP Top 10 guidelines).
3. **Execute Audits:**
   - Execute project validation scripts:
     * Frontend components modified: Run `python .agent/skills/frontend-design/scripts/ux_audit.py .`
     * CSS/Tailwind modified: Run `python .agent/skills/frontend-design/scripts/accessibility_checker.py .`
     * Dependencies/Config modified: Run `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .`
4. **Compile Report:**
   - Generate a unified Code Review Report listing warnings/errors by severity.
5. **Interactive Resolution:**
   - Fix issues rated critical or worth noting, or get user confirmation to proceed if warnings are false positives.

---

## 📄 Code Review Report Format

```markdown
## 🔍 Code Review Report

### Summary
* **Files reviewed:** [Count] files
* **Critical Issues (Blockers):** [Count]
* **Moderate Issues (Warnings):** [Count]

---

### 🚨 Critical Issues
1. **[File Path:Line]**: [Brief description of the bug/security issue]
   * *Fix:* [Suggested code correction]

### ⚠️ Warnings / Improvements
1. **[File Path:Line]**: [Code quality or styling guideline violation]
   * *Suggest:* [Refactored code snippet]

---

### Verification
* UX Audit: (Pending/Pass/Fail)
* Security Scan: (Pending/Pass/Fail)
```

---

## Integration with other commands

Other commands (like `/enhance` or `/deploy`) automatically trigger `/review` as their final step before completion. The workflow is aborted if `/review` return Critical ISSUES.
