'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiArchive,
  FiCalendar,
  FiCheck,
  FiCreditCard,
  FiEye,
  FiFileText,
  FiImage,
  FiRefreshCw,
  FiTrash2,
  FiUpload,
} from 'react-icons/fi';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import api, { chatAPI, eventsAPI } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type VisionDraftKind = 'auto' | 'receipt' | 'medicine' | 'school_plan';
type VisionDraftStatus = 'ALL' | 'DRAFT' | 'CONFIRMED' | 'DISMISSED';

type TransactionDraft = {
  amount?: number | string | null;
  type?: string | null;
  category?: string | null;
  description?: string | null;
  date?: string | null;
};

type EventDraft = {
  title?: string | null;
  date?: string | null;
  time?: string | null;
  type?: string | null;
  description?: string | null;
};

type VisionStructuredData = {
  draftType?: string;
  summary?: string;
  rawText?: string;
  confidence?: number;
  transactionDraft?: TransactionDraft | null;
  eventDrafts?: EventDraft[];
  medicineDraft?: {
    patient?: string | null;
    medicines?: { name?: string | null; dosage?: string | null; schedule?: string | null; notes?: string | null }[];
    warnings?: string[];
  } | null;
  warnings?: string[];
};

type VisionDraft = {
  id: string;
  familyId: string;
  userId?: string | null;
  draftType: string;
  status: 'DRAFT' | 'CONFIRMED' | 'DISMISSED';
  summary?: string | null;
  rawText?: string | null;
  structuredData: VisionStructuredData;
  metadata?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
};

const KIND_OPTIONS: { id: VisionDraftKind; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'medicine', label: 'Medicine' },
  { id: 'school_plan', label: 'School plan' },
];

const STATUS_OPTIONS: { id: VisionDraftStatus; label: string }[] = [
  { id: 'DRAFT', label: 'Draft' },
  { id: 'CONFIRMED', label: 'Saved' },
  { id: 'DISMISSED', label: 'Dismissed' },
  { id: 'ALL', label: 'All' },
];

const TRANSACTION_TYPES = new Set(['INCOME', 'EXPENSE']);
const TRANSACTION_CATEGORIES = new Set([
  'FOOD',
  'TRANSPORT',
  'SHOPPING',
  'UTILITIES',
  'RENT',
  'ENTERTAINMENT',
  'HEALTH',
  'EDUCATION',
  'SALARY',
  'BONUS',
  'INVESTMENT',
  'OTHER',
]);
const EVENT_TYPES = new Set(['BIRTHDAY', 'ANNIVERSARY', 'APPOINTMENT', 'REMINDER', 'TASK', 'GENERAL']);

