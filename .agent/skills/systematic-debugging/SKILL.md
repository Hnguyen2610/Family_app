---
name: systematic-debugging
description: 5-phase systematic debugging methodology with root cause analysis and evidence-based verification. Use when debugging complex issues.
allowed-tools: Read, Write, Glob, Grep, Execute
---

# Systematic Debugging

> Source: obra/superpowers (Adapted & Enhanced)

## Overview

This skill provides a structured approach to debugging that prevents random guessing, ensures problems are properly understood before solving, and maintains a clean codebase throughout the investigation.

## 5-Phase Debugging Process

### Phase 0: Divergent Hypotheses (MANDATORY)

Before reproduction, list 3 potential sources of the bug:

1. **Hypothesis A**: [Frontend/UI logic?]
2. **Hypothesis B**: [Backend/API/Service?]
3. **Hypothesis C**: [Data/DB/Config?]
   _Quickly scan all three before picking one to test._

### Phase 1: Reproduce

Before fixing, reliably reproduce the issue.

```markdown
## Reproduction Steps

1. [Exact step to reproduce]
2. [Next step]
3. [Expected vs actual result]

## Reproduction Rate

- [ ] Always (100%)
- [ ] Often (50-90%)
- [ ] Sometimes (10-50%)
- [ ] Rare (<10%)
      Phase 2: Isolate & Test Hypotheses
      Narrow down the source and systematically test your Phase 0 hypotheses.

Markdown

## Isolation Questions

- When did this start happening?
- What changed recently?
- Does it happen in all environments?
- Can we reproduce with minimal code?
- What's the smallest change that triggers it?

## Hypothesis Testing Checklist

- [ ] Which hypothesis (A, B, or C) is currently being tested?
- [ ] What specific evidence validates or invalidates it?
- [ ] **Crucial:** Revert any experimental code changes or debug logs before testing the next hypothesis to avoid compounding errors.
      Phase 3: Understand
      Find the root cause, not just symptoms.

Markdown

## Root Cause Analysis

### The 5 Whys

1. Why: [First observation]
2. Why: [Deeper reason]
3. Why: [Still deeper]
4. Why: [Getting closer]
5. Why: [Root cause]
   Phase 4: Fix & Verify
   Fix and verify it's truly fixed.

Markdown

## Fix Verification

- [ ] Bug no longer reproduces
- [ ] Related functionality still works
- [ ] No new issues introduced
- [ ] Test added to prevent regression
      Debugging Checklist
      Markdown

## Before Starting

- [ ] Can reproduce consistently
- [ ] Have minimal reproduction case
- [ ] Understand expected behavior

## During Investigation

- [ ] Check recent changes (git log)
- [ ] Check logs for errors
- [ ] Add logging if needed
- [ ] Use debugger/breakpoints
- [ ] Revert experimental changes after each failed hypothesis

## After Fix

- [ ] Root cause documented
- [ ] Fix verified
- [ ] Regression test added
- [ ] Similar code checked
- [ ] Cleaned up all debug logs/comments
      Common Debugging Commands
      Bash

# Version Control: Recent changes

git log --oneline -20
git diff HEAD~5

# Code Search: Search for pattern

grep -r "errorPattern" --include="\*.ts"

# Process/App Logs

pm2 logs app-name --err --lines 100

# Network & Ports

lsof -i :<port_number>

# Docker/Container Logs

docker logs --tail 100 -f container_name
Anti-Patterns
❌ Random changes - "Maybe if I change this..."
❌ Ignoring evidence - "That can't be the cause"
❌ Assuming - "It must be X" without proof
❌ Not reproducing first - Fixing blindly
❌ Stopping at symptoms - Not finding the root cause
❌ Confirmation bias - Only looking for logs/evidence that prove your current hypothesis while ignoring contradictory data.
❌ Not cleaning up - Leaving debug code (console.log, hardcoded test data, debugger) in the final commit.
```
