import { useState } from 'react';
import { FiActivity, FiCopy, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { API_URL } from '@/lib/api-client';
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
  adminSecret: string;
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
  adminSecret,
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
    <div className="glass rounded-2xl border border-black/5 dark:border-white/10 overflow-hidden">
      <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiActivity className="text-primary" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
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
              adminSecret={adminSecret}
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
}: Omit<AiDashboardRequestLogsProps, 'adminSecret' | 'buildRagContextText' | 'copyText' | 'language' | 'logs'>) {
  return (
    <div className="px-6 py-4 border-b border-black/5 dark:border-white/5 grid grid-cols-1 md:grid-cols-5 gap-3">
      <select
        value={modelFilter}
        onChange={(event) => setModelFilter(event.target.value)}
        className="h-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3 text-xs font-bold text-slate-500"
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
        className="h-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3 text-xs font-bold text-slate-500"
      />
      <select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        className="h-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3 text-xs font-bold text-slate-500"
      >
        <option value="">All status</option>
        <option value="ok">OK</option>
        <option value="error">Error</option>
        <option value="cached">Cached</option>
        <option value="needs_clarification">Needs clarification</option>
        <option value="raw_tool_blocked">Raw tool blocked</option>
        <option value="low_confidence">Low confidence</option>
        <option value="negative_feedback">Negative feedback</option>
      </select>
      <input
        value={familyIdFilter}
        onChange={(event) => setFamilyIdFilter(event.target.value)}
        placeholder="Family ID"
        className="h-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3 text-xs font-bold text-slate-500"
      />
      <select
        value={hasRagFilter}
        onChange={(event) => setHasRagFilter(event.target.value)}
        className="h-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3 text-xs font-bold text-slate-500"
      >
        <option value="">All RAG</option>
        <option value="true">Has RAG</option>
        <option value="false">No RAG</option>
      </select>
    </div>
  );
}

