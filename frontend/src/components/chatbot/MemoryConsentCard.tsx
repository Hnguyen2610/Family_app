import { FiBookOpen, FiCheck, FiX } from 'react-icons/fi';
import type { MemoryConsent } from './chatbot-types';

type MemoryConsentCardProps = {
  consent: MemoryConsent;
  language: string;
  onApprove: () => void;
  onDismiss: () => void;
};

export function MemoryConsentCard({ consent, language, onApprove, onDismiss }: MemoryConsentCardProps) {
  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl glass bg-indigo-50/90 dark:bg-indigo-900/40 p-5 rounded-2xl border-2 border-indigo-500/30 shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-500 backdrop-blur-xl">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-500 text-white flex items-center justify-center text-xl shadow-lg shadow-indigo-500/20">
          <FiBookOpen />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">
            Ghi nhớ thông tin?
          </h4>
          <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-widest mt-0.5">
            AI MEMORY PROPOSAL
          </p>
        </div>
        <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600">
          <FiX size={18} />
        </button>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300 mb-6 font-medium bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-black/5 dark:border-white/5">
        {language === 'vi'
          ? `Bạn có muốn tôi ghi nhớ rằng: "${consent.value}"?`
          : `Should I remember that: "${consent.value}"?`}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onApprove}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <FiCheck /> {language === 'vi' ? 'Đồng ý' : 'Confirm'}
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
