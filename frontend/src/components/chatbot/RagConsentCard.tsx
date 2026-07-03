import { FiBookOpen, FiCheck, FiX } from 'react-icons/fi';
import type { RagConsent } from './chatbot-types';

type RagConsentCardProps = {
  consent: RagConsent;
  language: string;
  onApprove: () => void;
  onDismiss: () => void;
};

export function RagConsentCard({ consent, language, onApprove, onDismiss }: RagConsentCardProps) {
  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[90%] max-w-xl glass bg-emerald-50/90 dark:bg-emerald-950/50 p-5 rounded-2xl border-2 border-emerald-500/30 shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-500 backdrop-blur-xl">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20">
          <FiBookOpen />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">
            {language === 'vi' ? 'Lưu vào sổ tay?' : 'Save to Family Notes?'}
          </h4>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold uppercase tracking-widest mt-0.5">
            RAG KNOWLEDGE PROPOSAL
          </p>
        </div>
        <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600">
          <FiX size={18} />
        </button>
      </div>
      <div className="text-sm text-slate-700 dark:text-slate-300 mb-6 font-medium bg-white/60 dark:bg-black/20 p-3 rounded-lg border border-black/5 dark:border-white/5 space-y-2">
        <div className="font-black text-slate-900 dark:text-slate-100">{consent.title}</div>
        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap">{consent.content}</p>
        <div className="inline-flex rounded-md bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
          {consent.category || 'family'}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onApprove}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <FiCheck /> {language === 'vi' ? 'Đồng ý lưu' : 'Confirm Save'}
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 glass bg-white/50 dark:bg-slate-800/50 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-white transition-all"
        >
          {language === 'vi' ? 'Để sau' : 'Maybe Later'}
        </button>
      </div>
    </div>
  );
}
