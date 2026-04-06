import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiAgentService } from '../../ai-agent/services/ai-agent.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CreateTransactionDto, UpdateBudgetDto } from '../dto/finance.dto';
import { TransactionType, TransactionCategory } from '@prisma/client';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAgentService: AiAgentService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Get or initialize budget for the current month
   */
  async getOrCreateBudget(userId: string) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    let budget = await this.prisma.budget.findUnique({
      where: {
        userId_month_year: { userId, month, year },
      },
    });

    if (!budget) {
      budget = await this.prisma.budget.create({
        data: {
          userId,
          month,
          year,
          monthlyIncome: 0,
          dailyBudget: 0,
        },
      });
    }

    return budget;
  }

  /**
   * Update monthly income and recalculate daily budget
   */
  async updateBudget(userId: string, dto: UpdateBudgetDto) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const daysInMonth = new Date(year, month, 0).getDate();

    const dailyBudget = dto.monthlyIncome / daysInMonth;

    return this.prisma.budget.upsert({
      where: {
        userId_month_year: { userId, month, year },
      },
      update: {
        monthlyIncome: dto.monthlyIncome,
        dailyBudget,
      },
      create: {
        userId,
        month,
        year,
        monthlyIncome: dto.monthlyIncome,
        dailyBudget,
      },
    });
  }

  /**
   * Record a new transaction and check for overspending
   */
  async addTransaction(userId: string, dto: CreateTransactionDto) {
    // 1. AI Categorization if description is provided and category is not set
    let category = dto.category || TransactionCategory.OTHER;
    let type = dto.type;

    if (dto.description && (!dto.category || dto.category === TransactionCategory.OTHER)) {
      try {
        const aiResult = await this.aiAgentService.categorizeTransaction(dto.description);
        category = aiResult.category as TransactionCategory;
        
        // Only override type if it was not explicitly provided (e.g. if it's default OTHER or undefined)
        // For bank transactions, type is usually determined by amount (+/-), which is more reliable.
        if (!type || type === 'OTHER' as any) {
          type = aiResult.type as TransactionType;
        }
      } catch (e) {
        this.logger.error('Failed to categorize transaction via AI', e);
      }
    }

    // 2. Save transaction
    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        amount: dto.amount,
        type,
        category,
        description: dto.description,
        reference: dto.reference,
        paymentId: dto.paymentId,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });

    // 3. Handle Salary 自動
    if (category === TransactionCategory.SALARY || category === TransactionCategory.BONUS) {
      await this.updateBudget(userId, { monthlyIncome: dto.amount });
    }

    // 4. Check for overspending if it's an expense
    if (type === TransactionType.EXPENSE) {
      await this.checkOverspending(userId);
    }

    return transaction;
  }

  /**
   * Get daily statistics: spent today vs daily budget
   */
  async getDailyStats(userId: string) {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));

    const budget = await this.getOrCreateBudget(userId);
    
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const totalSpentToday = transactions.reduce((sum, t) => sum + t.amount, 0);
    const balance = budget.dailyBudget - totalSpentToday;

    return {
      dailyBudget: budget.dailyBudget,
      totalSpentToday,
      balance,
      isOverspent: balance < 0,
    };
  }

  /**
   * Get recent transactions for a user
   */
  async getRecentTransactions(userId: string, limit: number = 20) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  /**
   * Private: Check if user has exceeded their daily budget and notify
   */
  private async checkOverspending(userId: string) {
    const stats = await this.getDailyStats(userId);
    if (stats.isOverspent) {
      await this.notificationsService.createNotification(userId, {
        type: 'BUDGET_EXCEEDED',
        title: '⚠️ Cảnh báo chi tiêu',
        message: `Bạn đã tiêu quá định mức ngày hôm nay ${Math.abs(stats.balance).toLocaleString('vi-VN')}đ. Hãy cân đối lại nhé!`,
        metadata: { path: '/finance' },
      });
    }
  }
}
