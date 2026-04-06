'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
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

export default function Finance() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<FinanceStatus | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [newMonthlyIncome, setNewMonthlyIncome] = useState('');

  const fetchData = async () => {
    try {
      const [statusRes, txRes] = await Promise.all([
        api.get('/finance/status'),
        api.get('/finance/transactions?limit=10')
      ]);
      setStatus(statusRes.data);
      setTransactions(txRes.data);
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
      await api.put('/finance/budget', { monthlyIncome: Number(newMonthlyIncome) });
      setIsEditingBudget(false);
      fetchData();
    } catch (error) {
      alert('Lỗi khi cập nhật ngân sách');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted-foreground animate-pulse font-bold">{t('common.loading')}</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const percentSpent = status ? (status.totalSpentToday / (status.dailyBudget || 1)) * 100 : 0;
  const isOver = status?.isOverspent;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">{t('nav.financeFull')}</h2>
          <p className="text-muted-foreground mt-2 font-medium">Tự động hóa dòng tiền & Định mức chi tiêu</p>
        </div>
        <button 
          onClick={() => setIsEditingBudget(true)}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all active:scale-95 shadow-lg shadow-indigo-200 dark:shadow-none"
        >
          ⚙️ Cài đặt lương
        </button>
      </div>

      {/* Daily Progress Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`col-span-1 lg:col-span-2 glass rounded-[2rem] p-8 md:p-10 border-2 transition-colors duration-500 ${isOver ? 'border-red-500/30' : 'border-emerald-500/20'}`}>
          <div className="flex flex-col md:flex-row items-center gap-10">
            {/* Circular Progress */}
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="96" cy="96" r="88"
                  className="stroke-muted/20 fill-none"
                  strokeWidth="12"
                />
                <circle
                  cx="96" cy="96" r="88"
                  className={`fill-none transition-all duration-1000 ease-out ${isOver ? 'stroke-red-500' : 'stroke-emerald-500'}`}
                  strokeWidth="12"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - Math.min(percentSpent, 100) / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Còn lại</span>
                <span className={`text-2xl md:text-3xl font-black ${isOver ? 'text-red-500' : 'text-emerald-500'}`}>
                  {status?.balance && status.balance > 0 ? '+' : ''}{formatCurrency(status?.balance || 0)}
                </span>
              </div>
            </div>

            {/* Stats info */}
            <div className="flex-1 space-y-6 w-full text-center md:text-left">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Định mức ngày</p>
                  <p className="text-xl md:text-2xl font-black">{formatCurrency(status?.dailyBudget || 0)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Đã tiêu</p>
                  <p className={`text-xl md:text-2xl font-black ${isOver ? 'text-red-500' : 'text-foreground'}`}>
                    {formatCurrency(status?.totalSpentToday || 0)}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                  <span>Tiến trình</span>
                  <span className={isOver ? 'text-red-500' : 'text-emerald-500 font-bold'}>{Math.round(percentSpent)}%</span>
                </div>
                <div className="h-4 bg-muted/40 rounded-full overflow-hidden p-1 shadow-inner border border-white/10">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${isOver ? 'bg-gradient-to-r from-red-600 to-rose-400' : 'bg-gradient-to-r from-emerald-600 to-green-400'}`}
                    style={{ width: `${Math.min(percentSpent, 100)}%` }}
                  />
                </div>
                {isOver && (
                  <p className="text-[10px] text-red-500 font-black animate-pulse uppercase tracking-wider">
                    ⚠️ CẢNH BÁO: Bạn đang tiêu quá định mức!
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AI Insight Card */}
        <div className="glass rounded-[2rem] p-8 bg-indigo-600 dark:bg-indigo-900/40 text-white flex flex-col justify-between">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">🤖</div>
            <h3 className="text-xl font-black leading-tight">Phân tích từ Gemini AI</h3>
            <p className="text-sm text-indigo-100/80 font-medium leading-relaxed">
              {isOver 
                ? "Dữ liệu cho thấy bạn đang tiêu hơi nhiều vào hôm nay. Hãy thử cắt giảm khoản 'Mua sắm' để cân đối lại cho ngày mai nhé!"
                : "Tuyệt vời! Bạn đang kiểm soát tài chính rất tốt. Khoản dư hôm nay sẽ giúp bạn an tâm hơn cho các kế hoạch cuối tuần."}
            </p>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mt-6">Powered by Google Gemini</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="glass rounded-[2rem] overflow-hidden border border-white/40 dark:border-slate-800/40">
        <div className="px-8 py-6 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-xl font-black">Giao dịch gần đây</h3>
          <span className="text-[10px] bg-card px-2 py-1 rounded-lg font-black text-muted-foreground uppercase tracking-widest border border-white/10">Tự động đồng bộ</span>
        </div>
        <div className="divide-y divide-white/5">
          {transactions.length > 0 ? (
            transactions.map((tx) => (
              <div key={tx.id} className="px-8 py-5 flex items-center justify-between hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-sm border border-white/10 ${tx.type === 'INCOME' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-400'}`}>
                    {getCategoryIcon(tx.category)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm md:text-base">{tx.description || 'Giao dịch không tên'}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-md">
                        {tx.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground opacity-60">
                        {new Date(tx.date).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={`text-right font-black md:text-lg ${tx.type === 'INCOME' ? 'text-emerald-500' : 'text-red-400'}`}>
                  {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                </div>
              </div>
            ))
          ) : (
            <div className="py-20 text-center space-y-4">
              <div className="text-6xl grayscale opacity-30">💸</div>
              <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">Chưa có giao dịch nào được ghi nhận</p>
            </div>
          )}
        </div>
      </div>

      {/* Salary Settings Modal */}
      {isEditingBudget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={() => setIsEditingBudget(false)} />
          <div className="relative glass rounded-[2.5rem] p-8 md:p-12 w-full max-w-xl shadow-2xl animate-in zoom-in-95 duration-300 border-2 border-indigo-500/20">
            <h3 className="text-3xl font-black mb-2">Thiết lập Lương</h3>
            <p className="text-muted-foreground mb-8 font-medium">Nhập tổng thu nhập mỗi tháng của bạn để AI tự động chia định mức hàng ngày.</p>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Tổng lương tháng (VNĐ)</label>
                <input 
                  type="number"
                  placeholder="Ví dụ: 15000000"
                  className="w-full bg-card/60 border-2 border-border/40 focus:border-indigo-500 rounded-2xl px-6 py-4 text-xl md:text-2xl font-black outline-none transition-all"
                  value={newMonthlyIncome}
                  onChange={(e) => setNewMonthlyIncome(e.target.value)}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setIsEditingBudget(false)}
                  className="flex-1 px-6 py-4 bg-muted hover:bg-muted/80 rounded-2xl font-black transition-all active:scale-95"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  onClick={handleUpdateBudget}
                  className="flex-1 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all active:scale-95 shadow-xl shadow-indigo-200 dark:shadow-none"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'FOOD': return '🍔';
    case 'TRANSPORT': return '🚗';
    case 'SHOPPING': return '🛍️';
    case 'UTILITIES': return '💡';
    case 'RENT': return '🏠';
    case 'ENTERTAINMENT': return '🎬';
    case 'HEALTH': return '🏥';
    case 'EDUCATION': return '📚';
    case 'SALARY': return '💵';
    case 'BONUS': return '🧧';
    case 'INVESTMENT': return '📈';
    default: return '📦';
  }
}
