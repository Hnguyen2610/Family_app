import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeSearchText } from '../ai-intent-router';

type CreateKnowledgeDocumentInput = {
  familyId: string;
  title: string;
  content: string;
  sourceType?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
};

type UpdateKnowledgeDocumentInput = {
  title: string;
  content: string;
  metadata?: Record<string, any>;
};

export type RagSearchResult = {
  documentId: string;
  title: string;
  content: string;
  sourceType: string;
  score: number;
  chunkIndex: number;
  retrieval: 'semantic' | 'lexical';
};

const RAG_CHUNK_SIZE = 1200;
const RAG_CHUNK_OVERLAP = 160;
const RAG_SCAN_LIMIT = 200;
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || 'text-embedding-004';
const EMBEDDING_DIMENSION = Number.parseInt(process.env.AI_EMBEDDING_DIMENSION || '768', 10);
const STOP_WORDS = new Set([
  'anh',
  'ban',
  'biet',
  'cho',
  'cua',
  'gia',
  'gi',
  'hoi',
  'la',
  'minh',
  'nha',
  'noi',
  'the',
  'thong',
  'tin',
  'toi',
  've',
]);

@Injectable()
export class RagService {
  constructor(private readonly prisma: PrismaService) {}

  async createKnowledgeDocument(input: CreateKnowledgeDocumentInput) {
    const content = input.content.trim();
    const chunks = this.chunkText(content);

    const document = await this.prisma.aiDocument.create({
      data: {
        familyId: input.familyId,
        title: input.title.trim(),
        content,
        sourceType: input.sourceType || 'family_wiki',
        createdBy: input.createdBy,
        metadata: input.metadata || {},
        chunks: {
          create: chunks.map((chunk, index) => ({
            familyId: input.familyId,
            content: chunk,
            chunkIndex: index,
            tokenHint: this.estimateTokens(chunk),
            metadata: { retrieval: 'hybrid', embeddingReady: false },
          })),
        },
      },
      include: { chunks: true },
    });

    await this.embedDocumentChunks(document.chunks.map((chunk) => ({ id: chunk.id, content: chunk.content })));
    return this.prisma.aiDocument.findUnique({
      where: { id: document.id },
      include: { chunks: true },
    });
  }

