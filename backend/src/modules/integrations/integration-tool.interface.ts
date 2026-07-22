/**
 * IntegrationTool — Internal contract for all AI-callable tools in Family App.
 *
 * This interface ensures all tools (calendar, tasks, knowledge, weather, etc.) are
 * interoperable and can be adapted to MCP once the external server runtime is ready.
 *
 * Rules:
 * - Read-only tools must set `sideEffect = false`.
 * - Mutating tools must set `sideEffect = true` and must only run after explicit user confirmation.
 * - Auth context is always passed — tools must respect familyId isolation.
 */

export interface IntegrationToolContext {
  userId: string;
  familyId?: string;
  /** True if user has explicitly confirmed the action (required for sideEffect=true tools) */
  confirmed?: boolean;
}

export interface IntegrationToolSchema {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface IntegrationTool {
  /** Unique machine-readable name, e.g. "createEvent", "searchFamilyKnowledge" */
  name: string;

  /** Human-readable description for LLM tool selection */
  description: string;

  /** JSON Schema for the input parameters */
  inputSchema: IntegrationToolSchema;

  /**
   * Whether this tool has side effects (creates/updates/deletes data).
   * Side-effect tools must not execute without confirmed=true in context.
   */
  sideEffect: boolean;

  /**
   * Execute the tool with the given input and context.
   * @throws Error if sideEffect=true and context.confirmed is falsy.
   */
  execute(input: unknown, context: IntegrationToolContext): Promise<unknown>;
}

/**
 * Tool registry for all registered IntegrationTools.
 * Used for discovery by MCP adapter layer when ready.
 */
export interface IntegrationToolRegistry {
  register(tool: IntegrationTool): void;
  get(name: string): IntegrationTool | undefined;
  listAll(): IntegrationTool[];
  listReadOnly(): IntegrationTool[];
  listSideEffect(): IntegrationTool[];
}
