import { FiActivity, FiCpu, FiDatabase, FiServer, FiThumbsUp, FiZap } from 'react-icons/fi';
import {
  formatContext,
  formatUptime,
  type SystemStats,
} from './ai-dashboard-utils';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export const StatCard = ({ icon, label, value, sub, color = 'text-primary' }: StatCardProps) => (
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

export function SystemStatsGrid({ cacheHitRate, language, stats }: { cacheHitRate: number; language: string; stats: SystemStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={<FiDatabase />} label={language === 'vi' ? 'Cache (active)' : 'Cache Active'} value={stats.cache.active} sub={`${stats.cache.total} total / ${stats.cache.expired} expired`} />
      <StatCard icon={<FiZap />} label={language === 'vi' ? 'Tỉ lệ cache' : 'Cache Hit Rate'} value={`${cacheHitRate}%`} sub={language === 'vi' ? 'Tổng cache còn sống' : 'Active/Total entries'} color={cacheHitRate > 50 ? 'text-emerald-400' : 'text-amber-400'} />
      <StatCard icon={<FiServer />} label={language === 'vi' ? 'Bộ nhớ' : 'Memory'} value={`${stats.memoryMB} MB`} sub={language === 'vi' ? 'Heap JS đang dùng' : 'JS heap in use'} color="text-blue-400" />
      <StatCard icon={<FiActivity />} label={language === 'vi' ? 'Uptime' : 'Uptime'} value={formatUptime(stats.uptime)} sub={language === 'vi' ? 'Thời gian hoạt động' : 'Server running time'} color="text-emerald-400" />
    </div>
  );
}

export function ModelConfigSection({ language, stats }: { language: string; stats: SystemStats }) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-8">
      <div className="flex items-center gap-3 mb-6">
        <FiCpu className="text-primary text-xl" />
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">
          {language === 'vi' ? 'Cấu hình Model' : 'Model Configuration'}
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ModelCard accent="text-emerald-400" dot="bg-emerald-400" name="Groq" model={stats.models.groq}>
          <div>Context: <span className="text-slate-300">{formatContext(stats.models.groqContextWindow)}</span></div>
          <div>Max Tokens: <span className="text-slate-300">{stats.models.maxTokens}</span></div>
        </ModelCard>
        <ModelCard accent="text-blue-400" dot="bg-blue-400" name="Gemini" model={stats.models.gemini}>
          <div>Context: <span className="text-slate-300">{formatContext(stats.models.geminiContextWindow)}</span></div>
          <div>History: <span className="text-slate-300">{stats.models.historyLimit} msgs</span></div>
        </ModelCard>
      </div>
    </div>
  );
}

export function LogStatsGrid({ language, stats }: { language: string; stats: SystemStats }) {
  const feedbackTotal = stats.feedback?.total || 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard icon={<FiActivity />} label={language === 'vi' ? 'Tổng request' : 'Total Requests'} value={stats.logStats.total} sub={language === 'vi' ? 'Kể từ khi khởi động' : 'Since server start'} />
      <StatCard icon={<FiZap />} label={language === 'vi' ? 'Cache hits' : 'Cache Hits'} value={stats.logStats.cacheHits} sub={`${stats.logStats.total > 0 ? Math.round(stats.logStats.cacheHits / stats.logStats.total * 100) : 0}% của tổng`} color="text-emerald-400" />
      <StatCard icon={<FiDatabase />} label={language === 'vi' ? 'Latency TB' : 'Avg Latency'} value={`${stats.logStats.avgLatencyMs}ms`} sub={language === 'vi' ? 'Không tính cache hit' : 'Excluding cache hits'} color="text-blue-400" />
      <StatCard icon={<FiServer />} label={language === 'vi' ? 'Lỗi' : 'Errors'} value={stats.logStats.errors} sub={language === 'vi' ? 'Request thất bại' : 'Failed requests'} color={stats.logStats.errors > 0 ? 'text-rose-400' : 'text-emerald-400'} />
      <StatCard icon={<FiThumbsUp />} label="Feedback" value={feedbackTotal} sub={`OK ${stats.feedback?.byValue?.correct || 0} / issue ${feedbackTotal - (stats.feedback?.byValue?.correct || 0)}`} color={feedbackTotal > 0 ? 'text-violet-400' : 'text-slate-400'} />
    </div>
  );
}

