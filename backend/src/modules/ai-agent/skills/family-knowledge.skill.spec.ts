import { FamilyKnowledgeSkill } from './family-knowledge.skill';

describe('FamilyKnowledgeSkill', () => {
  let ragService: any;
  let skill: FamilyKnowledgeSkill;

  beforeEach(() => {
    ragService = {
      createKnowledgeDocument: jest.fn().mockResolvedValue({ id: 'doc-123' }),
    };
    skill = new FamilyKnowledgeSkill(ragService);
  });

  describe('getTools', () => {
    it('returns both createWikiEntry and autoSaveFamilyMemory tools', () => {
      const tools = skill.getTools();
      expect(tools.length).toBe(2);
      expect(tools.map(t => t.function.name)).toContain('createWikiEntry');
      expect(tools.map(t => t.function.name)).toContain('autoSaveFamilyMemory');
    });
  });

  describe('executeTool - autoSaveFamilyMemory', () => {
    it('saves direct entry automatically for non-sensitive data', async () => {
      const context = {
        userId: 'user-1',
        familyId: 'family-a',
        resolvedFamilyId: 'family-a',
        userMessage: 'Tin thích sườn xào chua ngọt',
        intent: 'general_chat',
      };

      const result = await skill.executeTool('autoSaveFamilyMemory', {
        title: 'Sở thích ăn uống của Tin',
        content: 'Tin thích ăn sườn xào chua ngọt ít cay.',
      }, context as any);

      expect(result).toBeDefined();
      expect(result.ok).toBe(true);
      expect(result.data.savedDirectly).toBe(true);
      expect(result.data.documentId).toBe('doc-123');
      expect(ragService.createKnowledgeDocument).toHaveBeenCalledWith({
        familyId: 'family-a',
        title: 'Sở thích ăn uống của Tin',
        content: 'Tin thích ăn sườn xào chua ngọt ít cay.',
        sourceType: 'ai_chat_saved',
        createdBy: 'user-1',
      });
    });

    it('rejects saving direct entry automatically if sensitive info is detected', async () => {
      const context = {
        userId: 'user-1',
        familyId: 'family-a',
        resolvedFamilyId: 'family-a',
        userMessage: 'Yến bị dị ứng với hải sản',
        intent: 'general_chat',
      };

      const result = await skill.executeTool('autoSaveFamilyMemory', {
        title: 'Sức khỏe của Yến',
        content: 'Yến bị dị ứng với cua và hải sản có vỏ.',
      }, context as any);

      expect(result).toBeDefined();
      expect(result.ok).toBe(true);
      expect(result.data.success).toBe(false);
      expect(result.data.message).toContain('nhạy cảm');
      expect(ragService.createKnowledgeDocument).not.toHaveBeenCalled();
    });
  });
});
