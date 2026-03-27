'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { eventsAPI, mealsAPI } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
import { FiCalendar, FiCoffee, FiMessageSquare, FiUsers, FiArrowRight, FiClock, FiHeart } from 'react-icons/fi';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface DashboardProps {
  readonly onNavigate: (tab: 'calendar' | 'chat' | 'family' | 'meals' | 'admin' | 'settings' | 'notifications') => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user, currentFamilyId } = useAuth();
  const { t, language } = useTranslation();
  
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [suggestedMeals, setSuggestedMeals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Quick Chat Input
  const [chatMessage, setChatMessage] = useState('');

  const family = user?.families?.find((f: any) => f.id === currentFamilyId) || user?.family;

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

  const todayFormatted = format(new Date(), language === 'vi' ? 'EEEE, dd MMMM, yyyy' : 'EEEE, MMMM dd, yyyy', { 
    locale: language === 'vi' ? vi : undefined 
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 animate-pulse">
        <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-medium tracking-widest uppercase text-sm">
          {language === 'vi' ? 'Đang chuẩn bị bảng điều khiển...' : 'Preparing dashboard...'}
        </p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-6 md:space-y-8">
      {/* Date Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-indigo-100/50 dark:border-slate-800/50 pb-6">
        <div>
          <h2 className="text-xs md:text-sm font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
            <FiClock /> {language === 'vi' ? 'Hôm nay' : 'Today'}
          </h2>
          <h1 className="text-2xl md:text-4xl font-black text-slate-800 dark:text-slate-100 capitalize">
            {todayFormatted}
          </h1>
        </div>
        <button 
          onClick={() => onNavigate('calendar')}
          className="text-sm font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-4 py-2 rounded-xl transition-all active:scale-95 flex items-center gap-2 w-fit"
        >
          {language === 'vi' ? 'Mở Lịch đầy đủ' : 'Full Calendar'} <FiArrowRight />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
        
        {/* Left Column: Events (spans 7 cols) */}
        <div className="col-span-1 md:col-span-7 space-y-6">
          <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md rounded-[2rem] p-6 border border-slate-100 dark:border-slate-800/50 shadow-sm h-full">
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center text-xl">
                <FiCalendar />
              </div>
              {language === 'vi' ? 'Sự kiện hôm nay' : "Today's Events"}
              <span className="ml-auto bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs px-2.5 py-1 rounded-full">
                {todayEvents.length} {language === 'vi' ? 'sự kiện' : 'events'}
              </span>
            </h3>

            {todayEvents.length > 0 ? (
              <div className="space-y-4">
                {todayEvents.map((ev, idx) => (
                  <div key={ev.id || idx} className="flex items-start gap-4 p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700/50 group hover:border-indigo-300 transition-all">
                    <div className="w-14 shrink-0 text-center flex flex-col items-center justify-center pt-1">
                      <span className="text-lg font-black text-slate-700 dark:text-slate-200">
                        {ev.time ? ev.time.substring(0, 5) : 'Cả ngày'}
                      </span>
                    </div>
                    <div className="w-1 w-full max-w-[4px] bg-indigo-100 dark:bg-slate-700 rounded-full self-stretch" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-base text-slate-800 dark:text-slate-100 truncate">{ev.title}</h4>
                      {ev.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{ev.description}</p>
                      )}
                      {ev.scope === 'PRIVATE' && (
                        <span className="inline-block mt-2 px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-600 text-[10px] uppercase font-black tracking-widest">
                          Cá nhân
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                <FiHeart className="text-4xl text-slate-300 dark:text-slate-600 mb-4" />
                <p className="text-base text-slate-500 dark:text-slate-400 font-medium mb-1">
                  {language === 'vi' ? 'Hôm nay gia đình rảnh rỗi!' : 'No events today!'}
                </p>
                <p className="text-xs text-slate-400">
                  {language === 'vi' ? 'Hãy dành thời gian tận hưởng nhé.' : 'Take some time to relax.'}
                </p>
                <button 
                  onClick={() => onNavigate('calendar')}
                  className="mt-6 text-indigo-600 font-bold text-sm bg-indigo-50 px-4 py-2 rounded-xl"
                >
                  {language === 'vi' ? '+ Thêm sự kiện' : '+ Add Event'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI & Meals & Family (spans 5 cols) */}
        <div className="col-span-1 md:col-span-5 flex flex-col gap-6">
          
          {/* Quick Chat AI */}
          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-[2rem] p-6 text-white shadow-xl shadow-indigo-200/50 dark:shadow-none relative overflow-hidden group">
            <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-white/20 blur-2xl rounded-full group-hover:scale-150 transition-transform duration-700" />
            
            <h3 className="relative z-10 text-lg font-black flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl shadow-inner">
                <FiMessageSquare />
              </div>
              {language === 'vi' ? 'Hỏi trợ lý AI' : 'Ask AI Assistant'}
            </h3>
            
            <form onSubmit={handleChatSubmit} className="relative z-10 flex gap-2">
              <input 
                type="text" 
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder={language === 'vi' ? "Tối nay ăn gì nhỉ?..." : "What's for dinner?..."}
                className="w-full bg-white/20 border border-white/30 rounded-xl px-4 py-3 placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm font-medium backdrop-blur-sm"
              />
              <button 
                type="submit"
                className="bg-white text-indigo-600 w-12 shrink-0 rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-md"
              >
                <FiArrowRight size={20} className="font-bold" />
              </button>
            </form>
          </div>

          {/* Meal Suggestions */}
          <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md rounded-[2rem] p-6 border border-slate-100 dark:border-slate-800/50 flex-1">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center text-xl">
                  <FiCoffee />
                </div>
                {language === 'vi' ? 'Gợi ý món ngon' : 'Meal Ideas'}
              </h3>
              <button 
                onClick={() => onNavigate('meals')}
                className="text-xs font-black uppercase tracking-widest text-teal-600 hover:text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg"
              >
                {t('nav.mealsFull')}
              </button>
            </div>

            <div className="space-y-3">
              {suggestedMeals.length > 0 ? (
                suggestedMeals.map((meal, i) => (
                  <div key={meal.id || i} className="flex gap-4 items-center bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm border border-slate-50 dark:border-slate-700/50 cursor-pointer hover:border-teal-200 transition-colors" onClick={() => onNavigate('meals')}>
                    {meal.imageUrl ? (
                      <img src={meal.imageUrl} alt={meal.name} className="w-16 h-16 rounded-[1rem] object-cover bg-slate-100" />
                    ) : (
                      <div className="w-16 h-16 rounded-[1rem] bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-2xl">
                        🍲
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 line-clamp-1">{meal.name}</h4>
                      <p className="text-xs font-medium text-slate-500 mt-1 capitalize">{meal.category || 'Món chính'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 text-center py-6">{language === 'vi' ? 'Chưa có dữ liệu món ăn.' : 'No meals available.'}</p>
              )}
            </div>
          </div>

          {/* Family Mini Card */}
           <div 
             onClick={() => onNavigate('family')}
             className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md rounded-[2rem] p-5 border border-slate-100 dark:border-slate-800/50 flex items-center justify-between cursor-pointer hover:border-indigo-300 transition-colors group"
           >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[1rem] bg-blue-100 text-blue-600 flex items-center justify-center text-xl">
                <FiUsers />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">{language === 'vi' ? 'Gia đình' : 'Family'}</p>
                <h4 className="font-black text-slate-800 dark:text-slate-100 text-lg">{family?.name || 'Gia đình của bạn'}</h4>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FiArrowRight />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
