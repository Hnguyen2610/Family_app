import { Controller, Get, Post, Put, Delete, Body, Query, Param, Headers, UnauthorizedException, Logger, UseGuards, Request } from '@nestjs/common';
import { FinanceService } from './services/finance.service';
import { CreateTransactionDto, UpdateBudgetDto } from './dto/finance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/finance')
export class FinanceController {
  private readonly logger = new Logger(FinanceController.name);

  constructor(private readonly financeService: FinanceService) {}

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getDailyStatus(@Request() req: any) {
    return this.financeService.getDailyStats(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('transactions')
  async getTransactions(@Request() req: any, @Query('limit') limit?: number) {
    return this.financeService.getRecentTransactions(req.user.id, limit);
  }

  @UseGuards(JwtAuthGuard)
  @Get('report')
  async getMonthlyReport(@Request() req: any, @Query('month') month?: number, @Query('year') year?: number) {
    const now = new Date();
    return this.financeService.getMonthlyReportData(
      req.user.id, 
      month || (now.getMonth() + 1), 
      year || now.getFullYear()
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put('budget')
  async updateBudget(@Request() req: any, @Body() dto: UpdateBudgetDto) {
    return this.financeService.updateBudget(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('transaction')
  async manualTransaction(@Request() req: any, @Body() dto: CreateTransactionDto) {
    return this.financeService.addTransaction(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('transaction/:id')
  async updateTransaction(@Request() req: any, @Param('id') id: string, @Body() dto: CreateTransactionDto) {
    return this.financeService.updateTransaction(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('transaction/:id')
  async deleteTransaction(@Request() req: any, @Param('id') id: string) {
    return this.financeService.deleteTransaction(req.user.id, id);
  }

  /**
   * PayOS Webhook - This handles incoming transaction notifications from the bank via PayOS
   */
  @Post('webhook/payos')
  async handlePayOSWebhook(
    @Body() body: any,
    @Headers('x-api-key') apiKey: string // Simplified webhook auth for now
  ) {
    // 1. Verify the signature/API key (simplified)
    const expectedKey = process.env.PAYOS_WEBHOOK_SECRET || 'family-payos-secret-2026';
    if (apiKey !== expectedKey) {
      this.logger.warn('Unauthorized PayOS Webhook attempt');
      throw new UnauthorizedException('Invalid PayOS secret');
    }

    this.logger.log(`Received PayOS Webhook: ${JSON.stringify(body)}`);

    // 2. Extract transaction details from PayOS body
    // PayOS usually sends data in body.data: { amount, description, reference, orderCode... }
    const txData = body.data;
    if (!txData) return { success: false };

    // 3. For this individual project, we link it to the primary user
    // In a multi-user family app, we'd need to map the bank account/reference to the specific user
    // For now, we fetch the SUPER_ADMIN or the user who linked this PayOS account
    // For manual/test purposes, we'll assume a specific userID or the one provided in metadata
    const userId = body.metadata?.userId || 'clz...'; // We'd specify this when generating the PayOS link

    return this.financeService.addTransaction(userId, {
      amount: txData.amount,
      type: txData.amount > 0 ? 'INCOME' as any : 'EXPENSE' as any,
      description: txData.description,
      reference: txData.reference,
      paymentId: txData.paymentId,
      date: txData.when || new Date().toISOString(),
    });
  }
}
