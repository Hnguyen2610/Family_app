'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { FiSettings, FiArrowUpRight, FiActivity, FiTrendingUp, FiCreditCard, FiTrash2, FiEdit2, FiInfo, FiSmartphone, FiCalendar, FiBriefcase, FiShoppingBag, FiTruck, FiCoffee, FiHome, FiMusic, FiHeart, FiBookOpen, FiGift, FiLayers, FiX } from 'react-icons/fi';
import api from '@/lib/api-client';

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
        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] animate-pulse">Syncing data...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const percentSpent = status ? (status.totalSpentToday / (status.dailyBudget || 1)) * 100 : 0;
  const isOver = status?.isOverspent;

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-md text-[9px] font-black uppercase tracking-[0.2em] border border-primary/20 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            {t('finance.title')} Dashboard
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 pb-4 leading-[1.2]">
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
        <div className={`col-span-1 lg:col-span-2 glass rounded-2xl p-8 md:p-10 border transition-all duration-500 ${isOver ? 'border-rose-500/30 bg-rose-500/5' : 'border-black/5 dark:border-white/5 bg-slate-100/40 dark:bg-slate-900/40'}`}>
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
                  className={`fill-none transition-all duration-1000 ease-out ${isOver ? 'stroke-rose-500' : 'stroke-primary'}`}
                  strokeWidth="6"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - Math.min(percentSpent, 100) / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{t('finance.remaining')}</span>
                <span className={`text-2xl font-black tracking-tighter ${isOver ? 'text-rose-500' : 'text-primary'}`}>
                  {formatCurrency(status?.balance || 0)}
                </span>
              </div>
            </div>

            {/* Stats info */}
            <div className="flex-1 space-y-8 w-full text-center md:text-left">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('finance.dailyBudget')}</p>
                  <p className="text-xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(status?.dailyBudget || 0)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('finance.spentToday')}</p>
                  <p className={`text-xl font-black ${isOver ? 'text-rose-500' : 'text-slate-900 dark:text-slate-100'}`}>
                    {formatCurrency(status?.totalSpentToday || 0)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  <span>Usage Intensity</span>
                  <span className={isOver ? 'text-rose-500' : 'text-primary'}>{Math.round(percentSpent)}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${isOver ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-primary shadow-[0_0_10px_rgba(14,165,233,0.5)]'}`}
                    style={{ width: `${Math.min(percentSpent, 100)}%` }}
                  />
                </div>
                {isOver && (
                  <div className="flex items-center gap-2 text-[9px] text-rose-500 font-bold uppercase tracking-wider animate-pulse pt-1">
                    <FiInfo />
                    Alert: Current spending exceeds dynamic allocation
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AI Insight Card */}
        <div className="glass rounded-2xl p-8 border border-primary/20 bg-white/80 dark:bg-slate-900/40 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <FiActivity size={120} />
          </div>
          <div className="space-y-6 relative z-10">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
              <FiTrendingUp size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 leading-tight mb-2">{t('finance.insight')}</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                {isOver
                  ? (language === 'vi' ? "Dòng tiền hiện tại đang mất cân đối. Hệ thống AI đề xuất tối ưu hóa các khoản 'Mua sắm' để đảm bảo thanh khoản cho chu kỳ tới." : "Current cash flow is imbalanced. AI suggests optimizing 'Shopping' expenses to ensure liquidity for the next cycle.")
                  : (language === 'vi' ? "Chỉ số tài chính đang ở mức lý tưởng. Khả năng tích lũy của bạn đang tăng trưởng tích cực (+12.4% so với kỳ trước)." : "Financial indexes are at ideal levels. Your accumulation capability is growing positively (+12.4% vs previous period).")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 mt-8">
            <span className="w-1 h-1 rounded-full bg-primary animate-ping"></span>
            {language === 'vi' ? 'Gemini Core đang hoạt động' : 'Gemini Core Active'}
          </div>
        </div>
      </div>

      {/* Monthly Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-6 border border-black/5 dark:border-white/5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{t('finance.income')}</p>
          <p className="text-xl font-black text-primary">+{formatCurrency(monthlyReport?.totalIncome || 0)}</p>
        </div>
        <div className="glass rounded-xl p-6 border border-black/5 dark:border-white/5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{t('finance.expense')}</p>
          <p className="text-xl font-black text-rose-500">-{formatCurrency(monthlyReport?.totalExpense || 0)}</p>
        </div>
        <div className="glass rounded-xl p-6 border border-black/5 dark:border-white/5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{t('finance.savings')}</p>
          <p className={`text-xl font-black ${(monthlyReport?.netSavings || 0) >= 0 ? 'text-primary' : 'text-rose-500'}`}>
            {formatCurrency(monthlyReport?.netSavings || 0)}
          </p>
        </div>
        <button
          onClick={() => setIsViewingReport(true)}
          className="glass rounded-xl p-6 flex items-center justify-center gap-2 hover:bg-primary/10 transition-all font-black text-[9px] uppercase tracking-widest group border border-black/5 dark:border-primary/20 bg-slate-100/40 dark:bg-transparent"
        >
          <span>{t('finance.analysisReport')}</span>
          <FiArrowUpRight className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform text-primary" />
        </button>
      </div>

      {/* Recent Transactions */}
      <div className="glass rounded-2xl overflow-hidden border border-black/5 dark:border-white/5 bg-white/80 dark:bg-slate-900/40">
        <div className="px-8 py-6 border-b border-black/5 dark:border-white/5 flex justify-between items-center bg-slate-50/30 dark:bg-white/[0.02]">
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{t('finance.ledger')}</h3>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-md border border-black/5 dark:border-white/5">
             <span className="w-1 h-1 rounded-full bg-primary animate-pulse"></span>
             <span className="text-[9px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">{t('finance.realTimeSync')}</span>
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
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-800 px-2 py-0.5 rounded border border-white/5">
                        {tx.category}
                      </span>
                      <span className="text-[9px] text-slate-600 font-bold flex items-center gap-1">
                        <FiCalendar size={10} />
                        {new Date(tx.date).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className={`text-right font-black text-lg tracking-tighter ${tx.type === 'INCOME' ? 'text-primary' : 'text-slate-100'}`}>
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
              <p className="text-slate-500 font-black uppercase tracking-widest text-[9px]">{language === 'vi' ? 'Chưa có giao dịch nào' : 'Zero transaction records detected'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Salary Settings Modal */}
      {isEditingBudget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsEditingBudget(false)} />
          <div className="relative glass border border-black/10 dark:border-white/5 p-10 md:p-12 w-full max-w-xl animate-in zoom-in-95 duration-300 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
            <h3 className="text-3xl font-black mb-2 text-slate-900 dark:text-slate-100 italic tracking-tighter">{language === 'vi' ? 'Cấu hình ' : 'Budget '}<span className="text-primary not-italic">{language === 'vi' ? 'Ngân sách' : 'Config'}</span></h3>
            <p className="text-slate-500 mb-8 font-medium text-xs uppercase tracking-widest leading-relaxed">Define monthly inflow parameters for automated liquidity analysis.</p>

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Total Monthly Yield (VNĐ)</label>
                <input
                  type="number"
                  placeholder="25,000,000"
                  className="input-field text-xl font-black py-4"
                  value={newMonthlyIncome}
                  onChange={(e) => setNewMonthlyIncome(e.target.value)}
                />
              </div>

              <div className="flex gap-4 pt-6">
                <button
                  onClick={() => setIsEditingBudget(false)}
                  className="flex-1 py-4 bg-slate-800 text-slate-400 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-all"
                >
                  Terminate
                </button>
                <button
                  onClick={handleUpdateBudget}
                  className="btn-primary flex-1"
                >
                  Commit Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {isEditingTransaction && editingTransaction && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsEditingTransaction(false)} />
          <div className="relative glass border border-black/10 dark:border-white/5 p-10 md:p-12 w-full max-w-xl animate-in zoom-in-95 duration-300 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
            <h3 className="text-3xl font-black mb-8 text-slate-900 dark:text-slate-100 italic tracking-tighter">{language === 'vi' ? 'Sửa ' : 'Edit '}<span className="text-primary not-italic">{language === 'vi' ? 'Sổ cái' : 'Ledger'}</span> Entry</h3>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Yield / Cost (VNĐ)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editingTransaction.amount}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, amount: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Type</label>
                  <select
                    className="input-field"
                    value={editingTransaction.type}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, type: e.target.value as any })}
                  >
                    <option value="EXPENSE">Expense</option>
                    <option value="INCOME">Income</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Classification</label>
                <select
                  className="input-field"
                  value={editingTransaction.category}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, category: e.target.value })}
                >
                  <option value="FOOD">Ăn uống</option>
                  <option value="TRANSPORT">Di chuyển</option>
                  <option value="SHOPPING">Mua sắm</option>
                  <option value="UTILITIES">Tiện ích</option>
                  <option value="RENT">Tiền nhà</option>
                  <option value="ENTERTAINMENT">Giải trí</option>
                  <option value="HEALTH">Sức khỏe</option>
                  <option value="EDUCATION">Giáo dục</option>
                  <option value="SALARY">Lương</option>
                  <option value="BONUS">Thưởng</option>
                  <option value="INVESTMENT">Đầu tư</option>
                  <option value="OTHER">Khác</option>
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Entry Context</label>
                <input
                  type="text"
                  placeholder="System details..."
                  className="input-field"
                  value={editingTransaction.description}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, description: e.target.value })}
                />
              </div>

              <div className="flex gap-4 pt-8">
                <button
                  onClick={() => setIsEditingTransaction(false)}
                  className="flex-1 py-4 bg-slate-800 text-slate-400 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-all"
                >
                  Terminate
                </button>
                <button
                  onClick={handleUpdateTransaction}
                  className="btn-primary flex-1"
                >
                  Commit Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Detailed Report Modal */}
      {isViewingReport && monthlyReport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsViewingReport(false)} />
          <div className="relative glass border border-black/10 dark:border-white/5 p-10 md:p-14 w-full max-w-4xl animate-in zoom-in-95 duration-300 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
            <div className="flex justify-between items-start mb-12">
              <div>
                <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-primary/20 text-primary rounded text-[8px] font-black uppercase tracking-[0.2em] mb-3">
                   Fiscal Analysis
                </div>
                <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 italic tracking-tighter">
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
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-slate-100 pb-4 border-b border-black/5 dark:border-white/5">Classification Delta</h4>
                  <div className="space-y-6">
                    {monthlyReport.categories.map((cat) => (
                      <div key={cat.category} className="space-y-3">
                        <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
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
                        <p className="text-[9px] text-right font-black text-slate-500 tracking-widest">{formatCurrency(cat.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-8">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-100 pb-4 border-b border-white/5">Neural Summary</h4>
                  <div className="glass-dark p-8 rounded-2xl space-y-6 border border-white/5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Operation Count</span>
                      <span className="text-xs font-black text-slate-100">{monthlyReport.transactionCount}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Global Inflow</span>
                      <span className="text-xs font-black text-primary">+{formatCurrency(monthlyReport.totalIncome)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Global Outflow</span>
                      <span className="text-xs font-black text-rose-500">-{formatCurrency(monthlyReport.totalExpense)}</span>
                    </div>
                    <div className="h-px bg-white/5 my-2" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-100">Net Position</span>
                      <span className={`text-2xl font-black italic tracking-tighter ${monthlyReport.netSavings >= 0 ? 'text-primary' : 'text-rose-500'}`}>
                        {formatCurrency(monthlyReport.netSavings)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-primary/5 border border-primary/20 p-8 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <FiActivity size={60} />
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
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