const MAX_IMAGE_DIMENSION = 960;
const JPEG_QUALITY = 0.62;
const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function VisionDrafts() {
  const { user, currentFamilyId } = useAuth();
  const { t, language } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<VisionDraft[]>([]);
  const [kind, setKind] = useState<VisionDraftKind>('auto');
  const [status, setStatus] = useState<VisionDraftStatus>('DRAFT');
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageName, setImageName] = useState('');
  const [imageTransport, setImageTransport] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);

  const familyId = currentFamilyId && currentFamilyId !== 'all' ? currentFamilyId : '';
  const selectedFamily = useMemo(
    () => user?.families?.find((family) => family.id === familyId) || user?.family,
    [familyId, user],
  );

  const copy = {
    title: t('vision.title'),
    subtitle: t('vision.subtitle'),
    chooseFamily: t('vision.chooseFamily'),
    pickImage: t('vision.pickImage'),
    createDraft: t('vision.createDraft'),
    creating: t('vision.creating'),
    refresh: t('vision.refresh'),
    notePlaceholder: t('vision.notePlaceholder'),
    empty: t('vision.empty'),
    saveTransaction: t('vision.saveTransaction'),
    saveEvents: t('vision.saveEvents'),
    dismiss: t('vision.dismiss'),
  };

  const loadDrafts = async () => {
    if (!familyId) return;
    setIsLoading(true);
    try {
      const response = await chatAPI.getVisionDrafts(familyId, status);
      setDrafts(response.data || []);
    } catch (error) {
      console.error('Failed to load vision drafts:', error);
      toast.error(language === 'vi' ? 'Không tải được ảnh' : 'Unable to load vision drafts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, [familyId, status]);

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(language === 'vi' ? 'File không phải là ảnh' : 'This file is not an image');
      return;
    }

    try {
      toast.loading(language === 'vi' ? 'Đang nén ảnh...' : 'Compressing image...', { id: 'vision-image' });
      const compressed = await compressImage(file);
      setImage(compressed.dataUrl);
      setImageUrl('');
      setImageName(file.name);

      if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET) {
        toast.loading(language === 'vi' ? 'Đang upload Cloudinary...' : 'Uploading to Cloudinary...', { id: 'vision-image' });
        const uploadedUrl = await uploadToCloudinary(compressed.blob, file.name);
        setImage('');
        setImageUrl(uploadedUrl);
        setImageTransport('Cloudinary URL');
        toast.success(language === 'vi' ? 'Đã upload ảnh' : 'Image uploaded', { id: 'vision-image' });
      } else {
        setImageTransport('Base64 fallback');
        toast.success(language === 'vi' ? 'Đã sẵn sàng gửi ảnh' : 'Image ready', { id: 'vision-image' });
      }
    } catch (error) {
      console.error('Failed to prepare image:', error);
      toast.error(language === 'vi' ? 'Không xử lý được ảnh' : 'Unable to prepare image', { id: 'vision-image' });
    } finally {
      event.target.value = '';
    }
  };

  const handleCreateDraft = async () => {
    if (!familyId) {
      toast.error(copy.chooseFamily);
      return;
    }
    if (!image && !imageUrl) {
      toast.error(language === 'vi' ? 'Hãy chọn ảnh trước' : 'Choose an image first');
      return;
    }

    setIsCreating(true);
    try {
      await chatAPI.createVisionDraft({
        familyId,
        userId: user?.id,
        image: imageUrl ? undefined : image,
        imageUrl: imageUrl || undefined,
        kind,
        note: note.trim() || undefined,
      });
      setImage('');
      setImageUrl('');
      setImageName('');
      setImageTransport('');
      setNote('');
      await loadDrafts();
      toast.success(language === 'vi' ? 'Đã tạo draft để xem xét' : 'Draft created for review');
    } catch (error) {
      console.error('Failed to create vision draft:', error);
      toast.error(language === 'vi' ? 'Không tạo được draft từ ảnh' : 'Unable to create image draft');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveTransaction = async (draft: VisionDraft) => {
    const transaction = draft.structuredData?.transactionDraft;
    const amount = Number(transaction?.amount);
    if (!transaction || !Number.isFinite(amount) || amount <= 0) {
      toast.error(language === 'vi' ? 'Draft không có số tiền hợp lệ' : 'Draft has no valid amount');
      return;
    }

    setBusyDraftId(draft.id);
    try {
      await api.post('/api/finance/transaction', {
        amount,
        type: normalizeTransactionType(transaction.type),
        category: normalizeTransactionCategory(transaction.category),
        description: transaction.description || draft.summary || 'Vision draft transaction',
        date: normalizeDate(transaction.date),
      });
      await markDraft(draft.id, 'CONFIRMED');
      toast.success(language === 'vi' ? 'Đã lưu vào thu chi' : 'Saved to finance');
    } catch (error) {
      console.error('Failed to save transaction draft:', error);
      toast.error(language === 'vi' ? 'Không lưu được thu chi' : 'Unable to save transaction');
    } finally {
      setBusyDraftId(null);
    }
  };

  const handleSaveEvents = async (draft: VisionDraft) => {
    const events = (draft.structuredData?.eventDrafts || []).filter((event) => event.title && event.date);
    if (!events.length || !familyId || !user?.id) {
      toast.error(language === 'vi' ? 'Draft không có sự kiện hợp lệ' : 'Draft has no valid events');
      return;
    }

    setBusyDraftId(draft.id);
    try {
      await Promise.all(
        events.map((event) =>
          eventsAPI.create(familyId, user.id, {
            title: event.title,
            description: event.description || draft.summary || undefined,
            date: normalizeDate(event.date),
            time: event.time || undefined,
            type: normalizeEventType(event.type),
            scope: 'FAMILY',
          }),
        ),
      );
      await markDraft(draft.id, 'CONFIRMED');
      toast.success(language === 'vi' ? 'Đã lưu vào lịch' : 'Saved to calendar');
    } catch (error) {
      console.error('Failed to save event draft:', error);
      toast.error(language === 'vi' ? 'Không lưu được lịch' : 'Unable to save events');
    } finally {
      setBusyDraftId(null);
    }
  };

  const handleSaveKnowledge = async (draft: VisionDraft) => {
    const content = draft.rawText || draft.structuredData?.rawText || draft.summary || '';
    if (!familyId || !content.trim()) {
      toast.error(language === 'vi' ? 'Draft khÃ´ng cÃ³ ná»™i dung RAG há»£p lá»‡' : 'Draft has no valid knowledge content');
      return;
    }

    setBusyDraftId(draft.id);
    try {
      await chatAPI.createKnowledgeDocument({
        familyId,
        title: draft.summary || draft.structuredData?.summary || 'Vision draft note',
        content,
        userId: user?.id,
        metadata: {
          category: draft.draftType || 'vision',
          source: 'vision_draft',
          draftId: draft.id,
        },
      });
      await markDraft(draft.id, 'CONFIRMED');
      toast.success(language === 'vi' ? 'ÄÃ£ lÆ°u vÃ o sá»• tay gia Ä‘Ã¬nh' : 'Saved to family knowledge');
    } catch (error) {
      console.error('Failed to save vision draft to knowledge:', error);
      toast.error(language === 'vi' ? 'KhÃ´ng lÆ°u Ä‘Æ°á»£c vÃ o sá»• tay' : 'Unable to save to family knowledge');
    } finally {
      setBusyDraftId(null);
    }
  };

  const markDraft = async (id: string, nextStatus: Exclude<VisionDraftStatus, 'ALL'>) => {
    if (!familyId) return;
    await chatAPI.updateVisionDraftStatus(id, familyId, nextStatus);
    setDrafts((items) => items.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
  };

  const handleDismiss = async (draft: VisionDraft) => {
    if (!window.confirm(language === 'vi' ? 'Bỏ qua draft này?' : 'Dismiss this draft?')) return;
    setBusyDraftId(draft.id);
    try {
      await markDraft(draft.id, 'DISMISSED');
      toast.success(language === 'vi' ? 'Đã bỏ qua draft' : 'Draft dismissed');
    } catch (error) {
      console.error('Failed to dismiss draft:', error);
      toast.error(language === 'vi' ? 'Không cập nhật được draft' : 'Unable to update draft');
    } finally {
      setBusyDraftId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-500 text-2xl border border-sky-500/20">
            <FiEye />
          </div>
          <div>
            <h2 className="text-2xl md:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tighter uppercase italic">
              {copy.title}
            </h2>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
              {selectedFamily?.name || copy.chooseFamily}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={loadDrafts} disabled={!familyId || isLoading} className="h-10 px-4 flex items-center gap-2">
          <FiRefreshCw className={isLoading ? 'animate-spin' : ''} />
          {copy.refresh}
        </Button>
      </div>

      {!familyId && (
        <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-bold">
          {copy.chooseFamily}
        </div>
      )}

      <section className="glass rounded-2xl border border-black/5 dark:border-white/5 p-6 md:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!familyId || isCreating}
            className="h-20 lg:w-60 rounded-2xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary transition-all flex items-center justify-center gap-3 font-black text-[11px] uppercase tracking-widest disabled:opacity-50"
          >
            <FiImage />
            {imageName || copy.pickImage}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap gap-2">
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setKind(option.id)}
                  disabled={!familyId || isCreating}
                  className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                    kind === option.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                      : 'bg-slate-100/70 dark:bg-slate-900/60 text-slate-500 border-black/5 dark:border-white/5 hover:text-primary hover:border-primary/30'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={!familyId || isCreating}
                placeholder={copy.notePlaceholder}
                className="h-12"
              />
              <Button onClick={handleCreateDraft} disabled={!familyId || (!image && !imageUrl) || isCreating} className="h-12 px-6 flex items-center gap-2">
                <FiUpload />
                {isCreating ? copy.creating : copy.createDraft}
              </Button>
            </div>
            {imageTransport && (
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                {imageTransport}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            {copy.subtitle}
          </h3>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatus(option.id)}
                className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                  status === option.id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 border-transparent'
                    : 'bg-slate-100/70 dark:bg-slate-900/60 text-slate-500 border-black/5 dark:border-white/5'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {drafts.length === 0 && (
          <div className="glass rounded-2xl border border-black/5 dark:border-white/5 p-10 text-center">
            <FiFileText className="mx-auto text-4xl text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-sm font-bold text-slate-500">
              {isLoading ? (language === 'vi' ? 'Đang tải draft...' : 'Loading drafts...') : copy.empty}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              busy={busyDraftId === draft.id}
              language={language}
              onSaveTransaction={() => handleSaveTransaction(draft)}
              onSaveEvents={() => handleSaveEvents(draft)}
              onSaveKnowledge={() => handleSaveKnowledge(draft)}
              onDismiss={() => handleDismiss(draft)}
              labels={copy}
              t={t}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DraftCard({
  draft,
  busy,
  language,
  labels,
  onSaveTransaction,
  onSaveEvents,
  onSaveKnowledge,
  onDismiss,
  t,
}: {
  draft: VisionDraft;
  busy: boolean;
  language: string;
  labels: Record<string, string>;
  onSaveTransaction: () => void;
  onSaveEvents: () => void;
  onSaveKnowledge: () => void;
  onDismiss: () => void;
  t: (key: any) => string;
}) {
  const data = draft.structuredData || {};
  const transaction = data.transactionDraft;
  const events = data.eventDrafts || [];
  const warnings = data.warnings || data.medicineDraft?.warnings || [];
  const hasKnowledgeContent = Boolean(draft.rawText || data.rawText || draft.summary || data.summary);
  const canAct = draft.status === 'DRAFT' && !busy;

  const typeLabel = t(`vision.type.${draft.draftType.toLowerCase()}` as any);
  const statusLabel = t(`vision.status.${draft.status.toLowerCase()}` as any);

  return (
    <article className="glass rounded-2xl border border-black/5 dark:border-white/5 p-5 space-y-5 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2 py-1 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-300 text-[9px] font-black uppercase tracking-widest">
              {typeLabel}
            </span>
            <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-500 text-[9px] font-black uppercase tracking-widest">
              {statusLabel}
            </span>
          </div>
          <p className="font-black text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
            {draft.summary || data.summary || t('vision.title')}
          </p>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-2">
            {new Date(draft.createdAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
          <FiArchive />
        </div>
      </div>

      {transaction && (
        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-slate-950/30 p-4 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
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
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
            <FiCalendar /> Events
          </p>
          {events.slice(0, 4).map((event, index) => (
            <div key={`${event.title || 'event'}-${index}`} className="flex items-start justify-between gap-3 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-200">{event.title || 'Untitled'}</span>
              <span className="text-slate-500 font-black shrink-0">{event.date || '-'}</span>
            </div>
          ))}
          {events.length > 4 && (
            <p className="text-[10px] font-bold text-slate-400">+{events.length - 4} more</p>
          )}
        </div>
      )}

      {data.medicineDraft?.medicines?.length ? (
        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-white/60 dark:bg-slate-950/30 p-4 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Medicine</p>
          {data.medicineDraft.medicines.slice(0, 3).map((medicine, index) => (
            <p key={`${medicine.name || 'medicine'}-${index}`} className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-black">{medicine.name || 'Unknown'}</span>
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
          <summary className="cursor-pointer font-black uppercase tracking-widest text-[9px]">{t('vision.rawText')}</summary>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed">{draft.rawText || data.rawText}</p>
        </details>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {transaction && (
          <Button onClick={onSaveTransaction} disabled={!canAct} className="h-10 px-4 flex items-center gap-2 text-[10px] uppercase tracking-widest">
            <FiCheck />
            {busy ? 'Saving...' : labels.saveTransaction}
          </Button>
        )}
        {events.length > 0 && (
          <Button onClick={onSaveEvents} disabled={!canAct} variant="outline" className="h-10 px-4 flex items-center gap-2 text-[10px] uppercase tracking-widest">
            <FiCalendar />
            {busy ? 'Saving...' : labels.saveEvents}
          </Button>
        )}
        {hasKnowledgeContent && (
          <Button onClick={onSaveKnowledge} disabled={!canAct} variant="outline" className="h-10 px-4 flex items-center gap-2 text-[10px] uppercase tracking-widest">
            <FiFileText />
            {busy ? 'Saving...' : 'Save note'}
          </Button>
        )}
        {draft.status === 'DRAFT' && (
          <Button onClick={onDismiss} disabled={busy} variant="ghost" className="h-10 px-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 hover:text-rose-500">
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
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="font-black text-slate-800 dark:text-slate-100 break-words">{value}</p>
    </div>
  );
}

async function compressImage(file: File): Promise<{ dataUrl: string; blob: Blob }> {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return { dataUrl, blob: file };
  context.drawImage(image, 0, 0, width, height);
  const compressedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const blob = await canvasToBlob(canvas);
  return { dataUrl: compressedDataUrl, blob };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob || dataUrlToBlob(canvas.toDataURL('image/jpeg', JPEG_QUALITY))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

async function uploadToCloudinary(blob: Blob, fileName: string) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary is not configured');
  }

  const formData = new FormData();
  formData.append('file', blob, fileName.replace(/\.[^.]+$/, '.jpg'));
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Cloudinary upload failed: ${response.status}${errorText ? ` - ${errorText.slice(0, 120)}` : ''}`);
  }

  const result = await response.json();
  return optimizeCloudinaryUrl(result.secure_url || result.url);
}

function optimizeCloudinaryUrl(url: string) {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_960,c_limit/');
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function normalizeTransactionType(value?: string | null) {
  const candidate = String(value || 'EXPENSE').toUpperCase();
  return TRANSACTION_TYPES.has(candidate) ? candidate : 'EXPENSE';
}

function normalizeTransactionCategory(value?: string | null) {
  const candidate = String(value || 'OTHER').toUpperCase();
  return TRANSACTION_CATEGORIES.has(candidate) ? candidate : 'OTHER';
}

function normalizeEventType(value?: string | null) {
  const candidate = String(value || 'GENERAL').toUpperCase();
  return EVENT_TYPES.has(candidate) ? candidate : 'GENERAL';
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function formatAmount(value?: number | string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
