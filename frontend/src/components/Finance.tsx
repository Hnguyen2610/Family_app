'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { FiSettings, FiArrowUpRight, FiActivity, FiTrendingUp, FiCreditCard, FiTrash2, FiEdit2, FiInfo, FiSmartphone, FiCalendar, FiBriefcase, FiShoppingBag, FiTruck, FiCoffee, FiHome, FiMusic, FiHeart, FiBookOpen, FiGift, FiLayers, FiX } from 'react-icons/fi';
import api from '@/lib/api-client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatCurrency } from '@/utils/format';

interface Transaction {
  id: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  description: string;
  date: string;
}

interface FinanceStatus {
  dailyBudget: number;
  totalSpentToday: number;
  balance: number;
  isOverspent: boolean;
}

interface MonthlyReport {
  month: number;
  year: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  categories: {
    category: string;
    amount: number;
    percentage: number;
  }[];
  transactionCount: number;
}

export default function Finance() {
  const { t, language } = useTranslation();
  const [status, setStatus] = useState<FinanceStatus | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [newMonthlyIncome, setNewMonthlyIncome] = useState('');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditingTransaction, setIsEditingTransaction] = useState(false);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [isViewingReport, setIsViewingReport] = useState(false);

  const fetchData = async () => {
    try {
      const [statusRes, txRes, reportRes] = await Promise.all([
        api.get('/api/finance/status'),
        api.get('/api/finance/transactions?limit=10'),
        api.get('/api/finance/report')
      ]);
      setStatus(statusRes.data);
      setTransactions(txRes.data);
      setMonthlyReport(reportRes.data);
    } catch (error) {
      console.error('Failed to fetch finance data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateBudget = async () => {
    try {
      await api.put('/api/finance/budget', { monthlyIncome: Number(newMonthlyIncome) });
      setIsEditingBudget(false);
      fetchData();
    } catch (error) {
      alert('Lỗi khi cập nhật ngân sách');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa giao dịch này?')) return;
    try {
      await api.delete(`/api/finance/transaction/${id}`);
      fetchData();
    } catch (error) {
      alert('Lỗi khi xóa giao dịch');
    }
  };

  const handleUpdateTransaction = async () => {
    if (!editingTransaction) return;
    try {
      await api.put(`/api/finance/transaction/${editingTransaction.id}`, editingTransaction);
      setIsEditingTransaction(false);
      fetchData();
    } catch (error) {
      alert('Lỗi khi cập nhật giao dịch');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-bold text-xs animate-pulse">Syncing data...</p>
      </div>
    );
  }

  const percentSpent = status ? (status.totalSpentToday / (status.dailyBudget || 1)) * 100 : 0;
  const isOver = status?.isOverspent;

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-md text-xs font-bold border border-primary/20 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            {t('finance.title')} Dashboard
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 pb-4 leading-[1.2]">
            {t('finance.title')} <span className="text-primary">{t('finance.subtitle')}</span>
          </h2>
          <p className="text-slate-500 mt-2 font-medium">{t('finance.desc')}</p>
        </div>
        <button
          onClick={() => setIsEditingBudget(true)}
          className="btn-primary flex items-center gap-2 group"
        >
          <FiSettings className="group-hover:rotate-90 transition-transform duration-500" />
          {t('nav.settings')}
        </button>
      </div>

      {/* Daily Progress Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className={`col-span-1 lg:col-span-2 rounded-2xl border border-border bg-card shadow-sm p-8 md:p-10 border transition-all duration-500 ${isOver ? 'border-rose-500/30 bg-rose-500/5' : 'border-black/5 dark:border-white/5 bg-slate-100/40 dark:bg-slate-900/40'}`}>
          <div className="flex flex-col md:flex-row items-center gap-12">
            {/* Circular Progress */}
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="96" cy="96" r="88"
                  className="stroke-slate-200 dark:stroke-slate-800 fill-none"
                  strokeWidth="6"
                />
                <circle
                  cx="96" cy="96" r="88"
                  className={`fill-none transition-all duration-300 ease-out ${isOver ? 'stroke-rose-500' : 'stroke-primary'}`}
                  strokeWidth="6"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - Math.min(percentSpent, 100) / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xs font-bold text-slate-500 mb-1">{t('finance.remaining')}</span>
                <span className={`text-2xl font-bold tracking-tight ${isOver ? 'text-rose-500' : 'text-primary'}`}>
                  {formatCurrency(status?.balance || 0)}
                </span>
              </div>
            </div>

            {/* Stats info */}
            <div className="flex-1 space-y-8 w-full text-center md:text-left">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-500 ">{t('finance.dailyBudget')}</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(status?.dailyBudget || 0)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-500 ">{t('finance.spentToday')}</p>
                  <p className={`text-xl font-bold ${isOver ? 'text-rose-500' : 'text-slate-900 dark:text-slate-100'}`}>
                    {formatCurrency(status?.totalSpentToday || 0)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold text-slate-500 ">
                  <span>Usage Intensity</span>
                  <span className={isOver ? 'text-rose-500' : 'text-primary'}>{Math.round(percentSpent)}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${isOver ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-primary shadow-[0_0_10px_rgba(14,165,233,0.5)]'}`}
                    style={{ width: `${Math.min(percentSpent, 100)}%` }}
                  />
                </div>
                {isOver && (
                  <div className="flex items-center gap-2 text-xs text-rose-500 font-bold animate-pulse pt-1">
                    <FiInfo />
                    Alert: Current spending exceeds dynamic allocation
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AI Insight Card */}
        <div className="rounded-2xl border border-primary/20 bg-card shadow-sm p-8 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <FiActivity size={120} />
          </div>
          <div className="space-y-6 relative z-10">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
              <FiTrendingUp size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight mb-2">{t('finance.insight')}</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                {isOver
                  ? (language === 'vi' ? "Dòng tiền hiện tại đang mất cân đối. Hệ thống AI đề xuất tối ưu hóa các khoản 'Mua sắm' để đảm bảo thanh khoản cho chu kỳ tới." : "Current cash flow is imbalanced. AI suggests optimizing 'Shopping' expenses to ensure liquidity for the next cycle.")
                  : (language === 'vi' ? "Chỉ số tài chính đang ở mức lý tưởng. Khả năng tích lũy của bạn đang tăng trưởng tích cực (+12.4% so với kỳ trước)." : "Financial indexes are at ideal levels. Your accumulation capability is growing positively (+12.4% vs previous period).")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 mt-8">
            <span className="w-1 h-1 rounded-full bg-primary animate-ping"></span>
            {language === 'vi' ? 'Gemini Core đang hoạt động' : 'Gemini Core Active'}
          </div>
        </div>
      </div>

      {/* Monthly Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 border border-black/5 dark:border-white/5">
          <p className="text-xs font-bold text-slate-500 mb-1">{t('finance.income')}</p>
          <p className="text-xl font-bold text-primary">+{formatCurrency(monthlyReport?.totalIncome || 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 border border-black/5 dark:border-white/5">
          <p className="text-xs font-bold text-slate-500 mb-1">{t('finance.expense')}</p>
          <p className="text-xl font-bold text-rose-500">-{formatCurrency(monthlyReport?.totalExpense || 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 border border-black/5 dark:border-white/5">
          <p className="text-xs font-bold text-slate-500 mb-1">{t('finance.savings')}</p>
          <p className={`text-xl font-bold ${(monthlyReport?.netSavings || 0) >= 0 ? 'text-primary' : 'text-rose-500'}`}>
            {formatCurrency(monthlyReport?.netSavings || 0)}
          </p>
        </div>
        <button
          onClick={() => setIsViewingReport(true)}
          className="rounded-xl border border-border bg-card shadow-sm p-6 flex items-center justify-center gap-2 hover:bg-primary/10 transition-all font-bold text-xs group"
        >
          <span>{t('finance.analysisReport')}</span>
          <FiArrowUpRight className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform text-primary" />
        </button>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden border border-black/5 dark:border-white/5 bg-white/80 dark:bg-slate-900/40">
        <div className="px-8 py-6 border-b border-black/5 dark:border-white/5 flex justify-between items-center bg-slate-50/30 dark:bg-white/[0.02]">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('finance.ledger')}</h3>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-md border border-black/5 dark:border-white/5">
             <span className="w-1 h-1 rounded-full bg-primary animate-pulse"></span>
             <span className="text-xs font-bold text-slate-600 dark:text-slate-400 ">{t('finance.realTimeSync')}</span>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {transactions.length > 0 ? (
            transactions.map((tx) => (
              <div key={tx.id} className="px-8 py-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors group relative">
                <div className="flex items-center gap-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl border ${tx.type === 'INCOME' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-slate-800 border-white/5 text-slate-400'}`}>
                    {getCategoryIcon(tx.category)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100">{tx.description || t('finance.systemEntry')}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded border border-white/5">
                        {tx.category}
                      </span>
                      <span className="text-xs text-slate-600 font-bold flex items-center gap-1">
                        <FiCalendar size={10} />
                        {new Date(tx.date).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className={`text-right font-bold text-lg tracking-tight ${tx.type === 'INCOME' ? 'text-primary' : 'text-slate-100'}`}>
                    {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingTransaction(tx);
                        setIsEditingTransaction(true);
                      }}
                      className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-primary transition-colors"
                    >
                      <FiEdit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteTransaction(tx.id)}
                      className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-rose-500 transition-colors"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-20 text-center space-y-4">
              <FiCreditCard size={40} className="mx-auto text-slate-300 dark:text-slate-800" />
              <p className="text-slate-500 font-bold text-xs">{language === 'vi' ? 'Chưa có giao dịch nào' : 'Zero transaction records detected'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Salary Settings Modal */}
      <Dialog open={isEditingBudget} onOpenChange={setIsEditingBudget}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-slate-900 dark:text-slate-100 italic tracking-tight">
              {language === 'vi' ? 'Cấu hình ' : 'Budget '}
              <span className="text-primary not-italic">{language === 'vi' ? 'Ngân sách' : 'Config'}</span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-500 mb-4 font-medium text-xs leading-relaxed">
            Define monthly inflow parameters for automated liquidity analysis.
          </p>

          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-xs font-bold text-slate-500 ml-1">
                Total Monthly Yield (VNĐ)
              </Label>
              <Input
                type="number"
                placeholder="25,000,000"
                className="text-xl font-bold h-16"
                value={newMonthlyIncome}
                onChange={(e) => setNewMonthlyIncome(e.target.value)}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditingBudget(false)}
                className="flex-1 h-14"
              >
                Terminate
              </Button>
              <Button
                onClick={handleUpdateBudget}
                className="flex-1 h-14"
              >
                Commit Entry
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Modal */}
      <Dialog open={isEditingTransaction} onOpenChange={setIsEditingTransaction}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-slate-900 dark:text-slate-100 italic tracking-tight">
              {language === 'vi' ? 'Sửa ' : 'Edit '}
              <span className="text-primary not-italic">{language === 'vi' ? 'Sổ cái' : 'Ledger'}</span> Entry
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold text-slate-500 ml-1">Yield / Cost (VNĐ)</Label>
                  <Input
                    type="number"
                    value={editingTransaction?.amount || 0}
                    onChange={(e) => editingTransaction && setEditingTransaction({ ...editingTransaction, amount: Number(e.target.value) })}
                  />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-bold text-slate-500 ml-1">Type</Label>
                <Select
                  value={editingTransaction?.type || 'EXPENSE'}
                  onValueChange={(val: any) => editingTransaction && setEditingTransaction({ ...editingTransaction, type: val as 'INCOME' | 'EXPENSE' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">Expense</SelectItem>
                    <SelectItem value="INCOME">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-slate-500 ml-1">Classification</Label>
              <Select
                value={editingTransaction?.category || ''}
                onValueChange={(val) => editingTransaction && setEditingTransaction({ ...editingTransaction, category: val as string })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="FOOD">Ăn uống</SelectItem>
                   <SelectItem value="TRANSPORT">Di chuyển</SelectItem>
                   <SelectItem value="SHOPPING">Mua sắm</SelectItem>
                   <SelectItem value="UTILITIES">Tiện ích</SelectItem>
                   <SelectItem value="RENT">Tiền nhà</SelectItem>
                   <SelectItem value="ENTERTAINMENT">Giải trí</SelectItem>
                   <SelectItem value="HEALTH">Sức khỏe</SelectItem>
                   <SelectItem value="EDUCATION">Giáo dục</SelectItem>
                   <SelectItem value="SALARY">Lương</SelectItem>
                   <SelectItem value="BONUS">Thưởng</SelectItem>
                   <SelectItem value="INVESTMENT">Đầu tư</SelectItem>
                   <SelectItem value="OTHER">Khác</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-slate-500 ml-1">Entry Context</Label>
              <Input
                type="text"
                placeholder="System details..."
                value={editingTransaction?.description || ''}
                onChange={(e) => editingTransaction && setEditingTransaction({ ...editingTransaction, description: e.target.value })}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-slate-500 ml-1">Date</Label>
              <Input
                type="date"
                value={editingTransaction?.date ? new Date(editingTransaction.date).toISOString().split('T')[0] : ''}
                onChange={(e) => editingTransaction && setEditingTransaction({ ...editingTransaction, date: e.target.value })}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditingTransaction(false)}
                className="flex-1 h-14"
              >
                Terminate
              </Button>
              <Button
                onClick={handleUpdateTransaction}
                className="flex-1 h-14"
              >
                Commit Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Monthly Detailed Report Modal */}
      {isViewingReport && monthlyReport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsViewingReport(false)} />
          <div className="relative glass border border-black/10 dark:border-white/5 p-10 md:p-14 w-full max-w-4xl animate-in zoom-in-95 duration-300 rounded-2xl bg-white dark:bg-slate-900 shadow-md">
            <div className="flex justify-between items-start mb-12">
              <div>
                <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-bold mb-3">
                   Fiscal Analysis
                </div>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 italic tracking-tight">
                  Ledger Report: <span className="text-primary not-italic">{monthlyReport.month}/{monthlyReport.year}</span>
                </h3>
              </div>
              <button
                onClick={() => setIsViewingReport(false)}
                className="p-2 text-slate-500 hover:text-rose-500 transition-all bg-white/5 border border-white/5 rounded-lg"
              >
                <FiX />
              </button>
            </div>

            <div className="space-y-12 max-h-[65vh] overflow-y-auto pr-6 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 pb-4 border-b border-black/5 dark:border-white/5">Classification Delta</h4>
                  <div className="space-y-6">
                    {monthlyReport.categories.map((cat) => (
                      <div key={cat.category} className="space-y-3">
                        <div className="flex justify-between text-[11px] font-bold text-slate-400">
                          <span className="flex items-center gap-3">
                            <span className="text-primary">{getCategoryIcon(cat.category)}</span>
                            <span>{cat.category}</span>
                          </span>
                          <span className="text-slate-900 dark:text-slate-100">{Math.round(cat.percentage)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                          <div
                            className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                            style={{ width: `${cat.percentage}%` }}
                          />
                        </div>
                      <p className="text-xs text-right font-bold text-slate-500">{formatCurrency(cat.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-8">
                  <h4 className="text-xs font-bold text-slate-100 pb-4 border-b border-white/5">Neural Summary</h4>
                  <div className="p-8 border border-border bg-card rounded-2xl space-y-6 border border-white/5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-bold ">Operation Count</span>
                      <span className="text-xs font-bold text-slate-100">{monthlyReport.transactionCount}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-bold ">Global Inflow</span>
                      <span className="text-xs font-bold text-primary">+{formatCurrency(monthlyReport.totalIncome)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-bold ">Global Outflow</span>
                      <span className="text-xs font-bold text-rose-500">-{formatCurrency(monthlyReport.totalExpense)}</span>
                    </div>
                    <div className="h-px bg-white/5 my-2" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-bold text-slate-100">Net Position</span>
                      <span className={`text-2xl font-bold italic tracking-tight ${monthlyReport.netSavings >= 0 ? 'text-primary' : 'text-rose-500'}`}>
                        {formatCurrency(monthlyReport.netSavings)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-primary/5 border border-primary/20 p-8 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <FiActivity size={60} />
                    </div>
                    <p className="text-xs font-bold text-primary mb-4 flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                       Insight Analysis
                    </p>
                    <p className="text-xs leading-relaxed font-bold text-slate-300 italic">
                      {monthlyReport.netSavings >= 0
                        ? "Neural patterns suggest stable liquidity. Current retention rate is optimal for long-term growth objectives."
                        : "Alert: Structural deficit detected. Neural Core recommends immediate reallocation of consumption units."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getCategoryIcon(category: string) {
  const size = 18;
  switch (category) {
    case 'FOOD': return <FiCoffee size={size} />;
    case 'TRANSPORT': return <FiTruck size={size} />;
    case 'SHOPPING': return <FiShoppingBag size={size} />;
    case 'UTILITIES': return <FiSmartphone size={size} />;
    case 'RENT': return <FiHome size={size} />;
    case 'ENTERTAINMENT': return <FiMusic size={size} />;
    case 'HEALTH': return <FiHeart size={size} />;
    case 'EDUCATION': return <FiBookOpen size={size} />;
    case 'SALARY': return <FiBriefcase size={size} />;
    case 'BONUS': return <FiGift size={size} />;
    case 'INVESTMENT': return <FiTrendingUp size={size} />;
    default: return <FiLayers size={size} />;
  }
}
