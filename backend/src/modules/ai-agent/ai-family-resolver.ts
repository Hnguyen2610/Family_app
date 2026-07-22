import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from './services/chat.service';
import { RagService } from './services/rag.service';
import { AiSkillContext } from './interfaces/ai-skill.interface';
import { AiConversationStateService } from './services/ai-conversation-state.service';
import { buildMemoryProfileContext, parseMemoryProfile, toStringList } from './ai-memory-profile';
import { normalizeSearchText } from './ai-intent-router';
import { buildFamilyScopeNotice, resolveFamilyMode } from './ai-family-scope-policy';

type BuildSkillContextInput = {
  familyId: string;
  userMessage: string;
  userId: string;
  intent: string;
  image?: string;
  trace?: any;
  sessionId?: string;
  historyLimit: number;
  source?: 'web' | 'telegram' | 'telegram_group' | 'telegram_private';
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
    private readonly conversationState: AiConversationStateService,
  ) {}

  async buildSkillContext(input: BuildSkillContextInput): Promise<AiSkillContext> {
    const { familyId, userMessage, userId, intent, image, trace, sessionId, historyLimit, source } = input;

    const userFamilies = familyId === 'all'
      ? await this.getUserFamilies(userId)
      : [];

    const state = familyId === 'all' ? await this.conversationState.getState(userId) : null;
    const resolvedFamilyId = await this.resolveFamilyId(familyId, userFamilies, userMessage, intent, sessionId, userId, state?.lastSelectedFamilyId);
    const resolvedFamilyMode = resolveFamilyMode({ familyId, resolvedFamilyId, source });

    const [memoryContext, familyRaw, history] = await Promise.all([
      this.getMemoryContext(userId),
      this.getFamilyContext(userId),
      this.chatService.getHistory(familyId, sessionId, historyLimit),
    ]);
    const disambiguationNotice = buildFamilyScopeNotice({ familyId, families: userFamilies, resolvedFamilyId });
    const familyContext = [memoryContext, familyRaw, disambiguationNotice].filter(Boolean).join('\n\n');

    return {
      userId,
      familyId,
      resolvedFamilyId,
      resolvedFamilyMode,
      userFamilyIds: userFamilies.map((family) => family.id),
      userMessage,
      intent,
      image,
      familyContext,
      memoryContext,
      ragContext: '',
      ragQuery: undefined,
      ragMiss: false,
      ragSources: [],
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
    intent: string,
    sessionId?: string,
    userId?: string,
    stateFamilyId?: string,
  ) {
    if (familyId !== 'all') return familyId;
    if (userFamilies.length === 1) return userFamilies[0].id;
    if (userFamilies.length <= 1) return undefined;

    // Check if the user message contains explicit naming first
    const explicitMatchId = await this.findExplicitFamilyMatch(userFamilies, userMessage);
    if (explicitMatchId) return explicitMatchId;

    // Fall back to conversation state's lastSelectedFamilyId
    if (stateFamilyId && userFamilies.some(f => f.id === stateFamilyId)) {
      this.logger.debug(`[FamilyResolve] Reused lastSelectedFamilyId from conversation state: ${stateFamilyId}`);
      return stateFamilyId;
    }

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

  private async findExplicitFamilyMatch(
    userFamilies: Array<{ id: string; name: string }>,
    userMessage: string,
  ): Promise<string | undefined> {
    const searchText = normalizeSearchText(userMessage);
    const Candidates = userFamilies
      .map((family) => ({
        family,
        ...this.getFamilyMatchTerms(family.name),
      }))
      .filter((candidate) => !candidate.isGeneric)
      .sort((a, b) => b.normalized.length - a.normalized.length);

    for (const { family, normalized, meaningfulWords } of Candidates) {
      if (normalized.length >= 4 && searchText.includes(normalized)) {
        return family.id;
      }
      if (meaningfulWords.length > 0 && meaningfulWords.every((word) => searchText.includes(word))) {
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
        foodLikes: true,
        foodDislikes: true,
        healthRestrictions: true,
        dailyRoutine: true,
        aiProfileNotes: true,
      },
    });

    const dbFoodLikes = toStringList(user?.foodLikes) || [];
    const dbFoodDislikes = toStringList(user?.foodDislikes) || [];
    const dbHealthRestrictions = toStringList(user?.healthRestrictions) || [];

    const profile = parseMemoryProfile(user?.notificationSettings);
    const mealLikes = user?.mealPreferences.map((preference) => preference.meal.name) || [];
    const combinedLikes = Array.from(new Set([...(profile.foodLikes || []), ...dbFoodLikes, ...mealLikes]));
    const combinedDislikes = Array.from(new Set([...(profile.foodDislikes || []), ...dbFoodDislikes]));
    const combinedRestrictions = Array.from(new Set([...(profile.healthRestrictions || []), ...dbHealthRestrictions]));
    const combinedNote = [profile.note, user?.aiProfileNotes].filter(Boolean).join('; ') || undefined;

    return buildMemoryProfileContext({
      ...profile,
      foodLikes: combinedLikes,
      foodDislikes: combinedDislikes,
      healthRestrictions: combinedRestrictions,
      dailyRoutine: user?.dailyRoutine || undefined,
      note: combinedNote,
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
}
