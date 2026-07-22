# Family App — MCP Integration Roadmap

> **Status:** Planning (Phase 8) | Do NOT implement MCP runtime until Phase 2 (AI Action Confirmation) is fully deployed and side-effect confirmation is stable.

---

## Two Roles

### Family App as MCP Client

Family App **consumes** tools from external MCP servers.

Examples:
- A weather MCP server exposing real-time weather data.
- A market data MCP server exposing gold/currency prices.
- A sports data MCP server exposing football fixtures.

The AI Agent would call these tools transparently via the existing `AiSkillRegistry` → MCP adapter pattern.

### Family App as MCP Server

Family App **exposes** its own tools to external AI clients (e.g., other Claude/GPT agents, MCP-compatible host apps).

Exposed tools must be:
- **Read-only** tools: safe to expose immediately.
- **Mutating tools** (calendar create, task create, etc.): require side-effect confirmation before exposure.

---

## Current Internal Tool Inventory

| Tool | Skill | Type | Safe to Expose |
|---|---|---|---|
| `getEventsByMonth` | CalendarSkill | Read | ✅ Yes |
| `createEvent` | CalendarSkill | **Mutate** | ❌ After Phase 2 |
| `updateEvent` | CalendarSkill | **Mutate** | ❌ After Phase 2 |
| `deleteEvent` | CalendarSkill | **Mutate** | ❌ After Phase 2 |
| `getTasksByDate` | DailyTaskSkill | Read | ✅ Yes |
| `markTaskDone` | DailyTaskSkill | **Mutate** | ❌ After Phase 2 |
| `searchFamilyKnowledge` | FamilyKnowledgeSkill | Read | ✅ Yes |
| `createWikiEntry` | FamilyKnowledgeSkill | **Mutate** | ❌ After Phase 2 |
| `get_forecast` | WeatherSkill | Read | ✅ Yes |
| `search` | SearchSkill | Read | ✅ Yes |
| `getGoldPrice` | MarketSkill | Read | ✅ Yes |
| `get_matches` | FootballSkill | Read | ✅ Yes |
| `sendNotification` | NotificationService | **Mutate** | ❌ Requires auth |

---

## Prerequisites Before MCP Server Runtime

1. ✅ Internal tool contracts stable (via `IntegrationTool` interface)
2. 🔲 Side-effect confirmation fully deployed (Phase 2)
3. 🔲 Auth boundaries defined (per-family token or API key)
4. 🔲 Rate limiting per external client
5. 🔲 Audit log for all external tool calls

---

## Deferral Decision

> MCP server implementation is deferred until all 5 prerequisites are met.
> The `IntegrationTool` interface defined in Phase 8 Step 2 serves as the internal contract used today.
> When the MCP runtime is ready, existing tools simply need an adapter wrapping the `IntegrationTool.execute()` method.
