import { RagService, RagSearchResult } from './rag.service';

function makeResult(overrides: Partial<RagSearchResult>): RagSearchResult {
  return {
    documentId: 'doc-1',
    title: 'Note',
    content: 'content',
    familyId: 'family-1',
    sourceType: 'family_wiki',
    score: 1,
    chunkIndex: 0,
    retrieval: 'semantic',
    ...overrides,
  };
}

describe('RagService.fuseWithRrf', () => {
  let service: RagService;

  beforeEach(() => {
    service = new RagService({} as any, {} as any);
  });

  it('gộp cùng 1 chunk xuất hiện ở cả 2 danh sách thành 1 kết quả với điểm cộng dồn', () => {
    const semantic = [makeResult({ documentId: 'doc-1', chunkIndex: 0, retrieval: 'semantic' })];
    const lexical = [makeResult({ documentId: 'doc-1', chunkIndex: 0, retrieval: 'lexical' })];

    const fused = (service as any).fuseWithRrf(semantic, lexical);

    expect(fused).toHaveLength(1);
    expect(fused[0].documentId).toBe('doc-1');
    expect(fused[0].chunkIndex).toBe(0);
  });

  it('chunk chỉ xuất hiện ở lexical vẫn được giữ lại dù semantic rỗng', () => {
    const fused = (service as any).fuseWithRrf([], [makeResult({ documentId: 'doc-2', chunkIndex: 1 })]);

    expect(fused).toHaveLength(1);
    expect(fused[0].documentId).toBe('doc-2');
  });

  it('chunk xuất hiện ở cả 2 danh sách được xếp hạng cao hơn chunk chỉ xuất hiện ở 1 danh sách', () => {
    const bothListsChunk = makeResult({ documentId: 'doc-shared', chunkIndex: 0 });
    const semanticOnlyChunk = makeResult({ documentId: 'doc-semantic-only', chunkIndex: 0 });
    const lexicalOnlyChunk = makeResult({ documentId: 'doc-lexical-only', chunkIndex: 0 });

    const fused = (service as any).fuseWithRrf(
      [semanticOnlyChunk, bothListsChunk],
      [lexicalOnlyChunk, bothListsChunk],
    );

    expect(fused[0].documentId).toBe('doc-shared');
  });
});