function RequestLogCard({
  adminSecret,
  buildRagContextText,
  copyText,
  log,
}: {
  adminSecret: string;
  buildRagContextText: (log: AiRequestLog) => string;
  copyText: (text: string) => Promise<void>;
  log: AiRequestLog;
}) {
  const status = getRequestStatus(log);
  const tools = log.toolsCalled || [];
  const hasExtendedDetail = Boolean(
    log.prompt ||
      log.normalizedPrompt ||
      log.routeConfidence !== undefined ||
      log.routeReason ||
      log.resolverTelemetry ||
      log.proposedAction ||
      log.sanitizerIncidents?.length,
  );

  return (
    <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] p-5 shadow-sm transition-all hover:border-primary/25 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${status.className}`}>
              {status.label}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getModelBadgeClass(log.model)}`}>
              {log.model === 'direct' ? 'Direct' : log.model}
            </span>
            <span className="rounded-full border border-slate-500/15 bg-slate-500/10 px-3 py-1 text-xs font-bold text-slate-500">
              {log.type === 'stream' ? 'Streaming' : 'Chat'}
            </span>
            {log.redacted && (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-500">
                PII da an
              </span>
            )}
            {log.sanitizerIncidents?.length ? (
              <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-400">
                Sanitizer {log.sanitizerIncidents.length}
              </span>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-bold leading-relaxed text-slate-900 dark:text-slate-100">
              {getRequestSummary(log)}
            </p>
            <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
              {getRagSummary(log)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-right lg:min-w-[260px]">
          <MetricCard label="Thoi gian" value={new Date(log.timestamp).toLocaleTimeString()} />
          <MetricCard label="Do tre" value={log.cached ? 'cache' : formatLatency(log.latencyMs)} warn={!log.cached && log.latencyMs > 3000} />
          <MetricCard label="Tool/RAG" value={`${tools.length}/${log.ragSnippetCount || 0}`} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="Intent" value={log.intent} />
        <InfoTile label="Skill" value={log.skill || '-'} />
        <InfoTile label="Gia dinh" value={log.familyId || '-'} />
        <FeedbackTile log={log} />
      </div>

      {tools.length > 0 && (
        <div className="mt-3 rounded-xl border border-black/5 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-3">
          <p className="text-xs font-bold text-slate-500">Tool đã gọi</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tools.map((tool) => (
              <span key={`${log.id}-${tool}`} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasExtendedDetail && <RequestDebugBlock adminSecret={adminSecret} copyText={copyText} log={log} />}

      {((log.ragSources && log.ragSources.length > 0) || log.ragQuery || log.ragMiss) && (
        <RagContextBlock buildRagContextText={buildRagContextText} copyText={copyText} log={log} />
      )}
    </div>
  );
}

function RequestDebugBlock({
  adminSecret,
  copyText,
  log,
}: {
  adminSecret: string;
  copyText: (text: string) => Promise<void>;
  log: AiRequestLog;
}) {
  const [evalStatus, setEvalStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  const debugBundle = JSON.stringify(
    {
      id: log.id,
      prompt: log.prompt,
      normalizedPrompt: log.normalizedPrompt,
      source: log.source,
      intent: log.intent,
      routeReason: log.routeReason,
      routeConfidence: log.routeConfidence,
      familyId: log.familyId,
      resolverTelemetry: log.resolverTelemetry,
      proposedAction: log.proposedAction,
      sanitizerIncidents: log.sanitizerIncidents,
      error: log.error,
      fallbackReason: log.fallbackReason,
    },
    null,
    2,
  );

  async function handleCreateEval() {
    setEvalStatus('loading');
    try {
      const res = await fetch(`${API_URL}/api/chat/admin/eval-drafts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({
          requestLogId: log.id,
          group: log.intent || 'general',
          expectedIntent: log.intent,
          expectedSkill: log.skill,
          expectedFamilyId: log.familyId,
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        setEvalStatus('ok');
        setTimeout(() => setEvalStatus('idle'), 3000);
      } else {
        setEvalStatus('error');
        setTimeout(() => setEvalStatus('idle'), 3000);
      }
    } catch {
      setEvalStatus('error');
      setTimeout(() => setEvalStatus('idle'), 3000);
    }
  }

  return (
    <details className="mt-4 rounded-2xl border border-black/5 dark:border-white/10 bg-slate-100 dark:bg-slate-950/30 p-4">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        Request detail
      </summary>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <DetailPanel label="Prompt" value={log.prompt || '-'} copyText={copyText} />
        <DetailPanel label="Normalized prompt" value={log.normalizedPrompt || '-'} copyText={copyText} />
        <DetailPanel
          label="Route"
          value={`intent=${log.intent}\nreason=${log.routeReason || '-'}\nconfidence=${log.routeConfidence ?? '-'}`}
          copyText={copyText}
        />
        <DetailPanel
          label="Transport / family mode"
          value={`source=${log.source || '-'}\nfamilyId=${log.familyId || '-'}\nfeedbacks=${log.feedbacks?.length || 0}\nneedsClarification=${log.needsClarification ? 'yes' : 'no'}`}
          copyText={copyText}
        />
        <JsonPanel label="Resolver telemetry" value={log.resolverTelemetry} copyText={copyText} />
        <JsonPanel label="Proposed action" value={log.proposedAction} copyText={copyText} />
        <JsonPanel label="Sanitizer incidents" value={log.sanitizerIncidents} copyText={copyText} />
        <DetailPanel label="Provider fallback" value={`error=${log.error || '-'}\nfallback=${log.fallbackReason || '-'}\nmodelChoice=${log.modelChoiceReason || '-'}`} copyText={copyText} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <button
          onClick={handleCreateEval}
          disabled={evalStatus === 'loading'}
          className="h-8 px-3 rounded-lg bg-primary/10 border border-primary/20 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-40 flex items-center gap-2"
        >
          {evalStatus === 'ok' && <FiCheckCircle size={12} className="text-emerald-400" />}
          {evalStatus === 'error' && <FiAlertCircle size={12} className="text-rose-400" />}
          {evalStatus === 'loading' ? 'Đang lưu...' : evalStatus === 'ok' ? 'Đã tạo eval!' : evalStatus === 'error' ? 'Lỗi, thử lại' : 'Tạo eval từ request'}
        </button>
        <CopyButton label="Copy debug bundle" onClick={() => copyText(debugBundle)} />
      </div>
    </details>
  );
}

function DetailPanel({
  copyText,
  label,
  value,
}: {
  copyText: (text: string) => Promise<void>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-black/5 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <CopyButton label="Copy" onClick={() => copyText(value)} />
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">{value}</pre>
    </div>
  );
}

function JsonPanel({
  copyText,
  label,
  value,
}: {
  copyText: (text: string) => Promise<void>;
  label: string;
  value: unknown;
}) {
  const text = value ? JSON.stringify(value, null, 2) : '-';
  return <DetailPanel label={label} value={text} copyText={copyText} />;
}

function MetricCard({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-black/5 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xs font-bold ${warn ? 'text-amber-500' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">{value}</p>
    </div>
  );
}

function FeedbackTile({ log }: { log: AiRequestLog }) {
  return (
    <div className="rounded-xl bg-slate-100 dark:bg-white/5 p-3">
      <p className="text-xs font-bold text-slate-500">Feedback</p>
      {log.feedbacks?.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {log.feedbacks.slice(-2).map((feedback, index) => (
            <span key={`${log.id}-feedback-${index}`} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-bold text-violet-500">
              {getFeedbackLabel(feedback.value)}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] font-bold text-slate-500">Chua co</p>
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
          <p className="text-xs font-bold text-primary">RAG context</p>
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
            <div key={`friendly-rag-${log.id}-${source.documentId}-${source.chunkIndex}-${index}`} className="rounded-xl border border-black/5 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
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
      className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-primary disabled:opacity-40 flex items-center gap-2"
    >
      <FiCopy size={12} /> {label}
    </button>
  );
}
