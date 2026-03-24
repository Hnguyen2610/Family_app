# /skill-create - Skill Generation Workflow

## 🎯 Goal
Convert temporary instincts or repeated code patterns into permanent, documented AI skills.

## 🛠️ Instructions
1.  **Audit History**: Search `.agent/instincts/pending/` and git history for frequent patterns.
2.  **Draft Skill**: Create a new `SKILL.md` in `.agent/skills/{new-skill}/`.
3.  **Define Rules**: Translate successful code snippets into abstract rules and best practices.
4.  **Register**: Add the new skill to `ARCHITECTURE.md` and `GEMINI.md`.

## 🏁 Command Execution
- Run `python .agent/scripts/skill_generator.py` (if available) or perform the manual extraction.
