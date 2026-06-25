'use client';

import { useState, useEffect, useCallback } from 'react';
import { chatAPI } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import { FiRefreshCw, FiDatabase, FiCpu, FiActivity, FiServer, FiZap, FiArrowLeft } from 'react-icons/fi';

interface AiRequestLog {
  id: string;
  timestamp: string;
  type: 'chat' | 'stream';
  intent: string;
  model: string;
  latencyMs: number;
  cached: boolean;
  redacted: boolean;
  error?: string;
  tokenCount?: number;
}

interface SystemStats {
  cache: { total: number; active: number; expired: number };
  logStats: { total: number; cacheHits: number; errors: number; avgLatencyMs: number };
  recentLogs: AiRequestLog[];
  models: {
    groq: string; gemini: string;
    maxTokens: number; historyLimit: number;
    groqContextWindow: number; geminiContextWindow: number;
  };
  uptime: number;
  memoryMB: number;
  timestamp: string;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

const StatCard = ({ icon, label, value, sub, color = 'text-primary' }: StatCardProps) => (
  <div className="glass rounded-2xl border border-white/10 p-6 flex items-start gap-4 group hover:border-primary/30 transition-all">
    <div className={`w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl ${color} group-hover:scale-110 transition-transform shrink-0`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-black tracking-tighter ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 font-bold mt-0.5 truncate">{sub}</p>}
    </div>
  </div>
);

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatContext(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`;
  return `${tokens}`;
}

interface AiDashboardProps {
  readonly onBack?: () => void;
}

export default function AiDashboard({ onBack }: AiDashboardProps) {
  const { language } = useTranslation();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET || 'family-cron-secret-2026';

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await chatAPI.getAdminStats(cronSecret);
      if (res.data?.error) {
        setError(language === 'vi' ? 'Không có quyền truy cập' : 'Unauthorized');
      } else {
        setStats(res.data);
        setLastFetch(new Date());
      }
    } catch {
      setError(language === 'vi' ? 'Không thể kết nối tới server' : 'Cannot connect to server');
    } finally {
      setLoading(false);
    }
  }, [cronSecret, language]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchStats]);

  const cacheHitRate = stats
    ? stats.cache.total > 0 ? Math.round((stats.cache.active / stats.cache.total) * 100) : 0
    : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-white/10"
          >
            <FiArrowLeft />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tighter italic">
            AI <span className="text-primary not-italic">Dashboard</span>
          </h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-0.5">
            {language === 'vi' ? 'Giám sát hệ thống AI · Cập nhật mỗi 30 giây' : 'AI System Monitor · Auto-refresh every 30s'}
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-50"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} />
          {loading ? (language === 'vi' ? 'Đang tải...' : 'Loading...') : (language === 'vi' ? 'Làm mới' : 'Refresh')}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold text-center">
          {error}
        </div>
      )}

      {stats ? (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<FiDatabase />} label={language === 'vi' ? 'Cache (active)' : 'Cache Active'} value={stats.cache.active} sub={`${stats.cache.total} total / ${stats.cache.expired} expired`} />
            <StatCard icon={<FiZap />} label={language === 'vi' ? 'Tỉ lệ cache' : 'Cache Hit Rate'} value={`${cacheHitRate}%`} sub={language === 'vi' ? 'Tổng cache còn sống' : 'Active/Total entries'} color={cacheHitRate > 50 ? 'text-emerald-400' : 'text-amber-400'} />
            <StatCard icon={<FiServer />} label={language === 'vi' ? 'Bộ nhớ' : 'Memory'} value={`${stats.memoryMB} MB`} sub={language === 'vi' ? 'Heap JS đang dùng' : 'JS heap in use'} color="text-blue-400" />
            <StatCard icon={<FiActivity />} label={language === 'vi' ? 'Uptime' : 'Uptime'} value={formatUptime(stats.uptime)} sub={language === 'vi' ? 'Thời gian hoạt động' : 'Server running time'} color="text-emerald-400" />
          </div>

          {/* Model Config */}
          <div className="glass rounded-2xl border border-white/10 p-8">
            <div className="flex items-center gap-3 mb-6">
              <FiCpu className="text-primary text-xl" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">
                {language === 'vi' ? 'Cấu hình Model' : 'Model Configuration'}
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Groq */}
              <div className="space-y-3 p-5 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Groq</p>
                </div>
                <p className="text-sm font-bold text-slate-200 truncate">{stats.models.groq}</p>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <div>Context: <span className="text-slate-300">{formatContext(stats.models.groqContextWindow)}</span></div>
                  <div>Max Tokens: <span className="text-slate-300">{stats.models.maxTokens}</span></div>
                </div>
              </div>
              {/* Gemini */}
              <div className="space-y-3 p-5 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Gemini</p>
                </div>
                <p className="text-sm font-bold text-slate-200 truncate">{stats.models.gemini}</p>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <div>Context: <span className="text-slate-300">{formatContext(stats.models.geminiContextWindow)}</span></div>
                  <div>History: <span className="text-slate-300">{stats.models.historyLimit} msgs</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Log Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<FiActivity />} label={language === 'vi' ? 'Tổng request' : 'Total Requests'} value={stats.logStats.total} sub={language === 'vi' ? 'Kể từ khi khởi động' : 'Since server start'} />
            <StatCard icon={<FiZap />} label={language === 'vi' ? 'Cache hits' : 'Cache Hits'} value={stats.logStats.cacheHits} sub={`${stats.logStats.total > 0 ? Math.round(stats.logStats.cacheHits / stats.logStats.total * 100) : 0}% của tổng`} color="text-emerald-400" />
            <StatCard icon={<FiDatabase />} label={language === 'vi' ? 'Latency TB' : 'Avg Latency'} value={`${stats.logStats.avgLatencyMs}ms`} sub={language === 'vi' ? 'Không tính cache hit' : 'Excluding cache hits'} color="text-blue-400" />
            <StatCard icon={<FiServer />} label={language === 'vi' ? 'Lỗi' : 'Errors'} value={stats.logStats.errors} sub={language === 'vi' ? 'Request thất bại' : 'Failed requests'} color={stats.logStats.errors > 0 ? 'text-rose-400' : 'text-emerald-400'} />
          </div>

          {/* Request Logs Table */}
          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FiActivity className="text-primary" />
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">
                  {language === 'vi' ? 'Request gần đây' : 'Recent Requests'} ({stats.recentLogs.length})
                </h3>
              </div>
            </div>
            {stats.recentLogs.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm font-bold">
                {language === 'vi' ? 'Chưa có request nào. Gửi tin nhắn AI để bắt đầu.' : 'No requests yet. Send an AI message to begin.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-500 uppercase tracking-widest font-black text-[9px]">
                      <th className="text-left px-5 py-3">Time</th>
                      <th className="text-left px-5 py-3">Type</th>
                      <th className="text-left px-5 py-3">Intent</th>
                      <th className="text-left px-5 py-3">Model</th>
                      <th className="text-right px-5 py-3">Latency</th>
                      <th className="text-center px-5 py-3">Cache</th>
                      <th className="text-center px-5 py-3">PII</th>
                      <th className="text-left px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentLogs.map((log) => (
                      <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-5 py-3 text-slate-500 font-mono whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${log.type === 'stream' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'}`}>
                            {log.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-300 font-mono">{log.intent}</td>
                        <td className="px-5 py-3">
                          <span className={`font-black uppercase text-[9px] ${log.model === 'groq' ? 'text-emerald-400' : 'text-blue-400'}`}>
                            {log.model}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          {log.cached ? (
                            <span className="text-emerald-400">⚡ cached</span>
                          ) : (
                            <span className={log.latencyMs > 3000 ? 'text-amber-400' : 'text-slate-300'}>
                              {log.latencyMs}ms
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {log.cached ? <span className="text-emerald-400">✓</span> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {log.redacted ? <span className="text-amber-400" title="PII redacted">🔒</span> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          {log.error ? (
                            <span className="text-rose-400 font-bold truncate max-w-[150px] block" title={log.error}>✗ {log.error.slice(0, 30)}</span>
                          ) : (
                            <span className="text-emerald-400">✓ ok</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cache Bars */}
          <div className="glass rounded-2xl border border-white/10 p-8 space-y-5">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 mb-2">
              {language === 'vi' ? 'Trạng thái Cache' : 'Cache Health'}
            </h3>
            {[
              { label: 'Active', value: stats.cache.active, max: stats.cache.total || 1, color: 'bg-emerald-500' },
              { label: 'Expired', value: stats.cache.expired, max: stats.cache.total || 1, color: 'bg-amber-500' },
            ].map(bar => (
              <div key={bar.label}>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                  <span>{bar.label}</span>
                  <span className="text-slate-300">{bar.value} / {stats.cache.total}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${bar.color} transition-all duration-700`}
                    style={{ width: `${Math.round((bar.value / (stats.cache.total || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {lastFetch && (
            <p className="text-center text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">
              {language === 'vi' ? 'Cập nhật lần cuối' : 'Last updated'}: {lastFetch.toLocaleTimeString()}
            </p>
          )}
        </>
      ) : !loading && !error && (
        <div className="text-center py-20 text-slate-500 font-bold text-sm">
          {language === 'vi' ? 'Đang khởi tạo...' : 'Initializing...'}
        </div>
      )}
    </div>
  );
}
