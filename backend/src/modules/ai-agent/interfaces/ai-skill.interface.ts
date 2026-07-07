import { AiIntent } from '../ai-intent-router';
import { AiTrace } from '../ai-observability';

export interface AiSkillContext {
  userId: string;
  familyId: string;
  resolvedFamilyId?: string; // Always the real DB family ID (not 'all')
  userMessage: string;
  intent: string;
  image?: string;
  familyContext?: string;
  memoryContext?: string;
  ragContext?: string;
  ragQuery?: string;
  ragMiss?: boolean;
  ragSources?: Array<{
    documentId: string;
    title: string;
    chunkIndex: number;
    score: number;
    familyId?: string;
    sourceType?: string;
    category?: string;
    retrieval?: string;
    snippet?: string;
  }>;
  history?: any[];
  trace?: AiTrace;
  source?: 'web' | 'telegram';
}

export interface AiSkillTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface AiSkillResponse {
  content: string;
  direct?: boolean;
}

export interface AiSkill {
  name: string;
  
  /**
   * Determine if this skill can handle the given intent
   */
  canHandle(intent: AiIntent): boolean;

  /**
   * Get the system prompt context for this skill
   */
  getSystemPrompt(context: AiSkillContext): string;

  /**
   * Get tools available for this skill
   */
  getTools?(): AiSkillTool[];

  /**
   * Attempt to provide a direct answer without calling the LLM
   */
  tryDirectAnswer?(context: AiSkillContext): Promise<AiSkillResponse | undefined>;

  /**
   * Execute a tool specific to this skill
   */
  executeTool?(toolName: string, args: any, context: AiSkillContext): Promise<any>;

  /**
   * Format tool results for the LLM or user
   */
  formatToolResult?(toolName: string, result: any): string;
}
