'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import { chatAPI } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import toast from 'react-hot-toast';
import { AiDashboardRequestLogs } from './AiDashboardRequestLogs';
import {
  CacheHealthSection,
  FeedbackReportSection,
  LogStatsGrid,
  ModelConfigSection,
  RagQualitySection,
  SystemStatsGrid,
} from './AiDashboardSections';
import type { AiRequestLog, SystemStats } from './ai-dashboard-utils';

interface AiDashboardProps {
  readonly onBack?: () => void;
}

export default function AiDashboard({ onBack }: AiDashboardProps) {
  const { language } = useTranslation();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [modelFilter, setModelFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [familyIdFilter, setFamilyIdFilter] = useState('');
  const [hasRagFilter, setHasRagFilter] = useState('');

  const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET || 'family-cron-secret-2026';

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await chatAPI.getAdminStats(cronSecret, {
        model: modelFilter || undefined,
        skill: skillFilter || undefined,
        status: statusFilter || undefined,
        familyId: familyIdFilter || undefined,
        hasRag: hasRagFilter || undefined,
      });
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
  }, [cronSecret, familyIdFilter, hasRagFilter, language, modelFilter, skillFilter, statusFilter]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const cacheHitRate = stats
    ? stats.cache.total > 0 ? Math.round((stats.cache.active / stats.cache.total) * 100) : 0
    : 0;

  const [evalCases, setEvalCases] = useState<any[]>([]);
  const [evalResult, setEvalResult] = useState<any | null>(null);
  const [runningEval, setRunningEval] = useState(false);

  const fetchEvalCases = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/admin/eval-cases', {
        headers: { 'x-admin-secret': cronSecret },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvalCases(data);
      }
    } catch (err) {
      console.error('Failed to fetch eval cases:', err);
    }
  }, [cronSecret]);

  useEffect(() => {
    fetchEvalCases();
  }, [fetchEvalCases]);

  const runEvals = async () => {
    setRunningEval(true);
    try {
      const res = await fetch('/api/chat/admin/eval-cases/run', {
        method: 'POST',
        headers: { 'x-admin-secret': cronSecret },
      });
      const data = await res.json();
      setEvalResult(data);
      toast.success(language === 'vi' ? 'Đã chạy đánh giá xong!' : 'Evaluation run complete!');
    } catch (err) {
      console.error(err);
      toast.error('Chạy đánh giá thất bại');
    } finally {
      setRunningEval(false);
    }
  };

  const toggleEvalStatus = async (id: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await fetch(`/api/chat/admin/eval-cases/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': cronSecret,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      setEvalCases(prev => prev.map(c => c.id === id ? { ...c, status: nextStatus } : c));
    } catch (err) {
      console.error(err);
    }
  };

  const deleteEval = async (id: string) => {
    if (!confirm('Xóa case này?')) return;
    try {
      await fetch(`/api/chat/admin/eval-cases/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-secret': cronSecret },
      });
      setEvalCases(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const copyText = useCallback(async (text: string) => {
    if (!text || typeof navigator === 'undefined') return;
    await navigator.clipboard?.writeText(text);
  }, []);

  const buildRagContextText = useCallback((log: AiRequestLog) => {
    return (log.ragSources || [])
      .map((source, index) => [
        `[${index + 1}] ${source.title}#${source.chunkIndex + 1}`,
        `score=${Number(source.score || 0).toFixed(3)} familyId=${source.familyId || '-'} category=${source.category || '-'} sourceType=${source.sourceType || '-'} retrieval=${source.retrieval || '-'}`,
        source.snippet || '',
      ].join('\n'))
      .join('\n\n');
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <DashboardHeader
        language={language}
        loading={loading}
        onBack={onBack}
        onRefresh={fetchStats}
      />

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold text-center">
          {error}
        </div>
      )}

      {stats ? (
        <>
          <SystemStatsGrid cacheHitRate={cacheHitRate} language={language} stats={stats} />
          <ModelConfigSection language={language} stats={stats} />
          <LogStatsGrid language={language} stats={stats} />

          <AiDashboardRequestLogs
            adminSecret={cronSecret}
            buildRagContextText={buildRagContextText}
            copyText={copyText}
            familyIdFilter={familyIdFilter}
            hasRagFilter={hasRagFilter}
            language={language}
            logs={stats.recentLogs}
            modelFilter={modelFilter}
            setFamilyIdFilter={setFamilyIdFilter}
            setHasRagFilter={setHasRagFilter}
            setModelFilter={setModelFilter}
            setSkillFilter={setSkillFilter}
            setStatusFilter={setStatusFilter}
            skillFilter={skillFilter}
            statusFilter={statusFilter}
          />

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                🧪 AI Evaluation Quality Cases ({evalCases.length})
              </h3>
              <button
                onClick={runEvals}
                disabled={runningEval}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                🚀 Run Suite
              </button>
            </div>

            {evalResult && (
              <div className="bg-slate-950 p-4 rounded-xl border border-white/10 space-y-3">
                <h4 className="text-sm font-bold text-white">Kết quả Chạy thử:</h4>
                <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-300">
                  <span className="text-emerald-400">PASS: {evalResult.passCount}</span>
                  <span className="text-rose-400">FAIL: {evalResult.failCount}</span>
                </div>
                {evalResult.results && (
                  <div className="max-h-60 overflow-y-auto space-y-2 mt-2">
                    {evalResult.results.map((res: any, idx: number) => (
                      <div key={idx} className={`p-2 rounded border text-[11px] ${res.passed ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
                        <div className="font-bold">"${res.input}"</div>
                        <div className="mt-1 font-semibold opacity-85">
                          Intent: {res.actualIntent} (Expected: {res.expectedIntent}) | Skill: {res.actualSkill}
                        </div>
                        {res.errors.length > 0 && (
                          <div className="mt-1 font-bold text-rose-400">{res.errors.join(', ')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="max-h-80 overflow-y-auto space-y-3">
              {evalCases.map((cs) => (
                <div key={cs.id} className="flex items-center justify-between p-4 bg-white/5 dark:bg-slate-950/30 rounded-xl border border-white/5">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 italic">"${cs.input}"</div>
                    <div className="text-[11px] text-slate-500 font-bold opacity-60">
                      Sản sinh từ Log: {cs.sourceLogId || '-'} | Intent mong đợi: <span className="text-primary">{cs.expectedIntent || '-'}</span> | Skill: <span className="text-primary">{cs.expectedSkill || '-'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleEvalStatus(cs.id, cs.status)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${cs.status === 'ACTIVE' ? 'bg-emerald-505/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/10'}`}
                    >
                      {cs.status}
                    </button>
                    <button
                      onClick={() => deleteEval(cs.id)}
                      className="p-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-all"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <FeedbackReportSection language={language} stats={stats} />
          <RagQualitySection language={language} stats={stats} />
          <CacheHealthSection language={language} stats={stats} />

          {lastFetch && (
            <p className="text-center text-xs text-slate-600 font-bold ">
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

function DashboardHeader({
  language,
  loading,
  onBack,
  onRefresh,
}: {
  language: string;
  loading: boolean;
  onBack?: () => void;
  onRefresh: () => void;
}) {
  return (
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
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight italic">
          AI <span className="text-primary not-italic">Dashboard</span>
        </h2>
        <p className="text-xs font-bold text-slate-500  mt-0.5">
          {language === 'vi' ? 'Giám sát hệ thống AI · Cập nhật mỗi 30 giây' : 'AI System Monitor · Auto-refresh every 30s'}
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition-all disabled:opacity-50"
      >
        <FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} />
        {loading ? (language === 'vi' ? 'Đang tải...' : 'Loading...') : (language === 'vi' ? 'Làm mới' : 'Refresh')}
      </button>
    </div>
  );
}
