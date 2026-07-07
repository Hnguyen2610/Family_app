import type { AiActionProposal, AiFeedbackValue } from '@/lib/api-client';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  cached?: boolean;
  requestLogId?: string;
  feedback?: AiFeedbackValue;
  proposal?: AiActionProposal;
  proposalStatus?: 'pending' | 'confirmed' | 'rejected';
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

export interface MemoryConsent {
  type: string;
  value: string;
  memoryType?: string;
  confidence?: number;
  sourceMessage?: string;
}

export interface RagConsent {
  title: string;
  content: string;
  category: string;
  memoryType?: string;
  confidence?: number;
  sourceMessage?: string;
}

export const FEEDBACK_OPTIONS: Array<{ value: AiFeedbackValue; label: string; icon: 'up' | 'down' | 'flag' }> = [
  { value: 'correct', label: 'Đúng', icon: 'up' },
  { value: 'wrong', label: 'Sai', icon: 'down' },
  { value: 'missing_context', label: 'Thiếu context', icon: 'flag' },
  { value: 'wrong_family', label: 'Sai family', icon: 'flag' },
  { value: 'wrong_datetime', label: 'Sai ngày/giờ', icon: 'flag' },
];
