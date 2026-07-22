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
    it('returns createWikiEntry, autoSaveFamilyMemory, and searchFamilyNotes tools', () => {
      const tools = skill.getTools();
      expect(tools.length).toBe(3);
      expect(tools.map(t => t.function.name)).toContain('createWikiEntry');
      expect(tools.map(t => t.function.name)).toContain('autoSaveFamilyMemory');
      expect(tools.map(t => t.function.name)).toContain('searchFamilyNotes');
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

  describe('executeTool - searchFamilyNotes', () => {
    it('returns matched notes as title + snippet pairs', async () => {
      ragService.searchFamilyKnowledge = jest.fn().mockResolvedValue([
        { documentId: 'doc-1', title: 'Sở thích ăn uống của Yến', content: 'Yến thích ăn sườn xào chua ngọt.', chunkIndex: 0, score: 0.82, familyId: 'family-a', sourceType: 'ai_chat_saved' },
      ]);

      const result = await skill.executeTool('searchFamilyNotes', {
        query: 'Yến thích ăn gì',
      }, {
        userId: 'user-1',
        familyId: 'family-a',
        resolvedFamilyId: 'family-a',
        userMessage: 'Yến thích ăn gì',
        intent: 'general_chat',
      } as any);

      expect(ragService.searchFamilyKnowledge).toHaveBeenCalledWith('family-a', 'Yến thích ăn gì', 3);
      expect(result.ok).toBe(true);
      expect(result.data.matches).toEqual([
        { title: 'Sở thích ăn uống của Yến', snippet: 'Yến thích ăn sườn xào chua ngọt.' },
      ]);
    });

    it('returns ok:true with an empty matches list when nothing is found', async () => {
      ragService.searchFamilyKnowledge = jest.fn().mockResolvedValue([]);

      const result = await skill.executeTool('searchFamilyNotes', {
        query: 'mon an yeu thich cua ong noi',
      }, {
        userId: 'user-1',
        familyId: 'family-a',
        resolvedFamilyId: 'family-a',
        userMessage: 'mon an yeu thich cua ong noi',
        intent: 'general_chat',
      } as any);

      expect(result.ok).toBe(true);
      expect(result.data.matches).toEqual([]);
    });

    it('errors when there is no resolved family and no userFamilyIds', async () => {
      const result = await skill.executeTool('searchFamilyNotes', {
        query: 'bat ky cau hoi nao',
      }, {
        userId: 'user-1',
        familyId: 'all',
        userMessage: 'bat ky cau hoi nao',
        intent: 'general_chat',
      } as any);

      expect(result.ok).toBe(false);
    });

    it('errors when there is no resolved family and userFamilyIds is an empty array', async () => {
      ragService.searchFamilyKnowledge = jest.fn();

      const result = await skill.executeTool('searchFamilyNotes', {
        query: 'bat ky cau hoi nao',
      }, {
        userId: 'user-1',
        familyId: 'all',
        userFamilyIds: [],
        userMessage: 'bat ky cau hoi nao',
        intent: 'general_chat',
      } as any);

      expect(result.ok).toBe(false);
      expect(ragService.searchFamilyKnowledge).not.toHaveBeenCalled();
    });

    it('falls back to searching every family in userFamilyIds when no single family is resolved, merging results by score', async () => {
      ragService.searchFamilyKnowledge = jest.fn(async (familyId: string) => {
        if (familyId === 'family-a') {
          return [
            { documentId: 'doc-a1', title: 'Ghi chu A thap', content: 'noi dung a thap', chunkIndex: 0, score: 0.5, familyId: 'family-a', sourceType: 'ai_chat_saved' },
            { documentId: 'doc-a2', title: 'Ghi chu A cao', content: 'noi dung a cao', chunkIndex: 0, score: 0.9, familyId: 'family-a', sourceType: 'ai_chat_saved' },
          ];
        }
        if (familyId === 'family-b') {
          return [
            { documentId: 'doc-b1', title: 'Ghi chu B cao nhat', content: 'noi dung b cao nhat', chunkIndex: 0, score: 0.95, familyId: 'family-b', sourceType: 'ai_chat_saved' },
            { documentId: 'doc-b2', title: 'Ghi chu B thap', content: 'noi dung b thap', chunkIndex: 0, score: 0.3, familyId: 'family-b', sourceType: 'ai_chat_saved' },
          ];
        }
        return [];
      });

      const result = await skill.executeTool('searchFamilyNotes', {
        query: 'sinh nhat',
      }, {
        userId: 'user-1',
        familyId: 'all',
        userFamilyIds: ['family-a', 'family-b'],
        userMessage: 'nha minh co ghi chu gi ve sinh nhat khong',
        intent: 'general_chat',
      } as any);

      expect(ragService.searchFamilyKnowledge).toHaveBeenCalledWith('family-a', 'sinh nhat', 3);
      expect(ragService.searchFamilyKnowledge).toHaveBeenCalledWith('family-b', 'sinh nhat', 3);
      expect(ragService.searchFamilyKnowledge).toHaveBeenCalledTimes(2);

      expect(result.ok).toBe(true);
      // 4 candidates total, capped to 3, sorted by score descending across both families.
      expect(result.data.matches).toEqual([
        { title: 'Ghi chu B cao nhat', snippet: 'noi dung b cao nhat' },
        { title: 'Ghi chu A cao', snippet: 'noi dung a cao' },
        { title: 'Ghi chu A thap', snippet: 'noi dung a thap' },
      ]);
    });

    it('keeps results from families that succeeded when one family search rejects', async () => {
      ragService.searchFamilyKnowledge = jest.fn(async (familyId: string) => {
        if (familyId === 'family-a') {
          throw new Error('transient db error for family-a');
        }
        return [
          { documentId: 'doc-b1', title: 'Ghi chu B', content: 'noi dung b', chunkIndex: 0, score: 0.9, familyId: 'family-b', sourceType: 'ai_chat_saved' },
        ];
      });

      const result = await skill.executeTool('searchFamilyNotes', {
        query: 'sinh nhat',
      }, {
        userId: 'user-1',
        familyId: 'all',
        userFamilyIds: ['family-a', 'family-b'],
        userMessage: 'nha minh co ghi chu gi ve sinh nhat khong',
        intent: 'general_chat',
      } as any);

      expect(result.ok).toBe(true);
      expect(result.data.matches).toEqual([
        { title: 'Ghi chu B', snippet: 'noi dung b' },
      ]);
    });

    it('errors only when every family search rejects', async () => {
      ragService.searchFamilyKnowledge = jest.fn().mockRejectedValue(new Error('db is down'));

      const result = await skill.executeTool('searchFamilyNotes', {
        query: 'sinh nhat',
      }, {
        userId: 'user-1',
        familyId: 'all',
        userFamilyIds: ['family-a', 'family-b'],
        userMessage: 'nha minh co ghi chu gi ve sinh nhat khong',
        intent: 'general_chat',
      } as any);

      expect(result.ok).toBe(false);
    });

    it('prefers the single resolved family and ignores userFamilyIds when both are present (regression)', async () => {
      ragService.searchFamilyKnowledge = jest.fn().mockResolvedValue([
        { documentId: 'doc-1', title: 'Sở thích ăn uống của Yến', content: 'Yến thích ăn sườn xào chua ngọt.', chunkIndex: 0, score: 0.82, familyId: 'family-a', sourceType: 'ai_chat_saved' },
      ]);

      const result = await skill.executeTool('searchFamilyNotes', {
        query: 'Yến thích ăn gì',
      }, {
        userId: 'user-1',
        familyId: 'all',
        resolvedFamilyId: 'family-a',
        userFamilyIds: ['family-a', 'family-b'],
        userMessage: 'Yến thích ăn gì',
        intent: 'general_chat',
      } as any);

      expect(ragService.searchFamilyKnowledge).toHaveBeenCalledTimes(1);
      expect(ragService.searchFamilyKnowledge).toHaveBeenCalledWith('family-a', 'Yến thích ăn gì', 3);
      expect(result.ok).toBe(true);
      expect(result.data.matches).toEqual([
        { title: 'Sở thích ăn uống của Yến', snippet: 'Yến thích ăn sườn xào chua ngọt.' },
      ]);
    });
  });
});
