import {
  FiArchive,
  FiCalendar,
  FiCheck,
  FiCreditCard,
  FiFileText,
  FiTrash2,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { VisionDraft } from './vision-draft-types';
import { formatAmount } from './vision-draft-utils';

type VisionDraftCardProps = {
  draft: VisionDraft;
  busy: boolean;
  language: string;
  labels: Record<string, string>;
  onSaveTransaction: () => void;
  onSaveEvents: () => void;
  onSaveKnowledge: () => void;
  onDismiss: () => void;
  t: (key: any) => string;
};

export function VisionDraftCard({
  draft,
  busy,
  language,
  labels,
  onSaveTransaction,
  onSaveEvents,
  onSaveKnowledge,
  onDismiss,
  t,
}: VisionDraftCardProps) {
  const data = draft.structuredData || {};
  const transaction = data.transactionDraft;
  const events = data.eventDrafts || [];
  const warnings = data.warnings || data.medicineDraft?.warnings || [];
  const hasKnowledgeContent = Boolean(draft.rawText || data.rawText || draft.summary || data.summary);
  const canAct = draft.status === 'DRAFT' && !busy;

  const typeLabel = t(`vision.type.${draft.draftType.toLowerCase()}` as any);
  const statusLabel = t(`vision.status.${draft.status.toLowerCase()}` as any);

  return (
    <article className="rounded-2xl border border-border bg-card p-5 space-y-5 hover:border-primary/30 transition-all shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2 py-1 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-300 text-xs font-semibold">
              {typeLabel}
            </span>
            <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-500 text-xs font-semibold">
              {statusLabel}
            </span>
          </div>
          <p className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
            {draft.summary || data.summary || t('vision.title')}
          </p>
          <p className="text-xs text-slate-400 font-semibold mt-2">
            {new Date(draft.createdAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
          <FiArchive />
        </div>
      </div>

      {transaction && (
        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-slate-950/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-2">
            <FiCreditCard /> Transaction
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Info label="Amount" value={formatAmount(transaction.amount)} />
            <Info label="Category" value={transaction.category || 'OTHER'} />
            <Info label="Date" value={transaction.date || '-'} />
            <Info label="Type" value={transaction.type || 'EXPENSE'} />
          </div>
          {transaction.description && <p className="text-xs text-slate-500 leading-relaxed">{transaction.description}</p>}
        </div>
      )}

      {events.length > 0 && (
        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-slate-950/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-2">
            <FiCalendar /> Events
          </p>
          {events.slice(0, 4).map((event, index) => (
            <div key={`${event.title || 'event'}-${index}`} className="flex items-start justify-between gap-3 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-200">{event.title || 'Untitled'}</span>
              <span className="text-slate-500 font-bold shrink-0">{event.date || '-'}</span>
            </div>
          ))}
          {events.length > 4 && (
            <p className="text-[10px] font-bold text-slate-400">+{events.length - 4} more</p>
          )}
        </div>
      )}

      {data.medicineDraft?.medicines?.length ? (
        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-slate-950/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500">Medicine</p>
          {data.medicineDraft.medicines.slice(0, 3).map((medicine, index) => (
            <p key={`${medicine.name || 'medicine'}-${index}`} className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold">{medicine.name || 'Unknown'}</span>
              {medicine.dosage ? ` - ${medicine.dosage}` : ''}
              {medicine.schedule ? ` - ${medicine.schedule}` : ''}
            </p>
          ))}
        </div>
      ) : null}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 font-bold space-y-1">
          {warnings.slice(0, 3).map((warning, index) => (
            <p key={`${warning}-${index}`}>{warning}</p>
          ))}
        </div>
      )}

      {(draft.rawText || data.rawText) && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold text-xs">{t('vision.rawText')}</summary>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed">{draft.rawText || data.rawText}</p>
        </details>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {transaction && (
          <Button onClick={onSaveTransaction} disabled={!canAct} className="h-10 px-4 flex items-center gap-2 text-xs">
            <FiCheck />
            {busy ? 'Saving...' : labels.saveTransaction}
          </Button>
        )}
        {events.length > 0 && (
          <Button onClick={onSaveEvents} disabled={!canAct} variant="outline" className="h-10 px-4 flex items-center gap-2 text-xs">
            <FiCalendar />
            {busy ? 'Saving...' : labels.saveEvents}
          </Button>
        )}
        {hasKnowledgeContent && (
          <Button onClick={onSaveKnowledge} disabled={!canAct} variant="outline" className="h-10 px-4 flex items-center gap-2 text-xs">
            <FiFileText />
            {busy ? 'Saving...' : 'Save note'}
          </Button>
        )}
        {draft.status === 'DRAFT' && (
          <Button onClick={onDismiss} disabled={busy} variant="ghost" className="h-10 px-4 flex items-center gap-2 text-xs text-slate-500 hover:text-rose-500">
            <FiTrash2 />
            {labels.dismiss}
          </Button>
        )}
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-1">{label}</p>
      <p className="font-bold text-slate-800 dark:text-slate-100 break-words">{value}</p>
    </div>
  );
}
