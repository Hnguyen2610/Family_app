# Cost-Aware LLM Pipeline Skill

## 🎯 Goal

Minimize API costs and optimize token usage while maintaining high agent performance.

## 🛠️ Instructions

1.  **Selective Context**: Only read files that are strictly relevant to the current task.
2.  **Summary First**: Use `grep_search` and `find_by_name` to locate code before reading full files.
3.  **Model Routing**: Use cheaper models (e.g., Gemini 3 Flash) for research and expensive models (e.g., Gemini 3.1 Pro,Claude Opus 4.6) only for final implementation/review.
4.  **Compaction**: Suggest manual context compaction if the session history becomes too long.

## 🏁 Workflow

1.  **Audit**: Check current token usage.
2.  **Filter**: Prune irrelevant information from the context.
3.  **Compress**: Summarize previous findings instead of carrying full logs.
