'use client';

import { useEffect, useMemo, useState } from 'react';
import { FiArrowLeft, FiBookOpen, FiEdit2, FiFileText, FiPlus, FiRefreshCw, FiSave, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { chatAPI } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getDateLocale } from '@/utils/date';

type KnowledgeDocument = {
  id: string;
  title: string;
  content?: string;
  sourceType: string;
  createdBy?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  _count?: { chunks: number };
  chunks?: Array<{ id: string; content: string; chunkIndex: number }>;
};

export default function FamilyNotes({ onBack }: { readonly onBack?: () => void }) {
  const { user, currentFamilyId } = useAuth();
  const { language } = useTranslation();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('family');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [isUpdatingDocument, setIsUpdatingDocument] = useState(false);
  const [editingDocument, setEditingDocument] = useState<KnowledgeDocument | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('family');

  const familyId = currentFamilyId && currentFamilyId !== 'all' ? currentFamilyId : '';
  const selectedFamily = useMemo(
    () => user?.families?.find((family) => family.id === familyId) || user?.family,
    [familyId, user],
  );

  const categories = [
    { id: 'family', label: language === 'vi' ? 'Gia đình' : 'Family' },
    { id: 'health', label: language === 'vi' ? 'Sức khỏe' : 'Health' },
    { id: 'school', label: language === 'vi' ? 'Học tập' : 'School' },
    { id: 'meal', label: language === 'vi' ? 'Ăn uống' : 'Meals' },
    { id: 'finance', label: language === 'vi' ? 'Tài chính' : 'Finance' },
    { id: 'other', label: language === 'vi' ? 'Khác' : 'Other' },
  ];

  const loadDocuments = async () => {
    if (!familyId) return;
    setIsLoading(true);
    try {
      const response = await chatAPI.getKnowledgeDocuments(familyId);
      setDocuments(response.data || []);
    } catch (error) {
      console.error('Failed to load family notes:', error);
      toast.error(language === 'vi' ? 'Không tải được sổ tay' : 'Unable to load notes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [familyId]);

  const handleCreate = async () => {
    if (!familyId) {
      toast.error(language === 'vi' ? 'Hãy chọn một gia đình cụ thể' : 'Choose a specific family');
      return;
    }
    if (!title.trim() || !content.trim()) {
      toast.error(language === 'vi' ? 'Cần nhập tiêu đề và nội dung' : 'Title and content are required');
      return;
    }

    setIsSaving(true);
    try {
      await chatAPI.createKnowledgeDocument({
        familyId,
        title: title.trim(),
        content: content.trim(),
        userId: user?.id,
        metadata: { category },
      });
      setTitle('');
      setContent('');
      setCategory('family');
      await loadDocuments();
      toast.success(language === 'vi' ? 'Đã lưu vào sổ tay AI' : 'Saved to AI notes');
    } catch (error) {
      console.error('Failed to create family note:', error);
      toast.error(language === 'vi' ? 'Không lưu được ghi chú' : 'Unable to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!familyId) return;
    const confirmed = window.confirm(
      language === 'vi'
        ? 'Xóa ghi chú này khỏi RAG? AI sẽ không dùng nó để trả lời nữa.'
        : 'Delete this note from RAG? AI will no longer use it.',
    );
    if (!confirmed) return;

    try {
      await chatAPI.deleteKnowledgeDocument(id, familyId);
      setDocuments((items) => items.filter((item) => item.id !== id));
      toast.success(language === 'vi' ? 'Đã xóa ghi chú' : 'Note deleted');
    } catch (error) {
      console.error('Failed to delete family note:', error);
      toast.error(language === 'vi' ? 'Không xóa được ghi chú' : 'Unable to delete note');
    }
  };

  const handleOpenEditor = async (id: string) => {
    if (!familyId) return;
    setIsEditorOpen(true);
    setIsLoadingDocument(true);
    setEditingDocument(null);
    try {
      const response = await chatAPI.getKnowledgeDocument(id, familyId);
      const document = response.data as KnowledgeDocument;
      setEditingDocument(document);
      setEditTitle(document.title || '');
      setEditContent(document.content || '');
      setEditCategory(document.metadata?.category || 'family');
    } catch (error) {
      console.error('Failed to load note detail:', error);
      toast.error(language === 'vi' ? 'Không mở được ghi chú' : 'Unable to open note');
      setIsEditorOpen(false);
    } finally {
      setIsLoadingDocument(false);
    }
  };

  const handleUpdateDocument = async () => {
    if (!familyId || !editingDocument) return;
    if (!editTitle.trim() || !editContent.trim()) {
      toast.error(language === 'vi' ? 'Cần nhập tiêu đề và nội dung' : 'Title and content are required');
      return;
    }

    setIsUpdatingDocument(true);
    try {
      await chatAPI.updateKnowledgeDocument(editingDocument.id, familyId, {
        title: editTitle.trim(),
        content: editContent.trim(),
        metadata: {
          ...(editingDocument.metadata || {}),
          category: editCategory,
        },
      });
      await loadDocuments();
      setIsEditorOpen(false);
      toast.success(language === 'vi' ? 'Đã cập nhật ghi chú RAG' : 'RAG note updated');
    } catch (error) {
      console.error('Failed to update family note:', error);
      toast.error(language === 'vi' ? 'Không cập nhật được ghi chú' : 'Unable to update note');
    } finally {
      setIsUpdatingDocument(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="outline" onClick={onBack} className="h-10 px-4 flex items-center gap-2">
              <FiArrowLeft /> {language === 'vi' ? 'Quay lại' : 'Back'}
            </Button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 text-2xl border border-indigo-500/20">
            <FiBookOpen />
          </div>
          <div>
            <h2 className="text-2xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {language === 'vi' ? 'Sổ tay gia đình' : 'Family Notes'}
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {selectedFamily?.name || (language === 'vi' ? 'Chọn một gia đình' : 'Choose a family')}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={loadDocuments} disabled={!familyId || isLoading} className="h-10 px-4 flex items-center gap-2">
          <FiRefreshCw className={isLoading ? 'animate-spin' : ''} />
          {language === 'vi' ? 'Tải lại' : 'Refresh'}
        </Button>
      </div>

      {!familyId && (
        <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-bold">
          {language === 'vi'
            ? 'Sổ tay RAG cần gắn với một gia đình cụ thể. Hãy chọn một gia đình ở góc trên trước khi thêm ghi chú.'
            : 'RAG notes must belong to one specific family. Choose a family from the selector before adding notes.'}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <FiPlus />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {language === 'vi' ? 'Thêm ghi chú' : 'Add Note'}
              </h3>
              <p className="text-xs text-slate-500 font-semibold">
                {language === 'vi' ? 'AI sẽ tự chunk + embedding' : 'AI will chunk and embed it'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!familyId || isSaving}
              placeholder={language === 'vi' ? 'Tiêu đề, ví dụ: Lịch học của bé An' : 'Title, e.g. An school schedule'}
              className="h-11"
            />
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  disabled={!familyId || isSaving}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    category === item.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                      : 'bg-slate-100/70 dark:bg-slate-900/60 text-slate-500 border-black/5 dark:border-white/5 hover:text-primary hover:border-primary/30'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={!familyId || isSaving}
              placeholder={language === 'vi'
                ? 'Nhập thông tin dài mà AI nên nhớ: thói quen, quy tắc, lịch học, lưu ý sức khỏe, kinh nghiệm gia đình...'
                : 'Write long-form knowledge AI should remember: routines, rules, school plans, health notes, family experience...'}
              className="w-full min-h-[240px] resize-y rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-slate-950/50 px-4 py-4 text-sm leading-relaxed outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
            />
            <Button onClick={handleCreate} disabled={!familyId || isSaving} className="w-full h-12 text-sm flex items-center gap-2">
              <FiBookOpen />
              {isSaving ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') : (language === 'vi' ? 'Lưu vào RAG' : 'Save To RAG')}
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {language === 'vi' ? 'Tài liệu đã index' : 'Indexed Documents'}
            </h3>
            <span className="text-xs font-bold text-primary">
              {documents.length} {language === 'vi' ? 'ghi chú' : 'notes'}
            </span>
          </div>

          {documents.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
              <FiFileText className="mx-auto text-4xl text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-sm font-bold text-slate-500">
                {isLoading
                  ? (language === 'vi' ? 'Đang tải sổ tay...' : 'Loading notes...')
                  : (language === 'vi' ? 'Chưa có ghi chú nào cho RAG.' : 'No RAG notes yet.')}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {documents.map((document) => (
              <article
                key={document.id}
                className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/30 transition-all shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => handleOpenEditor(document.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-2">{document.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-xs font-semibold">
                        {document.metadata?.category || document.sourceType}
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">
                        {document._count?.chunks || 0} chunks
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">
                        {new Date(document.updatedAt).toLocaleDateString(getDateLocale(language))}
                      </span>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditor(document.id)}
                      className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-400 hover:bg-primary/10 hover:text-primary transition-all flex items-center justify-center border border-black/5 dark:border-white/5"
                      title={language === 'vi' ? 'Xem/sửa' : 'View/Edit'}
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(document.id)}
                    className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 transition-all flex items-center justify-center border border-black/5 dark:border-white/5"
                    title={language === 'vi' ? 'Xóa' : 'Delete'}
                  >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {language === 'vi' ? 'Xem và sửa ghi chú' : 'View And Edit Note'}
            </DialogTitle>
          </DialogHeader>

          {isLoadingDocument ? (
            <div className="py-16 text-center text-sm font-bold text-slate-500">
              {language === 'vi' ? 'Đang mở ghi chú...' : 'Opening note...'}
            </div>
          ) : (
            <div className="space-y-5">
              <Input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                disabled={isUpdatingDocument}
                placeholder={language === 'vi' ? 'Tiêu đề ghi chú' : 'Note title'}
                className="h-12"
              />

              <div className="flex flex-wrap gap-2">
                {categories.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEditCategory(item.id)}
                    disabled={isUpdatingDocument}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      editCategory === item.id
                        ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                        : 'bg-slate-100/70 dark:bg-slate-900/60 text-slate-500 border-black/5 dark:border-white/5 hover:text-primary hover:border-primary/30'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <textarea
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                disabled={isUpdatingDocument}
                placeholder={language === 'vi' ? 'Nội dung ghi chú' : 'Note content'}
                className="w-full min-h-[320px] resize-y rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-slate-950/50 px-4 py-4 text-sm leading-relaxed outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
              />

              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsEditorOpen(false)}
                  disabled={isUpdatingDocument}
                  className="h-11"
                >
                  {language === 'vi' ? 'Đóng' : 'Close'}
                </Button>
                <Button
                  onClick={handleUpdateDocument}
                  disabled={isUpdatingDocument}
                  className="h-11 flex items-center gap-2"
                >
                  <FiSave />
                  {isUpdatingDocument
                    ? (language === 'vi' ? 'Đang lưu...' : 'Saving...')
                    : (language === 'vi' ? 'Lưu thay đổi' : 'Save changes')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
