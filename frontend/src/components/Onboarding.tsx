'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { FiMonitor, FiActivity, FiCpu, FiArrowRight, FiCheck } from 'react-icons/fi';
import { Button } from "@/components/ui/button";

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
      icon: <FiMonitor className="h-10 w-10 text-primary" />,
      title: language === 'vi' ? 'Bắt đầu với Family Hub' : 'Welcome to Family Hub',
      desc: language === 'vi'
        ? 'Một nơi gọn gàng để theo dõi lịch, việc nhà, ghi chú và thông tin quan trọng của gia đình.'
        : 'A tidy place to track schedules, tasks, notes, and important family information.',
    },
    {
      id: 'calendar',
      icon: <FiActivity className="h-10 w-10 text-primary" />,
      title: language === 'vi' ? 'Lịch và nhắc việc rõ ràng' : 'Clear Scheduling',
      desc: language === 'vi'
        ? 'Xem việc hôm nay, lịch tháng và các nhắc việc lặp lại mà không phải tìm trong nhiều nơi.'
        : 'See today’s work, monthly events, and repeating reminders without hunting through separate tools.',
    },
    {
      id: 'ai',
      icon: <FiCpu className="h-10 w-10 text-primary" />,
      title: language === 'vi' ? 'AI hỗ trợ khi cần' : 'AI When You Need It',
      desc: language === 'vi'
        ? 'Hỏi nhanh về lịch, thực đơn, ghi chú gia đình hoặc thông tin cần tra cứu trong ngày.'
        : 'Ask about schedules, meals, family notes, or useful information for the day.',
    }
  ];

  return (
    <div
      className={`fixed inset-0 z-[999] flex flex-col justify-between overflow-hidden bg-slate-950 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="flex h-full w-[300%] flex-1 transition-transform duration-500 ease-out" style={{ transform: `translateX(-${currentSlide * 33.333}%)` }}>
        {slides.map((slide) => (
          <div key={slide.id} className="flex h-full w-[33.333%] flex-col items-center justify-center px-8 py-12">
            <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">
              {slide.icon}
            </div>
            <h1 className="mb-4 max-w-xl text-center text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl">
              {slide.title}
            </h1>
            <p className="max-w-lg text-center text-base font-medium leading-relaxed text-slate-400 md:text-lg">
              {slide.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="z-20 flex flex-col items-center justify-between gap-8 border-t border-slate-800 bg-slate-950 p-8 md:flex-row md:p-10">
        <div className="flex gap-3">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className={`h-2 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-8 bg-primary' : 'w-2 bg-slate-800'}`}
            />
          ))}
        </div>

        <div className="flex w-full gap-3 md:w-auto">
          <Button
            variant="ghost"
            onClick={() => complete()}
            className="h-12 flex-1 px-6 text-xs font-semibold text-slate-400 hover:text-slate-200 md:flex-none"
          >
            {language === 'vi' ? 'Bỏ qua' : 'Skip'}
          </Button>

          <Button
            onClick={() => {
              if (currentSlide === slides.length - 1) complete();
              else setCurrentSlide(s => s + 1);
            }}
            className="h-12 flex-1 gap-2 px-6 text-xs font-semibold md:w-48"
          >
            {currentSlide === slides.length - 1 ? (
              <>{language === 'vi' ? 'Hoàn tất' : 'Finish'} <FiCheck className="text-base" /></>
            ) : (
              <>{language === 'vi' ? 'Tiếp tục' : 'Continue'} <FiArrowRight className="text-base" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
