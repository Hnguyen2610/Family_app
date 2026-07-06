export type VisionDraftKind = 'auto' | 'receipt' | 'medicine' | 'school_plan';
export type VisionDraftStatus = 'ALL' | 'DRAFT' | 'CONFIRMED' | 'DISMISSED';

export type TransactionDraft = {
  amount?: number | string | null;
  type?: string | null;
  category?: string | null;
  description?: string | null;
  date?: string | null;
};

export type EventDraft = {
  title?: string | null;
  date?: string | null;
  time?: string | null;
  type?: string | null;
  description?: string | null;
};

export type VisionStructuredData = {
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

export type VisionDraft = {
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
