---
description: common gitnexus commands (analyze, status, mcp)
---
// turbo-all

1. Select the action you want to perform:

- **Analyze**: Index the current repository (auto-cleanup root files)
  `npx -y gitnexus@latest analyze; rm AGENTS.md; rm CLAUDE.md; rm -rf .claude`
- **Status**: Check the index status
  `npx -y gitnexus@latest status`
- **MCP Server**: Start the MCP server (stdio)
  `npx -y gitnexus@latest mcp`
- **Web UI**: Start the local server for Web UI bridge
  `npx -y gitnexus@latest serve`
- **Wiki**: Generate a wiki for the repo
  `npx -y gitnexus@latest wiki`

2. Run the command in the terminal.

---
> [!NOTE]
> Ngữ cảnh của Agent được quản lý tập trung tại `.agent/context/`. Vui lòng không sửa trực tiếp các file root nếu chúng xuất hiện tạm thời trong quá trình phân tích.
