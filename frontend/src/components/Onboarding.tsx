'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { FiCalendar, FiMessageSquare, FiHeart, FiArrowRight, FiCheck } from 'react-icons/fi';

export default function Onboarding({ onComplete }: { readonly onComplete: () => void }) {
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay to allow fade-in
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
    }, 500); // Wait for fade-out animation
  };

  const slides = [
    {
      id: 'welcome',
      icon: <FiHeart className="w-16 h-16 text-rose-500" />,
      title: 'Chào mừng đến ứng dụng Gia đình',
      desc: 'Nơi kết nối mọi người, cùng nhau quản lý các công việc và sinh hoạt một cách mượt mà nhất.',
      bg: 'bg-gradient-to-br from-rose-50 to-pink-100 dark:from-rose-950/30 dark:to-pink-900/20'
    },
    {
      id: 'calendar',
      icon: <FiCalendar className="w-16 h-16 text-indigo-500" />,
      title: 'Quản lý lịch & Công việc',
      desc: 'Theo dõi sự kiện chung, lên thực đơn ăn uống hằng ngày thật đơn giản với Widget trực quan và thông báo tự động.',
      bg: 'bg-gradient-to-br from-indigo-50 to-blue-100 dark:from-indigo-950/30 dark:to-blue-900/20'
    },
    {
      id: 'ai',
      icon: <FiMessageSquare className="w-16 h-16 text-teal-500" />,
      title: 'Trợ lý AI Thông Minh',
      desc: 'Hỏi đáp, tự động lên danh sách món ăn, ghi chú sự kiện và giải quyết vấn đề bằng trí tuệ nhân tạo.',
      bg: 'bg-gradient-to-br from-teal-50 to-emerald-100 dark:from-teal-950/30 dark:to-emerald-900/20'
    }
  ];

  return (
    <div 
      className={`fixed inset-0 z-[999] bg-white dark:bg-slate-950 flex flex-col justify-between transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'} overflow-hidden`}
    >
      {/* Decorative Blob */}
      <div className={`absolute top-0 right-[-10%] w-96 h-96 blur-3xl rounded-full transition-all duration-1000 ${slides[currentSlide].bg} opacity-60`} />

      <div className="flex-1 flex w-[300%] h-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${currentSlide * 33.333}%)` }}>
        {slides.map((slide, i) => (
          <div key={slide.id} className="w-[33.333%] h-full flex flex-col items-center justify-center p-8 md:p-12 relative z-10">
            <div className={`w-32 h-32 rounded-[3xl] flex items-center justify-center mb-10 shadow-xl border border-white/40 dark:border-slate-800 ${slide.bg} animate-in zoom-in spin-in-1 duration-700`}>
              {slide.icon}
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-center mb-6 text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
              {slide.title}
            </h1>
            <p className="text-base md:text-xl text-center text-slate-500 dark:text-slate-400 font-medium max-w-lg leading-relaxed">
              {slide.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-t border-slate-100 dark:border-slate-800/50 z-20">
        <div className="flex gap-3">
          {slides.map((_, i) => (
            <div 
              key={i} 
              className={`h-2.5 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-8 bg-indigo-600' : 'w-2.5 bg-slate-200 dark:bg-slate-700'}`}
            />
          ))}
        </div>
        
        <div className="flex w-full md:w-auto gap-4">
          <button 
            onClick={() => complete()}
            className="flex-1 md:flex-none py-4 px-8 rounded-2xl font-black text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-widest text-xs"
          >
            Bỏ qua
          </button>
          
          <button 
            onClick={() => {
              if (currentSlide === slides.length - 1) complete();
              else setCurrentSlide(s => s + 1);
            }}
            className="flex items-center justify-center gap-2 flex-1 md:w-48 py-4 px-8 rounded-2xl font-black bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-200 dark:shadow-none text-white transition-all hover:scale-105 active:scale-95 uppercase tracking-widest text-xs group"
          >
            {currentSlide === slides.length - 1 ? (
              <>Hoàn tất <FiCheck className="text-lg group-hover:scale-125 transition-transform" /></>
            ) : (
              <>Tiếp tục <FiArrowRight className="text-lg group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
