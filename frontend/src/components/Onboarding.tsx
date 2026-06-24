'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { FiMonitor, FiActivity, FiCpu, FiArrowRight, FiCheck } from 'react-icons/fi';

export default function Onboarding({ onComplete }: { readonly onComplete: () => void }) {
  const { user } = useAuth();
  const { language } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const complete = () => {
    if (user?.id) {
      localStorage.setItem(`has_seen_onboarding_${user.id}`, 'true');
    }
    setIsVisible(false);
    setTimeout(() => {
      onComplete();
    }, 500);
  };

  const slides = [
    {
      id: 'welcome',
      icon: <FiMonitor className="w-16 h-16 text-primary" />,
      title: language === 'vi' ? 'KHỞI TẠO HỆ THỐNG' : 'SYSTEM INITIALIZATION',
      desc: language === 'vi' ? 'Chào mừng đến với Family Hub. Trung tâm quản lý gia đình thế hệ mới với độ ổn định và tính thẩm mỹ cao.' : 'Welcome to Family Hub. A next-generation home management center designed for stability and aesthetics.',
      bg: 'bg-slate-900/60'
    },
    {
      id: 'calendar',
      icon: <FiActivity className="w-16 h-16 text-primary" />,
      title: language === 'vi' ? 'LẬP LỊCH TRỰC QUAN' : 'VISUAL SCHEDULING',
      desc: language === 'vi' ? 'Theo dõi mọi sự kiện và luồng công việc của thành viên trong thời gian thực với giao diện Neural Tech.' : 'Track every event and member workflow in real-time with our Neural Tech interface.',
      bg: 'bg-slate-900/60'
    },
    {
      id: 'ai',
      icon: <FiCpu className="w-16 h-16 text-primary" />,
      title: language === 'vi' ? 'TRÍ TUỆ NHÂN TẠO' : 'COGNITIVE AGENT',
      desc: language === 'vi' ? 'Tối ưu hóa sinh hoạt hàng ngày bằng trợ lý AI, từ việc lên thực đơn đến phân tích chỉ số tài chính.' : 'Optimize daily life with AI agents, from meal planning to financial index analysis.',
      bg: 'bg-slate-900/60'
    }
  ];

  return (
    <div
      className={`fixed inset-0 z-[999] bg-slate-950 flex flex-col justify-between transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'} overflow-hidden`}
    >
      <div className="absolute top-0 right-0 w-full h-[60%] bg-primary/5 blur-[120px] rounded-full -z-10" />

      <div className="flex-1 flex w-[300%] h-full transition-transform duration-700 ease-in-out" style={{ transform: `translateX(-${currentSlide * 33.333}%)` }}>
        {slides.map((slide) => (
          <div key={slide.id} className="w-[33.333%] h-full flex flex-col items-center justify-center p-8 md:p-12 relative z-10">
            <div className="w-32 h-32 rounded-3xl bg-slate-900 border border-white/5 shadow-2xl flex items-center justify-center mb-10 group transition-all duration-500 hover:border-primary/50">
              <div className="group-hover:scale-110 transition-transform duration-500">
                {slide.icon}
              </div>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-center mb-6 text-slate-100 tracking-tighter uppercase italic">
              {slide.title}
            </h1>
            <p className="text-base md:text-xl text-center text-slate-500 font-medium max-w-lg leading-relaxed">
              {slide.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="p-10 md:p-16 flex flex-col md:flex-row items-center justify-between gap-10 bg-slate-950 border-t border-white/5 z-20">
        <div className="flex gap-4">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className={`h-2 rounded-full transition-all duration-500 ${i === currentSlide ? 'w-10 bg-primary' : 'w-2 bg-slate-800'}`}
            />
          ))}
        </div>

        <div className="flex w-full md:w-auto gap-6">
          <button
            onClick={() => complete()}
            className="flex-1 md:flex-none py-4 px-8 rounded-xl font-black text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-[0.3em] text-[10px]"
          >
            {language === 'vi' ? 'BỎ QUA' : 'BYPASS'}
          </button>

          <button
            onClick={() => {
              if (currentSlide === slides.length - 1) complete();
              else setCurrentSlide(s => s + 1);
            }}
            className="flex items-center justify-center gap-3 flex-1 md:w-56 py-4 px-10 rounded-xl font-black bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xl shadow-primary/20 transition-all hover:scale-105 active:scale-95 uppercase tracking-[0.2em] text-[10px] group"
          >
            {currentSlide === slides.length - 1 ? (
              <>{language === 'vi' ? 'HOÀN TẤT' : 'INITIALIZE'} <FiCheck className="text-lg group-hover:scale-125 transition-transform" /></>
            ) : (
              <>{language === 'vi' ? 'TIẾP TỤC' : 'PROCEED'} <FiArrowRight className="text-lg group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
