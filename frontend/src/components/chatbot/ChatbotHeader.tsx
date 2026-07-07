import { FiActivity, FiCpu, FiMessageCircle } from 'react-icons/fi';
import type { ChatUsage } from '@/lib/api-client';
import {
  formatQuota,
  formatTokens,
  getContextBarColor,
  getContextLabel,
  getContextNote,
  getContextPercent,
  getQuotaBarColor,
  getQuotaNote,
  getQuotaPercent,
  type AiModelProvider,
} from './chatbot-usage';

type ChatbotHeaderProps = {
  activeUsage?: ChatUsage;
  isSidebarOpen: boolean;
  language: string;
  model: AiModelProvider;
  setIsSidebarOpen: (value: boolean) => void;
  setModel: (model: AiModelProvider) => void;
};

const AI_MODELS: AiModelProvider[] = ['gemini', 'groq'];

export function ChatbotHeader({
  activeUsage,
  isSidebarOpen,
  language,
  model,
  setIsSidebarOpen,
  setModel,
}: ChatbotHeaderProps) {
  return (
    <header className="px-4 py-3 md:px-6 md:py-4 border-b border-border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 md:gap-4 bg-card sticky top-0 z-20">
      <div className="flex items-center gap-3 md:gap-5 min-w-0">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 border border-black/5 dark:border-white/5 rounded-lg text-slate-600 dark:text-slate-500 hover:text-primary transition-all bg-slate-100 dark:bg-white/5 shrink-0"
        >
          <FiMessageCircle className="w-4 h-4 md:w-5 md:h-5" />
        </button>
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-xl md:text-2xl shrink-0">
          <FiActivity />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">Family<span className="text-primary">GPT</span></h2>
          <p className="text-xs text-primary font-semibold flex items-center gap-1">
            <span className="w-1 h-1 bg-primary rounded-full animate-ping" />
            {language === 'vi' ? 'Đang hoạt động' : 'Processing Active'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_132px] md:flex md:flex-row items-end md:items-center gap-3 w-full md:w-auto">
        <div className="flex flex-col gap-2 min-w-0 md:min-w-[220px]">
          <UsageMeter
            label="Context"
            value={getContextLabel(activeUsage)}
            barColor={getContextBarColor(activeUsage)}
            percent={getContextPercent(activeUsage)}
            tooltipTitle="Context Window"
            rows={[
              ['Used', formatTokens(activeUsage?.totalTokens)],
              ['Window', formatTokens(activeUsage?.contextWindow)],
              ['Remaining', formatTokens(activeUsage?.remainingTokens)],
            ]}
            note={getContextNote(activeUsage)}
          />

          <UsageMeter
            label="Quota"
            value={formatQuota(activeUsage, language)}
            barColor={getQuotaBarColor(activeUsage)}
            percent={getQuotaPercent(activeUsage)}
            tooltipTitle="API Quota"
            rows={[
              ['Remaining', formatQuota(activeUsage, language)],
              ['Request limit', formatTokens(activeUsage?.quota.limitRequests)],
              ['Token limit', formatTokens(activeUsage?.quota.limitTokens)],
              ['Reset', activeUsage?.quota.resetRequests || activeUsage?.quota.resetTokens || '--'],
            ]}
            note={getQuotaNote(activeUsage)}
            tooltipWidthClass="w-60"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <div className="px-1 text-[10px] font-semibold text-slate-500 dark:text-slate-500">
            Model <span className="text-primary">{model}</span>
          </div>
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg border border-black/5 dark:border-white/5 w-full">
            {AI_MODELS.map((item) => (
              <button
                key={item}
                onClick={() => setModel(item)}
                className={`flex-1 px-2 md:px-4 py-1.5 rounded text-xs font-semibold transition-all ${model === item ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

type UsageMeterProps = {
  barColor: string;
  label: string;
  note: string;
  percent: number;
  rows: Array<[string, string]>;
  tooltipTitle: string;
  tooltipWidthClass?: string;
  value: string;
};

function UsageMeter({
  barColor,
  label,
  note,
  percent,
  rows,
  tooltipTitle,
  tooltipWidthClass = 'w-56',
  value,
}: UsageMeterProps) {
  return (
    <div className="group relative">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          <FiCpu size={10} />
          {label}
        </span>
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-500">
          {value}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className={`pointer-events-none absolute right-0 top-full z-30 mt-2 ${tooltipWidthClass} rounded-lg border border-black/5 dark:border-white/10 bg-white dark:bg-slate-950 p-3 text-[10px] font-bold text-slate-600 dark:text-slate-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100`}>
        <div className="mb-1 font-bold text-primary">{tooltipTitle}</div>
        {rows.map(([name, rowValue]) => (
          <div key={name}>{name}: {rowValue}</div>
        ))}
        <div className="mt-2 text-slate-500 dark:text-slate-500">{note}</div>
      </div>
    </div>
  );
}
