'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import { chatAPI } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
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
