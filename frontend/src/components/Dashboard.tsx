'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { eventsAPI, mealsAPI } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import { FiCalendar, FiMessageSquare, FiArrowRight, FiCoffee, FiHeart, FiChevronDown } from 'react-icons/fi';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DashboardProps {
  readonly onNavigate: (tab: 'calendar' | 'chat' | 'family' | 'meals' | 'admin' | 'settings' | 'notifications') => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user, currentFamilyId } = useAuth();
  const { t, language } = useTranslation();

  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [monthEvents, setMonthEvents] = useState<any[]>([]);
  const [scheduleView, setScheduleView] = useState<'today' | 'month'>('today');
  const [suggestedMeals, setSuggestedMeals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Quick Chat Input
  const [chatMessage, setChatMessage] = useState('');

  useEffect(() => {
    if (!currentFamilyId || !user) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const now = new Date();

        // 1. Fetch Events
        const eventsRes = await eventsAPI.getAll(currentFamilyId, now.getMonth() + 1, now.getFullYear(), user?.id);
        const allEvents = eventsRes.data || [];

        const todayStr = format(now, 'yyyy-MM-dd');
        const today = allEvents.filter((e: any) => e.date.startsWith(todayStr));
        // Sort by time
        today.sort((a: any, b: any) => (a.time || '24:00').localeCompare(b.time || '24:00'));
        setTodayEvents(today);
        
        // Sort all month events by date
        const sortedMonth = [...allEvents].sort((a: any, b: any) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
        setMonthEvents(sortedMonth);


        // 2. Fetch Meals
        const mealsRes = await mealsAPI.getAll();
        const allMeals = mealsRes.data || [];
        if (allMeals.length > 0) {
          // pick 2 random meals
          const shuffled = [...allMeals].sort(() => 0.5 - Math.random());
          setSuggestedMeals(shuffled.slice(0, 2));
        }

      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [currentFamilyId, user]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    // For now, we simply navigate to chat to let them continue.
    // Passing the initial message would require a global store or url param,
    // but a simple trick is to save to localStorage as a "pending_chat_prompt"
    localStorage.setItem('pending_chat_prompt', chatMessage);
    onNavigate('chat');
  };

  const todayFormattedText = format(new Date(), language === 'vi' ? 'dd MMMM, yyyy' : 'MMMM dd, yyyy', {
    locale: language === 'vi' ? vi : undefined
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] animate-pulse">
          {language === 'vi' ? 'Đang khởi tạo hệ thống...' : 'Initializing Interface...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Date Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-md text-[9px] font-black uppercase tracking-[0.2em] border border-primary/20 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            {language === 'vi' ? 'Giao diện bảng điều khiển' : 'Interface Dashboard'}
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tighter capitalize bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 pb-4 leading-[1.2]">
            {format(new Date(), 'EEEE', { locale: language === 'vi' ? vi : undefined })}, <span className="text-primary">{todayFormattedText}</span>
          </h1>
        </div>
        <button
          onClick={() => onNavigate('calendar')}
          className="btn-primary flex items-center gap-2 group"
        >
          {language === 'vi' ? 'Lịch hệ thống' : 'System Calendar'}
          <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column: Events */}
        <div className="lg:col-span-7 space-y-8">
          <div className="glass rounded-2xl p-8 border border-black/5 dark:border-white/5 h-full bg-white/80 dark:bg-slate-900/40">
            <div className="flex items-center justify-between mb-8">
              <div className="relative group/view">
                <button 
                  className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest flex items-center gap-3 hover:text-primary transition-colors pr-8 py-1"
                >
                  <FiCalendar className="text-primary" />
                  {scheduleView === 'today' ? t('dashboard.operations') : (language === 'vi' ? 'Lịch trình tháng này' : 'Monthly Schedule')}
                  <FiChevronDown size={14} className="group-hover/view:translate-y-0.5 transition-transform" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-48 glass rounded-xl border border-black/5 dark:border-white/5 opacity-0 invisible group-hover/view:opacity-100 group-hover/view:visible transition-all z-20 shadow-xl py-2">
                  <button 
                    onClick={() => setScheduleView('today')}
                    className={`w-full text-left px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 ${scheduleView === 'today' ? 'text-primary' : 'text-slate-500'}`}
                  >
                    {t('dashboard.operations')}
                  </button>
                  <button 
                    onClick={() => setScheduleView('month')}
                    className={`w-full text-left px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 ${scheduleView === 'month' ? 'text-primary' : 'text-slate-500'}`}
                  >
                    {language === 'vi' ? 'Lịch trình tháng này' : 'Monthly Schedule'}
                  </button>
                </div>
              </div>
              <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500 text-[10px] px-2 py-1 rounded border border-black/5 dark:border-white/5">
                {scheduleView === 'today' ? todayEvents.length : monthEvents.length} {t('dashboard.tasks')}
              </span>
            </div>

            {(scheduleView === 'today' ? todayEvents : monthEvents).length > 0 ? (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {(scheduleView === 'today' ? todayEvents : monthEvents).map((ev, idx) => (
                  <div key={ev.id || idx} className="relative flex items-start gap-6 p-6 rounded-xl bg-slate-100/40 dark:bg-slate-900/40 border border-black/5 dark:border-white/5 hover:border-primary/30 transition-all group">
                    <div className="w-16 shrink-0 pt-1">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 block mb-1">
                        {scheduleView === 'month' ? format(new Date(ev.date), 'dd/MM') : (ev.time ? ev.time.substring(0, 5) : '00:00')}
                      </span>
                      {scheduleView === 'month' && (
                        <span className="text-[10px] font-bold text-primary block">
                          {ev.time ? ev.time.substring(0, 5) : '00:00'}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors truncate">{ev.title}</h4>
                      {ev.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 line-clamp-1 font-medium">{ev.description}</p>
                      )}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <FiArrowRight size={14} className="text-primary" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center glass rounded-xl border border-dashed border-black/5 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/40">
                <FiHeart className="text-3xl text-slate-300 dark:text-slate-800 mb-4" />
                <p className="text-xs text-slate-500 font-black uppercase tracking-widest">
                  {scheduleView === 'today' ? t('dashboard.noTasks') : (language === 'vi' ? 'Không có sự kiện trong tháng' : 'No events this month')}
                </p>

                <button
                  onClick={() => onNavigate('calendar')}
                  className="mt-6 text-primary font-black text-[10px] uppercase tracking-widest border border-primary/20 px-4 py-2 rounded-md hover:bg-primary/5 transition-colors"
                >
                  + {t('dashboard.schedule')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI & Meals */}
        <div className="lg:col-span-5 flex flex-col gap-8">

          {/* Quick Chat AI */}
          <div className="glass-dark rounded-2xl p-8 border border-primary/30 bg-primary/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <FiMessageSquare size={100} />
            </div>

            <h3 className="relative z-10 text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest flex items-center gap-3 mb-6">
              <FiMessageSquare className="text-primary" />
              {t('dashboard.neuralAccess')}
            </h3>

            <form onSubmit={handleChatSubmit} className="relative z-10 space-y-4">
              <div className="relative group/input">
                <Input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder={language === 'vi' ? "Yêu cầu hệ thống..." : "System command..."}
                  className="h-12"
                />
              </div>
              <Button
                type="submit"
                className="w-full flex items-center justify-center gap-2 group/btn h-12"
              >
                {t('dashboard.execute')}
                <FiArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
              </Button>
            </form>
          </div>

          {/* Meal Suggestions */}
          <div className="glass-dark rounded-2xl p-8 border border-white/5 flex-1">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest flex items-center gap-3">
                <FiCoffee className="text-primary" />
                {t('dashboard.nutrition')}
              </h3>
              <button
                onClick={() => onNavigate('meals')}
                className="text-[9px] font-black uppercase tracking-widest text-primary border border-primary/20 px-3 py-1.5 rounded bg-primary/5"
              >
                {t('nav.ledger')}
              </button>
            </div>

            <div className="grid gap-4">
              {suggestedMeals.length > 0 ? (
                suggestedMeals.map((meal, i) => (
                  <div key={meal.id || i} className="flex gap-4 items-center bg-slate-100/40 dark:bg-slate-900/40 p-4 rounded-xl border border-black/5 dark:border-white/5 cursor-pointer hover:border-primary/30 transition-all group" onClick={() => onNavigate('meals')}>
                    {meal.imageUrl ? (
                      <img src={meal.imageUrl} alt={meal.name} className="w-12 h-12 rounded-lg object-cover bg-slate-200 dark:bg-slate-800" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-primary border border-black/5 dark:border-white/5">
                        <FiHeart size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm group-hover:text-primary transition-colors truncate">{meal.name}</h4>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{meal.category || 'Stable'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest text-center py-6">{t('common.noData')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
