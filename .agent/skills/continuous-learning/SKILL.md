# Continuous Learning Skill (v2)

## 🎯 Goal
Improve the AI's "instincts" by capturing and reusing successful patterns discovered during coding sessions.

## 🛠️ Instructions
1.  **Extract Patterns**: After completing a task or solving a bug, identify the core logic or configuration that worked.
2.  **Save Instincts**: Record these patterns in `.agent/instincts/pending/` with a confidence score.
3.  **Refine Skills**: Periodically run `skill-create` (Lệnh `/skill-create`) to formalize learned patterns into permanent skills.
4.  **Session Evaluation**: Review the current session's effectiveness and document what failed and why.

## 🏁 Workflow
1.  **Detect Success**: Identify a repeatable solution.
2.  **Document**: Capture the "Why" and "How".
3.  **Save**: Write to the local instinct cache.
4.  **Cluster**: Merge similar instincts into a single skill.
