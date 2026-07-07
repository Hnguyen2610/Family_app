'use client';

import { useTranslation } from '@/lib/i18n';
import { FiShare, FiPlusSquare, FiX, FiInfo } from 'react-icons/fi';

interface IosPwaGuideProps {
  readonly onClose: () => void;
}

export default function IosPwaGuide({ onClose }: IosPwaGuideProps) {
  const { language } = useTranslation();

  const steps = [
    {
      icon: <FiShare className="text-blue-500" />,
      text: language === 'vi' 
        ? 'Nhấn vào nút "Chia sẻ" (Share) trên thanh công cụ của Safari.' 
        : 'Tap the "Share" button in the Safari toolbar.'
    },
    {
      icon: <FiPlusSquare className="text-slate-800 dark:text-white" />,
      text: language === 'vi'
        ? 'Cuộn xuống và chọn "Thêm vào MH chính" (Add to Home Screen).'
        : 'Scroll down and select "Add to Home Screen".'
    },
    {
      icon: <FiInfo className="text-primary" />,
      text: language === 'vi'
        ? 'Mở ứng dụng từ màn hình chính để kích hoạt thông báo đẩy.'
        : 'Open the app from your home screen to enable push notifications.'
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md glass rounded-2xl border border-white/10 overflow-hidden shadow-md animate-in zoom-in-95 slide-in-from-bottom-10 duration-300">
        {/* Header */}
        <div className="p-8 pb-4 flex justify-between items-start">
          <div>
            <h3 className="text-2xl font-bold text-white tracking-tight italic">
              iOS <span className="text-primary not-italic">Setup</span>
            </h3>
            <p className="text-xs font-bold text-slate-400  mt-1">
              {language === 'vi' ? 'Kích hoạt thông báo đẩy' : 'Universal Push Protocol'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 pt-4 space-y-6">
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-5 group">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl shrink-0  group-hover:bg-primary/20 transition-all duration-300">
                  {step.icon}
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm text-slate-300 font-medium leading-relaxed">
                    <span className="text-primary font-bold mr-2">0{index + 1}</span>
                    {step.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4">
            <button
              onClick={onClose}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20  active:scale-95 transition-all"
            >
              {language === 'vi' ? 'Tôi đã hiểu' : 'Acknowledge Protocol'}
            </button>
          </div>
        </div>

        <div className="p-6 bg-primary/5 border-t border-white/5 text-center px-10">
          <p className="text-xs text-slate-500 font-bold leading-normal">
            {language === 'vi' 
              ? 'Apple yêu cầu bước này để bảo mật dữ liệu và tiết kiệm pin cho thiết bị của bạn.'
              : 'Apple mandates this procedure for biometric security and power optimization.'}
          </p>
        </div>
      </div>
    </div>
  );
}
