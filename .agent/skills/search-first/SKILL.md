# Search-First Development Skill

## 🎯 Goal
Ensure absolute context clarity by researching the codebase and documentation *before* proposing or implementing any changes.

## 🛠️ Instructions
1.  **Stop and Research**: Before writing a single line of code, use `grep_search`, `find_by_name`, and `mcp_gitnexus_query` to understand the existing logic.
2.  **Reference Existing Patterns**: Identify where similar functionality exists and replicate established patterns.
3.  **Cross-Reference Docs**: Use `mcp_context7_query-docs` or `read_url_content` to check library documentation for the latest best practices.
4.  **Impact Analysis**: Use `mcp_gitnexus_impact` to see what will break if you change a symbol.
5.  **Evidence-Based Planning**: Your `implementation_plan.md` must cite specific files and line numbers found during research.

## 🚨 Verify Empty Results (MANDATORY)
**When `grep_search` returns "No results found", NEVER trust it blindly.** Always verify by:
1.  **Read the file directly** with `view_file` — especially for files you've previously viewed or edited, or files under ~500 lines.
2.  **Check encoding/save state** — the file may have unsaved changes or encoding issues that prevent grep from matching.
3.  **Try alternative search terms** — the function/variable may use a different naming convention than expected.
4.  **Rule**: If you previously saw content in a file and grep now says it doesn't exist, **the grep result is wrong, not your memory**. Always read the file to confirm.

> ⚠️ **Anti-Pattern**: Concluding "feature X doesn't exist" based solely on empty grep results without reading the actual source file. This leads to incorrect analysis and wasted time.

## 🏁 Workflow
1.  **Query**: Search for the concept/component.
2.  **Trace**: Follow the execution flow using `mcp_gitnexus_context`.
3.  **Validate**: Confirm assumptions with tool output. **If grep returns empty but you expect results, READ the file.**
4.  **Execute**: Only then, proceed to planning and implementation.
