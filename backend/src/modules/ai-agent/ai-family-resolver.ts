import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from './services/chat.service';
import { RagService } from './services/rag.service';
import { AiSkillContext } from './interfaces/ai-skill.interface';
import { buildMemoryProfileContext, parseMemoryProfile } from './ai-memory-profile';
import { normalizeSearchText } from './ai-intent-router';

type BuildSkillContextInput = {
  familyId: string;
  userMessage: string;
  userId: string;
  intent: string;
  image?: string;
  trace?: any;
  sessionId?: string;
  historyLimit: number;
  source?: 'web' | 'telegram';
};

@Injectable()
export class AiFamilyResolver {
  private readonly logger = new Logger(AiFamilyResolver.name);
  private readonly genericFamilyNames = new Set([
    'gia dinh',
    'family',
    'default family',
    'tat ca gia dinh',
    'all families',
  ]);
  private readonly genericFamilyWords = new Set([
    'gia',
    'dinh',
    'family',
    'families',
    'nha',
    'home',
    'default',
    'tat',
    'ca',
    'all',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly ragService: RagService,
  ) {}

  async buildSkillContext(input: BuildSkillContextInput): Promise<AiSkillContext> {
    const { familyId, userMessage, userId, intent, image, trace, sessionId, historyLimit, source } = input;
    const isFamilyAware = ['general_chat', 'calendar_query', 'event_mutation', 'meal_suggestion', 'horoscope', 'family_knowledge', 'football', 'web_search'].includes(intent);

    const userFamilies = familyId === 'all'
      ? await this.getUserFamilies(userId)
      : [];

    const resolvedFamilyId = await this.resolveFamilyId(familyId, userFamilies, userMessage, sessionId);
    const ragFamilyId = resolvedFamilyId || familyId;

    const [memoryContext, familyRaw, history] = await Promise.all([
      this.getMemoryContext(userId),
      isFamilyAware ? this.getFamilyContext(userId) : Promise.resolve(''),
      this.chatService.getHistory(familyId, sessionId, historyLimit),
    ]);
    const ragQuery = this.buildRagQuery(userMessage, history, Boolean(resolvedFamilyId));
    const shouldRetrieveRag = this.shouldRetrieveRag(intent, ragQuery);
    const ragResults = shouldRetrieveRag
      ? await this.ragService.searchFamilyKnowledge(ragFamilyId, ragQuery, 3)
      : [];

    this.logRagRetrieval(ragQuery, ragFamilyId, shouldRetrieveRag, ragResults);

    const disambiguationNotice = this.buildDisambiguationNotice(familyId, userFamilies, resolvedFamilyId);
    const ragContext = this.ragService.formatRagContext(ragResults);
    const ragFamilyContext = ragContext ? `FAMILY WIKI RETRIEVED CONTEXT:\n${ragContext}` : '';
    const familyContext = [memoryContext, familyRaw, disambiguationNotice, ragFamilyContext].filter(Boolean).join('\n\n');

    return {
      userId,
      familyId,
      resolvedFamilyId,
      userMessage,
      intent,
      image,
      familyContext,
      memoryContext,
      ragContext,
      ragQuery: shouldRetrieveRag ? ragQuery : undefined,
      ragMiss: shouldRetrieveRag && ragResults.length === 0,
      ragSources: this.toRagLogSources(ragResults),
      history,
      trace,
      source,
    };
  }

  private async getUserFamilies(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        familyId: true,
        family: { select: { id: true, name: true } },
        families: { select: { id: true, name: true } },
      },
    });
    const all: { id: string; name: string }[] = [];
    if (user?.family) all.push(user.family);
    for (const family of user?.families || []) {
      if (!all.some((item) => item.id === family.id)) all.push(family);
    }
    return all;
  }

  private async resolveFamilyId(
    familyId: string,
    userFamilies: Array<{ id: string; name: string }>,
    userMessage: string,
    sessionId?: string,
  ) {
    if (familyId !== 'all') return familyId;
    if (userFamilies.length === 1) return userFamilies[0].id;
    if (userFamilies.length <= 1) return undefined;

    const historyMessages = await this.chatService.getHistory(familyId, sessionId, 6);
    const searchText = normalizeSearchText([
      userMessage,
      ...historyMessages.map((message: any) => message.content || ''),
    ].join(' '));

    const matchCandidates = userFamilies
      .map((family) => ({
        family,
        ...this.getFamilyMatchTerms(family.name),
      }))
      .filter((candidate) => !candidate.isGeneric)
      .sort((a, b) => b.normalized.length - a.normalized.length);

    for (const { family, normalized, meaningfulWords } of matchCandidates) {
      if (normalized.length >= 4 && searchText.includes(normalized)) {
        this.logger.debug(`[FamilyResolve] Matched specific family "${family.name}" from message text`);
        return family.id;
      }
      if (meaningfulWords.length > 0 && meaningfulWords.every((word) => searchText.includes(word))) {
        this.logger.debug(`[FamilyResolve] Matched specific family "${family.name}" from word matching`);
        return family.id;
      }
    }

    return undefined;
  }

  private async getFamilyContext(userId: string): Promise<string> {
    if (!userId) return '';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        role: true,
        birthday: true,
        email: true,
        family: {
          include: {
            users: { select: { id: true, name: true, role: true, birthday: true, email: true } },
          },
        },
        families: {
          include: {
            users: { select: { id: true, name: true, role: true, birthday: true, email: true } },
          },
        },
      },
    });
    if (!user) return '';

    const families = [...(user.families || [])];
    if (user.family && !families.some((family) => family.id === user.family?.id)) {
      families.unshift(user.family);
    }

    let ctx = '';
    ctx += `CURRENT LINKED USER: ${user.name} (${user.role || 'Thành viên'}, SN: ${user.birthday?.toISOString().split('T')[0] ?? 'Chưa rõ'})\n`;

    for (const family of families) {
      ctx += `\nGIA ĐÌNH: ${family.name}\n`;
      ctx += family.users.map((u) => `- ${u.name} (${u.role || 'Thành viên'}, SN: ${u.birthday?.toISOString().split('T')[0] ?? 'Chưa rõ'})`).join('\n');
      ctx += '\n';
    }
    return ctx;
  }

  private async getMemoryContext(userId: string): Promise<string> {
    if (!userId) return '';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        notificationSettings: true,
        mealPreferences: {
          include: { meal: true },
        },
      },
    });

    const profile = parseMemoryProfile(user?.notificationSettings);
    const mealLikes = user?.mealPreferences.map((preference) => preference.meal.name) || [];
    const combinedLikes = Array.from(new Set([...(profile.foodLikes || []), ...mealLikes]));

    return buildMemoryProfileContext({
      ...profile,
      foodLikes: combinedLikes,
    });
  }

  private getFamilyMatchTerms(familyName: string) {
    const normalized = normalizeSearchText(familyName || '').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const meaningfulWords = words.filter((word) => word.length > 2 && !this.genericFamilyWords.has(word));

    return {
      normalized,
      meaningfulWords,
      isGeneric: !normalized || this.genericFamilyNames.has(normalized) || meaningfulWords.length === 0,
    };
  }

  private toRagLogSources(results: Array<{
    documentId: string;
    title: string;
    chunkIndex: number;
    score: number;
    familyId?: string;
    sourceType?: string;
    category?: string;
    retrieval?: string;
    content?: string;
  }>) {
    return results.map((result) => ({
      documentId: result.documentId,
      title: result.title,
      chunkIndex: result.chunkIndex,
      score: Number(result.score || 0),
      familyId: result.familyId,
      sourceType: result.sourceType,
      category: result.category,
      retrieval: result.retrieval,
      snippet: String(result.content || '').slice(0, 500),
    }));
  }

  private buildRagQuery(userMessage: string, history: any[], hasResolvedFamily: boolean) {
    const normalized = normalizeSearchText(userMessage || '').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const isLikelyFamilySelection = hasResolvedFamily && words.length > 0 && words.length <= 4 && !/[?？]/.test(userMessage);
    if (!isLikelyFamilySelection) return userMessage;

    const previousUserQuestion = (history || [])
      .filter((message: any) => message?.role === 'user')
      .map((message: any) => String(message.content || '').trim())
      .find((content: string) => content && normalizeSearchText(content) !== normalized);

    return previousUserQuestion ? `${previousUserQuestion}\n${userMessage}` : userMessage;
  }

  private shouldRetrieveRag(intent: string, userMessage: string) {
    if (intent === 'family_knowledge') return true;
    if (intent === 'image_vision' || intent === 'gold_price' || intent === 'football' || intent === 'weather') return false;

    const normalized = normalizeSearchText(userMessage);
    const familySignals = [
      'nha minh',
      'gia dinh minh',
      'so tay',
      'ghi chu',
      'family wiki',
      'wiki gia dinh',
      'thong tin gia dinh',
      'theo nha minh',
      'theo ghi chu',
      'luu ',
      'nho ',
      'long memory',
      'ky niem',
      'save ',
      'remember',
    ];

    const familyPronouns = ['vo', 'chong', 'bo', 'me', 'con', 'anh', 'em', 'ong', 'ba', 'thanh vien', 'nha', 'gia dinh'];
    const hasFamilyPronoun = familyPronouns.some((pronoun) => new RegExp(`\\b${pronoun}\\b`).test(normalized));
    if (hasFamilyPronoun) return true;
    if (familySignals.some((signal) => normalized.includes(signal))) return true;

    const familyFactQuestionSignals = [
      'bao nhieu',
      'la gi',
      'la ngay nao',
      'ngay nao',
      'ngay dau tien',
      'dau tien',
      'yeu nhau',
      'thich gi',
      'so thich',
      'khong thich',
      'di ung',
      'ghet',
    ];
    if (familyFactQuestionSignals.some((signal) => normalized.includes(signal))) return true;

    const suggestionSignals = [
      'goi y',
      'nen',
      'chuan bi',
      'ke hoach',
      'an gi',
      'thuc don',
      'qua tang',
      'sinh nhat',
      'lich hoc',
      'don thuoc',
    ];
    if (['meal_suggestion', 'calendar_query', 'event_mutation', 'horoscope'].includes(intent)) {
      return suggestionSignals.some((signal) => normalized.includes(signal));
    }

    return false;
  }

  private logRagRetrieval(query: string, familyId: string, shouldRetrieve: boolean, ragResults: any[]) {
    if (ragResults.length > 0) {
      this.logger.debug(`[RAG Retrieval] Matched ${ragResults.length} snippets for query "${query}":\n` +
        ragResults.map((result, index) => `  [#${index + 1}] Title: "${result.title}", Chunk: ${result.chunkIndex}, Score: ${result.score.toFixed(3)}, Method: ${result.retrieval}\n      Snippet: ${result.content.substring(0, 150)}...`).join('\n')
      );
    } else if (shouldRetrieve) {
      this.logger.debug(`[RAG Retrieval] No snippets matched query "${query}" for family "${familyId}"`);
    }
  }

  private buildDisambiguationNotice(
    familyId: string,
    userFamilies: Array<{ id: string; name: string }>,
    resolvedFamilyId?: string,
  ) {
    if (familyId === 'all' && userFamilies.length > 1 && !resolvedFamilyId) {
      return `USER IS VIEWING ALL FAMILIES. Their families:\n${userFamilies.map((family, index) => `${index + 1}. ${family.name} (id: ${family.id})`).join('\n')}\nINSTRUCTION: Ask the user ONCE which family to use. When they answer with a family name, call the tool immediately with that family's id — do NOT ask again.`;
    }
    if (resolvedFamilyId) {
      return `RESOLVED FAMILY: Using "${userFamilies.find((family) => family.id === resolvedFamilyId)?.name || resolvedFamilyId}" (id: ${resolvedFamilyId}) for all write operations.`;
    }
    return '';
  }
}
