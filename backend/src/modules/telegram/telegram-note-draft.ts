import { classifyAiIntent, normalizeSearchText } from '../ai-agent/ai-intent-router';

export type TelegramNoteDraft = {
  title: string;
  content: string;
  category: string;
};

export function shouldProposeTelegramFamilyNote(text: string) {
  const normalized = normalizeSearchText(text || '');
  if (!normalized.trim()) return false;
  if (classifyAiIntent(text).intent === 'event_mutation') return false;

  return [
    'luu',
    'nho',
    'ghi nho',
    'so tay',
    'long memory',
    'rag',
    'save',
    'remember',
  ].some((signal) => normalized.includes(signal));
}

export function buildTelegramNoteDraft(text: string): TelegramNoteDraft {
  const content = String(text || '')
    .replace(/^\s*(luu|nho|ghi nho|them ghi chu|save|remember)\s+(vao\s+)?(so tay|long memory|rag|ghi chu)?\s*/i, '')
    .trim();
  const safeContent = content || String(text || '').trim();
  const firstLine = safeContent.split(/\r?\n/).find(Boolean) || safeContent;
  const title = firstLine.replace(/[.!?]+$/g, '').slice(0, 90).trim() || 'Ghi chú gia đình';
  const normalized = normalizeSearchText(safeContent);

  return {
    title,
    content: safeContent,
    category: inferTelegramNoteCategory(normalized),
  };
}

function inferTelegramNoteCategory(normalized: string) {
  if (['di ung', 'suc khoe', 'thuoc'].some((item) => normalized.includes(item))) return 'health';
  if (['an', 'mon', 'thuc don'].some((item) => normalized.includes(item))) return 'meal';
  if (['hoc', 'truong'].some((item) => normalized.includes(item))) return 'school';
  if (['tien', 'chi tieu'].some((item) => normalized.includes(item))) return 'finance';
  return 'family';
}
