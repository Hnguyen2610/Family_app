'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiEye,
  FiFileText,
  FiImage,
  FiRefreshCw,
  FiUpload,
} from 'react-icons/fi';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import api, { chatAPI, eventsAPI } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { compressImage, isCloudinaryConfigured, uploadToCloudinary } from '@/lib/image-utils';
import { VisionDraft, VisionDraftKind, VisionDraftStatus } from './vision-drafts/vision-draft-types';
import {
  normalizeDate,
  normalizeEventType,
  normalizeTransactionCategory,
  normalizeTransactionType,
} from './vision-drafts/vision-draft-utils';
import { VisionDraftCard } from './vision-drafts/VisionDraftCard';

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
      const compressed = await compressImage(file, { maxDimension: 960, quality: 0.62 });
      setImage(compressed.dataUrl);
      setImageUrl('');
      setImageName(file.name);

      if (isCloudinaryConfigured()) {
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
      toast.error(language === 'vi' ? 'Draft không có nội dung RAG hợp lệ' : 'Draft has no valid knowledge content');
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
      toast.success(language === 'vi' ? 'Đã lưu vào sổ tay gia đình' : 'Saved to family knowledge');
    } catch (error) {
      console.error('Failed to save vision draft to knowledge:', error);
      toast.error(language === 'vi' ? 'Không lưu được vào sổ tay' : 'Unable to save to family knowledge');
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
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-500 text-2xl border border-sky-500/20">
            <FiEye />
          </div>
          <div>
            <h2 className="text-2xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {copy.title}
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
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

      <section className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!familyId || isCreating}
            className="h-20 lg:w-60 rounded-2xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary transition-all flex items-center justify-center gap-3 font-semibold text-sm disabled:opacity-50"
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
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
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
              <p className="text-xs font-semibold text-slate-400">
                {imageTransport}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300">
            {copy.subtitle}
          </h3>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatus(option.id)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
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
          <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            <FiFileText className="mx-auto text-4xl text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-sm font-bold text-slate-500">
              {isLoading ? (language === 'vi' ? 'Đang tải draft...' : 'Loading drafts...') : copy.empty}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {drafts.map((draft) => (
            <VisionDraftCard
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
