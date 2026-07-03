import { FiActivity, FiCopy } from 'react-icons/fi';
import {
  formatLatency,
  getFeedbackLabel,
  getModelBadgeClass,
  getRagSummary,
  getRequestStatus,
  getRequestSummary,
  type AiRequestLog,
} from './ai-dashboard-utils';

type AiDashboardRequestLogsProps = {
  buildRagContextText: (log: AiRequestLog) => string;
  copyText: (text: string) => Promise<void>;
  familyIdFilter: string;
  hasRagFilter: string;
  language: string;
  logs: AiRequestLog[];
  modelFilter: string;
  setFamilyIdFilter: (value: string) => void;
  setHasRagFilter: (value: string) => void;
  setModelFilter: (value: string) => void;
  setSkillFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  skillFilter: string;
  statusFilter: string;
};

export function AiDashboardRequestLogs({
  buildRagContextText,
  copyText,
  familyIdFilter,
  hasRagFilter,
  language,
  logs,
  modelFilter,
  setFamilyIdFilter,
  setHasRagFilter,
  setModelFilter,
  setSkillFilter,
  setStatusFilter,
  skillFilter,
  statusFilter,
}: AiDashboardRequestLogsProps) {
  return (
    <div className="glass rounded-2xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiActivity className="text-primary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">
            {language === 'vi' ? 'Request gần đây' : 'Recent Requests'} ({logs.length})
          </h3>
        </div>
      </div>

      <RequestFilters
        familyIdFilter={familyIdFilter}
        hasRagFilter={hasRagFilter}
        modelFilter={modelFilter}
        setFamilyIdFilter={setFamilyIdFilter}
        setHasRagFilter={setHasRagFilter}
        setModelFilter={setModelFilter}
        setSkillFilter={setSkillFilter}
        setStatusFilter={setStatusFilter}
        skillFilter={skillFilter}
        statusFilter={statusFilter}
      />

      {logs.length === 0 ? (
        <div className="p-10 text-center text-slate-500 text-sm font-bold">
          {language === 'vi' ? 'Chưa có request nào. Gửi tin nhắn AI để bắt đầu.' : 'No requests yet. Send an AI message to begin.'}
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {logs.map((log) => (
            <RequestLogCard
              key={`friendly-${log.id}`}
              buildRagContextText={buildRagContextText}
              copyText={copyText}
              log={log}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestFilters({
  familyIdFilter,
  hasRagFilter,
  modelFilter,
  setFamilyIdFilter,
  setHasRagFilter,
  setModelFilter,
  setSkillFilter,
  setStatusFilter,
  skillFilter,
  statusFilter,
}: Omit<AiDashboardRequestLogsProps, 'buildRagContextText' | 'copyText' | 'language' | 'logs'>) {
  return (
    <div className="px-6 py-4 border-b border-white/5 grid grid-cols-1 md:grid-cols-5 gap-3">
      <select
        value={modelFilter}
        onChange={(event) => setModelFilter(event.target.value)}
        className="h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
      >
        <option value="">All models</option>
        <option value="groq">Groq</option>
        <option value="gemini">Gemini</option>
        <option value="direct">Direct</option>
      </select>
      <input
        value={skillFilter}
        onChange={(event) => setSkillFilter(event.target.value)}
        placeholder="Skill filter"
        className="h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
      />
      <select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        className="h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
      >
        <option value="">All status</option>
        <option value="ok">OK</option>
        <option value="error">Error</option>
        <option value="cached">Cached</option>
      </select>
      <input
        value={familyIdFilter}
        onChange={(event) => setFamilyIdFilter(event.target.value)}
        placeholder="Family ID"
        className="h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
      />
      <select
        value={hasRagFilter}
        onChange={(event) => setHasRagFilter(event.target.value)}
        className="h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
      >
        <option value="">All RAG</option>
        <option value="true">Has RAG</option>
        <option value="false">No RAG</option>
      </select>
    </div>
  );
}

function RequestLogCard({
  buildRagContextText,
  copyText,
  log,
}: {
  buildRagContextText: (log: AiRequestLog) => string;
  copyText: (text: string) => Promise<void>;
  log: AiRequestLog;
}) {
  const status = getRequestStatus(log);
  const tools = log.toolsCalled || [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-sm transition-all hover:border-primary/25 hover:bg-white/[0.06]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${status.className}`}>
              {status.label}
            </span>
            <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${getModelBadgeClass(log.model)}`}>
              {log.model === 'direct' ? 'Direct' : log.model}
            </span>
            <span className="rounded-full border border-slate-500/15 bg-slate-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
              {log.type === 'stream' ? 'Streaming' : 'Chat'}
            </span>
            {log.redacted && (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-amber-500">
                PII đã ẩn
              </span>
            )}
          </div>

          <div>
            <p className="text-sm font-black leading-relaxed text-slate-900 dark:text-slate-100">
              {getRequestSummary(log)}
            </p>
            <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
              {getRagSummary(log)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-right lg:min-w-[260px]">
          <MetricCard label="Thời gian" value={new Date(log.timestamp).toLocaleTimeString()} />
          <MetricCard label="Độ trễ" value={log.cached ? 'cache' : formatLatency(log.latencyMs)} warn={!log.cached && log.latencyMs > 3000} />
          <MetricCard label="Tool/RAG" value={`${tools.length}/${log.ragSnippetCount || 0}`} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="Intent" value={log.intent} />
        <InfoTile label="Skill" value={log.skill || '-'} />
        <InfoTile label="Gia đình" value={log.familyId || '-'} />
        <FeedbackTile log={log} />
      </div>

      {tools.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Tool đã gọi</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tools.map((tool) => (
              <span key={`${log.id}-${tool}`} className="rounded-full bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {((log.ragSources && log.ragSources.length > 0) || log.ragQuery || log.ragMiss) && (
        <RagContextBlock buildRagContextText={buildRagContextText} copyText={copyText} log={log} />
      )}
    </div>
  );
}

function MetricCard({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xs font-black ${warn ? 'text-amber-500' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">{value}</p>
    </div>
  );
}

function FeedbackTile({ log }: { log: AiRequestLog }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Feedback</p>
      {log.feedbacks?.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {log.feedbacks.slice(-2).map((feedback, index) => (
            <span key={`${log.id}-feedback-${index}`} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-violet-500">
              {getFeedbackLabel(feedback.value)}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] font-bold text-slate-500">Chưa có</p>
      )}
    </div>
  );
}

function RagContextBlock({
  buildRagContextText,
  copyText,
  log,
}: {
  buildRagContextText: (log: AiRequestLog) => string;
  copyText: (text: string) => Promise<void>;
  log: AiRequestLog;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">RAG context</p>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
            Query: {log.ragQuery || '-'}
          </p>
        </div>
        <div className="flex gap-2">
          <CopyButton label="Copy query" disabled={!log.ragQuery} onClick={() => copyText(log.ragQuery || '')} />
          <CopyButton label="Copy context" disabled={!log.ragSources?.length} onClick={() => copyText(buildRagContextText(log))} />
        </div>
      </div>

      {log.ragSources?.length ? (
        <div className="mt-3 grid gap-3">
          {log.ragSources.map((source, index) => (
            <div key={`friendly-rag-${log.id}-${source.documentId}-${source.chunkIndex}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                <span className="text-primary">#{index + 1}</span>
                <span className="text-slate-900 dark:text-slate-100">{source.title}</span>
                <span className="text-slate-500">chunk {source.chunkIndex + 1}</span>
                <span className="text-emerald-500">score {Number(source.score || 0).toFixed(3)}</span>
                <span className="text-blue-500">{source.category || 'uncategorized'}</span>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">
                {source.snippet || '-'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs font-bold text-amber-500">
          Không có đoạn ghi chú nào được lấy ra cho query này.
        </p>
      )}
    </div>
  );
}

function CopyButton({ disabled, label, onClick }: { disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-primary disabled:opacity-40 flex items-center gap-2"
    >
      <FiCopy size={12} /> {label}
    </button>
  );
}