  async listKnowledgeDocuments(familyId: string) {
    return this.prisma.aiDocument.findMany({
      where: { familyId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        sourceType: true,
        createdBy: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { chunks: true } },
      },
    });
  }

  async getKnowledgeDocument(familyId: string, documentId: string) {
    const document = await this.prisma.aiDocument.findFirst({
      where: { id: documentId, familyId },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Knowledge document not found');
    }

    return document;
  }

  async updateKnowledgeDocument(familyId: string, documentId: string, input: UpdateKnowledgeDocumentInput) {
    const existing = await this.prisma.aiDocument.findFirst({
      where: { id: documentId, familyId },
      select: { id: true, metadata: true },
    });

    if (!existing) {
      throw new NotFoundException('Knowledge document not found');
    }

    const content = input.content.trim();
    const chunks = this.chunkText(content);

    const metadata = input.metadata ?? existing.metadata ?? undefined;
    const updateData: any = {
      title: input.title.trim(),
      content,
    };
    if (metadata !== undefined) {
      updateData.metadata = metadata;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.aiDocumentChunk.deleteMany({
        where: { documentId, familyId },
      });

      await tx.aiDocument.update({
        where: { id: documentId },
        data: updateData,
      });

      await tx.aiDocumentChunk.createMany({
        data: chunks.map((chunk, index) => ({
          documentId,
          familyId,
          content: chunk,
          chunkIndex: index,
          tokenHint: this.estimateTokens(chunk),
          metadata: { retrieval: 'hybrid', embeddingReady: false },
        })),
      });
    });

    const document = await this.getKnowledgeDocument(familyId, documentId);
    await this.embedDocumentChunks(document.chunks.map((chunk) => ({ id: chunk.id, content: chunk.content })));
    return this.getKnowledgeDocument(familyId, documentId);
  }

  async deleteKnowledgeDocument(familyId: string, documentId: string) {
    return this.prisma.aiDocument.deleteMany({
      where: { id: documentId, familyId },
    });
  }

  async searchFamilyKnowledge(familyId: string, query: string, limit = 3): Promise<RagSearchResult[]> {
    if (!familyId || !query.trim()) return [];

    const semanticResults = await this.searchSemantic(familyId, query, limit);
    if (semanticResults.length > 0) return semanticResults;

    return this.searchLexical(familyId, query, limit);
  }

  private async searchLexical(familyId: string, query: string, limit = 3): Promise<RagSearchResult[]> {
    const terms = this.extractTerms(query);
    if (terms.length === 0) return [];

    const chunks = await this.prisma.aiDocumentChunk.findMany({
      where: { familyId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            sourceType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: RAG_SCAN_LIMIT,
    });

    return chunks
      .map((chunk) => {
        const score = this.scoreChunk(query, terms, `${chunk.document.title}\n${chunk.content}`);
        return {
          documentId: chunk.document.id,
          title: chunk.document.title,
          content: chunk.content,
          sourceType: chunk.document.sourceType,
          score,
          chunkIndex: chunk.chunkIndex,
          retrieval: 'lexical' as const,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(limit, 5)));
  }

  formatRagContext(results: RagSearchResult[]) {
    if (results.length === 0) return '';

    return results
      .map((result, index) => {
        const source = `${result.title}#${result.chunkIndex + 1} (${result.retrieval})`;
        return `[${index + 1}] Source: ${source}\n${result.content}`;
      })
      .join('\n\n');
  }

  private async searchSemantic(familyId: string, query: string, limit: number): Promise<RagSearchResult[]> {
    const embedding = await this.generateEmbedding(query);
    if (!embedding) return [];

    const vector = this.toVectorLiteral(embedding);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      documentId: string;
      title: string;
      content: string;
      sourceType: string;
      score: number;
      chunkIndex: number;
    }>>(
      `
      SELECT
        d.id AS "documentId",
        d.title,
        c.content,
        d."sourceType",
        (1 - (c.embedding_vector <=> $2::vector))::float AS score,
        c."chunkIndex"
      FROM "AiDocumentChunk" c
      INNER JOIN "AiDocument" d ON d.id = c."documentId"
      WHERE c."familyId" = $1
        AND c.embedding_vector IS NOT NULL
      ORDER BY c.embedding_vector <=> $2::vector
      LIMIT $3
      `,
      familyId,
      vector,
      Math.max(1, Math.min(limit, 5)),
    );

    return rows.map((row) => ({ ...row, retrieval: 'semantic' as const }));
  }

  private async embedDocumentChunks(chunks: Array<{ id: string; content: string }>) {
    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.content);
      if (!embedding) continue;

      const vector = this.toVectorLiteral(embedding);
      await this.prisma.$executeRawUnsafe(
        `
        UPDATE "AiDocumentChunk"
        SET embedding = $2::jsonb,
            embedding_vector = $3::vector,
            metadata = jsonb_set(COALESCE(metadata::jsonb, '{}'::jsonb), '{embeddingReady}', 'true'::jsonb, true)
        WHERE id = $1
        `,
        chunk.id,
        JSON.stringify(embedding),
        vector,
      );
    }
  }

  private async generateEmbedding(text: string): Promise<number[] | undefined> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return undefined;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
          }),
        },
      );

      if (!response.ok) return undefined;
      const data = await response.json() as { embedding?: { values?: number[] } };
      const values = data.embedding?.values;
      if (!values || values.length !== EMBEDDING_DIMENSION) return undefined;
      return values;
    } catch {
      return undefined;
    }
  }

  private toVectorLiteral(values: number[]) {
    return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
  }

  private chunkText(text: string) {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    if (normalized.length <= RAG_CHUNK_SIZE) return [normalized];

    const chunks: string[] = [];
    let start = 0;

    while (start < normalized.length) {
      const hardEnd = Math.min(start + RAG_CHUNK_SIZE, normalized.length);
      let end = hardEnd;

      const paragraphBreak = normalized.lastIndexOf('\n\n', hardEnd);
      if (paragraphBreak > start + RAG_CHUNK_SIZE * 0.55) {
        end = paragraphBreak;
      } else {
        const sentenceBreak = normalized.lastIndexOf('.', hardEnd);
        if (sentenceBreak > start + RAG_CHUNK_SIZE * 0.55) {
          end = sentenceBreak + 1;
        }
      }

      const chunk = normalized.slice(start, end).trim();
      if (chunk) chunks.push(chunk);

      if (end >= normalized.length) break;
      start = Math.max(0, end - RAG_CHUNK_OVERLAP);
    }

    return chunks;
  }

  private extractTerms(text: string) {
    return Array.from(new Set(
      normalizeSearchText(text)
        .split(/[^a-z0-9]+/g)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2 && !STOP_WORDS.has(term)),
    ));
  }

  private scoreChunk(query: string, terms: string[], candidate: string) {
    const normalizedCandidate = normalizeSearchText(candidate);
    const normalizedQuery = normalizeSearchText(query).trim();
    let score = normalizedCandidate.includes(normalizedQuery) ? 8 : 0;

    for (const term of terms) {
      let index = normalizedCandidate.indexOf(term);
      while (index !== -1) {
        score += term.length >= 5 ? 2 : 1;
        index = normalizedCandidate.indexOf(term, index + term.length);
      }
    }

    return score;
  }

  private estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
  }
}