describe('RagService.rerankWithLlm', () => {
  let service: RagService;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    const modelClients = { openai: { chat: { completions: { create: mockCreate } } } };
    service = new RagService({} as any, modelClients as any);
  });

  it('sắp xếp lại theo thứ tự order trả về từ LLM', async () => {
    const candidates = [
      makeResult({ documentId: 'doc-a', title: 'A' }),
      makeResult({ documentId: 'doc-b', title: 'B' }),
      makeResult({ documentId: 'doc-c', title: 'C' }),
    ];
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ order: [2, 0, 1] }) } }],
    });

    const reranked = await (service as any).rerankWithLlm('câu hỏi', candidates);

    expect(reranked.map((r: RagSearchResult) => r.documentId)).toEqual(['doc-c', 'doc-a', 'doc-b']);
  });

  it('giữ nguyên thứ tự fused khi LLM trả JSON không hợp lệ', async () => {
    const candidates = [makeResult({ documentId: 'doc-a' }), makeResult({ documentId: 'doc-b' })];
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });

    const reranked = await (service as any).rerankWithLlm('câu hỏi', candidates);

    expect(reranked).toEqual(candidates);
  });

  it('giữ nguyên thứ tự fused khi lời gọi LLM ném lỗi', async () => {
    const candidates = [makeResult({ documentId: 'doc-a' }), makeResult({ documentId: 'doc-b' })];
    mockCreate.mockRejectedValue(new Error('network down'));

    const reranked = await (service as any).rerankWithLlm('câu hỏi', candidates);

    expect(reranked).toEqual(candidates);
  });

  it('bỏ qua các index không hợp lệ/trùng lặp, phần còn thiếu được nối thêm theo thứ tự fused ban đầu', async () => {
    const candidates = [
      makeResult({ documentId: 'doc-a' }),
      makeResult({ documentId: 'doc-b' }),
      makeResult({ documentId: 'doc-c' }),
    ];
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ order: [1, 1, 99] }) } }],
    });

    const reranked = await (service as any).rerankWithLlm('câu hỏi', candidates);

    expect(reranked.map((r: RagSearchResult) => r.documentId)).toEqual(['doc-b', 'doc-a', 'doc-c']);
  });

  it('trả về nguyên candidates khi có 1 hoặc 0 phần tử, không gọi LLM', async () => {
    const candidates = [makeResult({ documentId: 'doc-a' })];

    const reranked = await (service as any).rerankWithLlm('câu hỏi', candidates);

    expect(reranked).toEqual(candidates);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('RagService.searchFamilyKnowledge (hybrid)', () => {
  it('vẫn trả kết quả lexical dù semantic đã có 1 match yếu — hành vi khác với waterfall cũ (semantic có kết quả thì bỏ qua lexical)', async () => {
    const service = new RagService({} as any, { openai: { chat: { completions: { create: jest.fn() } } } } as any);

    const weakSemanticMatch = makeResult({ documentId: 'doc-semantic', chunkIndex: 0, retrieval: 'semantic', score: 0.66 });
    const strongLexicalMatch = makeResult({ documentId: 'doc-lexical', chunkIndex: 0, retrieval: 'lexical', score: 12 });

    jest.spyOn(service as any, 'searchSemantic').mockResolvedValue([weakSemanticMatch]);
    jest.spyOn(service as any, 'searchLexical').mockResolvedValue([strongLexicalMatch]);
    jest.spyOn(service as any, 'rerankWithLlm').mockImplementation((async (_q: string, candidates: RagSearchResult[]) => candidates) as any);

    const results = await service.searchFamilyKnowledge('family-1', 'câu hỏi', 3);

    expect(results.map((r) => r.documentId)).toEqual(expect.arrayContaining(['doc-semantic', 'doc-lexical']));
  });

  it('trả về mảng rỗng và không gọi rerank khi cả semantic và lexical đều rỗng', async () => {
    const service = new RagService(
      { aiDocument: { count: jest.fn().mockResolvedValue(0) }, aiDocumentChunk: { count: jest.fn().mockResolvedValue(0) } } as any,
      {} as any,
    );

    jest.spyOn(service as any, 'searchSemantic').mockResolvedValue([]);
    jest.spyOn(service as any, 'searchLexical').mockResolvedValue([]);
    const rerankSpy = jest.spyOn(service as any, 'rerankWithLlm');

    const results = await service.searchFamilyKnowledge('family-1', 'câu hỏi', 3);

    expect(results).toEqual([]);
    expect(rerankSpy).not.toHaveBeenCalled();
  });

  it('score trả về giảm dần đúng theo thứ tự rerank, để downstream sort-by-score không đảo lại thứ tự RRF', async () => {
    const service = new RagService({} as any, { openai: { chat: { completions: { create: jest.fn() } } } } as any);

    // RRF fused order would normally put doc-a first (highest fused score),
    // but the LLM reranker decides doc-c is most relevant, then doc-a, then doc-b.
    const docA = makeResult({ documentId: 'doc-a', chunkIndex: 0, score: 0.9 });
    const docB = makeResult({ documentId: 'doc-b', chunkIndex: 0, score: 0.5 });
    const docC = makeResult({ documentId: 'doc-c', chunkIndex: 0, score: 0.1 });

    jest.spyOn(service as any, 'searchSemantic').mockResolvedValue([docA, docB, docC]);
    jest.spyOn(service as any, 'searchLexical').mockResolvedValue([]);
    // Simulate rerankWithLlm reordering candidates to [doc-c, doc-a, doc-b]
    // regardless of their incoming (fused) score.
    jest.spyOn(service as any, 'rerankWithLlm').mockImplementation((async (_q: string, candidates: RagSearchResult[]) => {
      const byId = new Map(candidates.map((c) => [c.documentId, c]));
      return ['doc-c', 'doc-a', 'doc-b'].map((id) => byId.get(id)!);
    }) as any);

    const results = await service.searchFamilyKnowledge('family-1', 'câu hỏi', 3);

    expect(results.map((r) => r.documentId)).toEqual(['doc-c', 'doc-a', 'doc-b']);

    // The key requirement: scores are strictly decreasing in the same order
    // the reranked array has them, so a naive `sort by score descending`
    // downstream (as family-knowledge.skill.ts does) reproduces this exact order.
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThan(results[i + 1].score);
    }
    const sortedByScoreDesc = [...results].sort((a, b) => Number(b.score) - Number(a.score));
    expect(sortedByScoreDesc.map((r) => r.documentId)).toEqual(['doc-c', 'doc-a', 'doc-b']);
  });

  it('searchLexical lỗi không làm hỏng toàn bộ tìm kiếm khi searchSemantic thành công', async () => {
    const service = new RagService({} as any, { openai: { chat: { completions: { create: jest.fn() } } } } as any);

    const semanticMatch = makeResult({ documentId: 'doc-semantic', chunkIndex: 0, retrieval: 'semantic' });

    jest.spyOn(service as any, 'searchSemantic').mockResolvedValue([semanticMatch]);
    jest.spyOn(service as any, 'rerankWithLlm').mockImplementation((async (_q: string, candidates: RagSearchResult[]) => candidates) as any);

    // searchLexical's own try/catch should swallow this and return [] rather
    // than letting Promise.all in searchFamilyKnowledge reject.
    (service as any).prisma = {
      aiDocumentChunk: {
        findMany: jest.fn().mockRejectedValue(new Error('db exploded')),
      },
    };

    const results = await service.searchFamilyKnowledge('family-1', 'câu hỏi', 3);

    expect(results.map((r) => r.documentId)).toEqual(['doc-semantic']);
  });
});

describe('RagService.generateEmbedding timeout', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('không treo vô thời hạn khi Gemini API không phản hồi, mà tự hủy sau timeout và trả về undefined', async () => {
    global.fetch = jest.fn((_url: any, options: any) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const err: any = new Error('This operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as any;

    const service = new RagService({} as any, {} as any);

    const resultPromise = (service as any).generateEmbedding('nội dung cần tạo embedding');
    await jest.advanceTimersByTimeAsync(20000);
    const result = await resultPromise;

    expect(result).toBeUndefined();
  });
});

describe('RagService.backfillMissingEmbeddings', () => {
  it('lấy các chunk chưa có embedding_vector và gọi lại embedDocumentChunks, trả về số lượng đã xử lý', async () => {
    const service = new RagService({} as any, {} as any);
    const pendingChunks = [
      { id: 'chunk-1', content: 'nội dung 1' },
      { id: 'chunk-2', content: 'nội dung 2' },
    ];
    const queryRawUnsafe = jest.fn().mockResolvedValue(pendingChunks);
    (service as any).prisma = { $queryRawUnsafe: queryRawUnsafe };
    const embedSpy = jest.spyOn(service as any, 'embedDocumentChunks').mockResolvedValue(undefined);

    const result = await service.backfillMissingEmbeddings(50);

    expect(queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('embedding_vector IS NULL'), 50);
    expect(embedSpy).toHaveBeenCalledWith(pendingChunks);
    expect(result).toEqual({ processed: 2 });
  });

  it('không gọi embedDocumentChunks khi không còn chunk nào thiếu embedding', async () => {
    const service = new RagService({} as any, {} as any);
    (service as any).prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const embedSpy = jest.spyOn(service as any, 'embedDocumentChunks').mockResolvedValue(undefined);

    const result = await service.backfillMissingEmbeddings();

    expect(embedSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0 });
  });
});
