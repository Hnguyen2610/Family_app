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
  async updateBudget(userId: string, dto: UpdateBudgetDto, isIncrement: boolean = false) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const daysInMonth = new Date(year, month, 0).getDate();

    const budget = await this.getOrCreateBudget(userId);
    const newMonthlyIncome = isIncrement ? budget.monthlyIncome + dto.monthlyIncome : dto.monthlyIncome;
    const dailyBudget = newMonthlyIncome / daysInMonth;

    return this.prisma.budget.update({
      where: { id: budget.id },
      data: {
        monthlyIncome: newMonthlyIncome,
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

    // 3. Handle Salary 自動 (Incremental)
    if (category === TransactionCategory.SALARY || category === TransactionCategory.BONUS) {
      await this.updateBudget(userId, { monthlyIncome: dto.amount }, true);
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
   * Update an existing transaction and sync budget if needed
   */
  async updateTransaction(userId: string, id: string, dto: CreateTransactionDto) {
    const oldTx = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });

    if (!oldTx) throw new Error('Transaction not found');

    // 1. Calculate budget impact if it's income related
    const isOldIncome = oldTx.category === TransactionCategory.SALARY || oldTx.category === TransactionCategory.BONUS;
    const isNewIncome = dto.category === TransactionCategory.SALARY || dto.category === TransactionCategory.BONUS;

    if (isOldIncome || isNewIncome) {
      const budget = await this.getOrCreateBudget(userId);
      let incomeDiff = 0;

      if (isOldIncome) incomeDiff -= oldTx.amount;
      if (isNewIncome) incomeDiff += dto.amount;

      if (incomeDiff !== 0) {
        await this.updateBudget(userId, { monthlyIncome: incomeDiff }, true);
      }
    }

    // 2. Update transaction
    const transaction = await this.prisma.transaction.update({
      where: { id },
      data: {
        amount: dto.amount,
        type: dto.type,
        category: dto.category,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : oldTx.date,
      },
    });

    // 3. Re-check overspending if it's an expense
    if (transaction.type === TransactionType.EXPENSE) {
      await this.checkOverspending(userId);
    }

    return transaction;
  }

  /**
   * Delete a transaction and sync budget if needed
   */
  async deleteTransaction(userId: string, id: string) {
    const oldTx = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });

    if (!oldTx) throw new Error('Transaction not found');

    // 1. Revert budget if it was income
    if (oldTx.category === TransactionCategory.SALARY || oldTx.category === TransactionCategory.BONUS) {
      await this.updateBudget(userId, { monthlyIncome: -oldTx.amount }, true);
    }

    // 2. Delete
    return this.prisma.transaction.delete({
      where: { id },
    });
  }

  /**
   * Generate monthly report data for a user
   */
  async getMonthlyReportData(userId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const incomeTxs = transactions.filter(t => t.type === TransactionType.INCOME);
    const expenseTxs = transactions.filter(t => t.type === TransactionType.EXPENSE);

    const totalIncome = incomeTxs.reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = expenseTxs.reduce((sum, t) => sum + t.amount, 0);

    // Group by category
    const categoryTotals: Record<string, number> = {};
    expenseTxs.forEach(t => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    const categories = Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // Top transactions
    const topExpenses = [...expenseTxs]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      month,
      year,
      totalIncome,
      totalExpense,
      netSavings: totalIncome - totalExpense,
      categories,
      topExpenses,
      transactionCount: transactions.length
    };
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