export function FeedbackReportSection({ language, stats }: { language: string; stats: SystemStats }) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-8">
      <div className="flex items-center gap-3 mb-6">
        <FiThumbsUp className="text-primary text-xl" />
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">
          AI Feedback Report
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {['correct', 'wrong', 'missing_context', 'wrong_family', 'wrong_datetime'].map((value) => (
          <div key={value} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{value}</p>
            <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">{stats.feedback?.byValue?.[value] || 0}</p>
          </div>
        ))}
      </div>

      {stats.feedback?.recent?.length ? (
        <div className="grid gap-3">
          {stats.feedback.recent.map((feedback, index) => (
            <div key={`${feedback.requestLogId}-${feedback.timestamp}-${index}`} className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-violet-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-violet-400">{feedback.value}</span>
                  <span className="text-[9px] font-mono text-slate-500">{feedback.requestLogId}</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{feedback.source}</span>
                </div>
                <p className="mt-2 text-[11px] font-mono text-slate-400 truncate">
                  {feedback.intent} / {feedback.skill || '-'} / {feedback.model} / family {feedback.familyId || '-'}
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{new Date(feedback.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm font-bold text-slate-500">
          {language === 'vi' ? 'Chưa có feedback nào trong phiên server hiện tại.' : 'No feedback in the current server session yet.'}
        </p>
      )}
    </div>
  );
}

export function RagQualitySection({ language, stats }: { language: string; stats: SystemStats }) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-8">
      <div className="flex items-center gap-3 mb-6">
        <FiDatabase className="text-primary text-xl" />
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">
          RAG Quality
        </h3>
      </div>

      {stats.topRagSources?.length ? (
        <div className="grid gap-3">
          {stats.topRagSources.map((source, index) => (
            <div key={source.documentId} className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">#{index + 1}</span>
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">{source.title}</p>
                </div>
                <p className="mt-1 text-[9px] font-mono uppercase tracking-widest text-slate-500">
                  {source.category || 'uncategorized'} · {source.sourceType || 'unknown'} · {source.familyId || '-'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                <span className="text-emerald-400">{source.hits} hits</span>
                <span className="text-blue-400">best {Number(source.bestScore || 0).toFixed(3)}</span>
                <span className="text-slate-500">{new Date(source.lastRetrievedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm font-bold text-slate-500">
          {language === 'vi' ? 'Chưa có note nào được retrieve trong phiên server hiện tại.' : 'No retrieved notes in the current server session yet.'}
        </p>
      )}
    </div>
  );
}

export function CacheHealthSection({ language, stats }: { language: string; stats: SystemStats }) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-8 space-y-5">
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 mb-2">
        {language === 'vi' ? 'Trạng thái Cache' : 'Cache Health'}
      </h3>
      {[
        { label: 'Active', value: stats.cache.active, color: 'bg-emerald-500' },
        { label: 'Expired', value: stats.cache.expired, color: 'bg-amber-500' },
      ].map((bar) => (
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
  );
}

function ModelCard({
  accent,
  children,
  dot,
  model,
  name,
}: {
  accent: string;
  children: React.ReactNode;
  dot: string;
  model: string;
  name: string;
}) {
  return (
    <div className="space-y-3 p-5 rounded-xl bg-white/5 border border-white/5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot} animate-pulse`} />
        <p className={`text-[10px] font-black uppercase tracking-widest ${accent}`}>{name}</p>
      </div>
      <p className="text-sm font-bold text-slate-200 truncate">{model}</p>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
        {children}
      </div>
    </div>
  );
}
