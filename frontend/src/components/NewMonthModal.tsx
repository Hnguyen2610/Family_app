'use client';

import { useState, useEffect } from 'react';
import { eventsAPI } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

export default function NewMonthModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [monthName, setMonthName] = useState('');

  const { user } = useAuth();
  const familyId = user?.familyId || process.env.NEXT_PUBLIC_FAMILY_ID || '';

  useEffect(() => {
    const checkNewMonth = () => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const key = `last_visited_month_${familyId}`;
      const stored = localStorage.getItem(key);

      const monthYearString = `${currentMonth}-${currentYear}`;
      
      if (stored !== monthYearString) {
        setIsOpen(true);
        fetchMonthEvents(currentMonth + 1, currentYear);
        const name = now.toLocaleString('vi-VN', { month: 'long' });
        setMonthName(name.charAt(0).toUpperCase() + name.slice(1));
        localStorage.setItem(key, monthYearString);
      }
    };

    const timer = setTimeout(checkNewMonth, 1200);
    return () => clearTimeout(timer);
  }, [familyId]);

  const fetchMonthEvents = async (month: number, year: number) => {
    setLoading(true);
    try {
      const response = await eventsAPI.getAll(familyId, month, year);
      const sortedEvents = response.data.sort((a: any, b: any) => {
        return new Date(a.date).getDate() - new Date(b.date).getDate();
      });
      setEvents(sortedEvents);
    } catch (error) {
      console.error('Failed to fetch monthly events:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !familyId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-500">
      <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-700 shadow-indigo-200/50 border border-white">
        {/* Decorative Header */}
        <div className="bg-indigo-600 p-8 md:p-10 text-center relative overflow-hidden">
          {/* Animated Background Elements */}
          <div className="absolute top-0 left-0 w-full h-full">
            {Array.from({ length: 15 }).map((_, i) => (
              <div 
                key={`sparkle-${i}`}
                className="absolute bg-white/20 rounded-full animate-pulse"
                style={{ 
                  width: Math.floor(Math.random() * 6 + 2) + 'px',
                  height: Math.floor(Math.random() * 6 + 2) + 'px',
                  top: Math.floor(Math.random() * 100) + '%',
                  left: Math.floor(Math.random() * 100) + '%',
                  animationDelay: (Math.random() * 3) + 's',
                  animationDuration: (Math.random() * 2 + 2) + 's'
                }}
              />
            ))}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl"></div>
          </div>
          
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-white/20 backdrop-blur-md rounded-2xl md:rounded-[1.5rem] flex items-center justify-center text-3xl md:text-4xl mb-4 md:mb-6 shadow-xl animate-float">
              ✨
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white mb-1.5 tracking-tight px-4">Chào {monthName}!</h2>
            <p className="text-indigo-100 font-bold text-[10px] md:text-sm px-6 opacity-80 uppercase tracking-widest leading-relaxed max-w-sm mx-auto">
              Tháng mới ngập tràn yêu thương nhé gia đình mình! 🏠
            </p>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-6 md:p-8 max-h-[40vh] md:max-h-[50vh] overflow-y-auto no-scrollbar">
          <div className="mb-4 md:mb-6 flex items-center justify-between">
            <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">Sự kiện trong tháng</h3>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] md:text-[10px] font-black">{events.length}</span>
          </div>

          {(() => {
            if (loading) {
              return (
                <div className="flex flex-col items-center py-10 md:py-12">
                  <div className="w-8 h-8 md:w-10 md:h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Đang chuẩn bị...</p>
                </div>
              );
            }
            if (events.length === 0) {
              return (
                <div className="text-center py-10 md:py-12 px-6">
                  <div className="text-3xl md:text-4xl mb-4 opacity-20 filter grayscale">🌈</div>
                  <p className="text-slate-800 font-black text-xs md:text-sm mb-1 uppercase tracking-wider">Thảnh thơi quá!</p>
                  <p className="text-slate-400 text-[10px] font-medium">Chưa có kế hoạch nào được ghi lại.</p>
                </div>
              );
            }
            return null; // Fallback
          })() || (
            <div className="space-y-3 md:space-y-4">
              {events.map((event) => {
                const eventDate = new Date(event.date);
                const isBirthday = event.type === 'Birthday';
                
                return (
                  <div 
                    key={event.id}
                    className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl md:rounded-3xl bg-slate-50 border-2 border-transparent hover:border-indigo-100 transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white shadow-sm border border-slate-100 flex flex-col items-center justify-center shrink-0 group-hover:shadow-md transition-all">
                      <span className="text-[8px] md:text-[9px] font-black text-indigo-600 uppercase tracking-tighter">
                        T{eventDate.getMonth() + 1}
                      </span>
                      <span className="text-base md:text-xl font-black text-slate-800 leading-none">
                        {eventDate.getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs md:text-sm font-black text-slate-800 truncate mb-1 group-hover:text-indigo-600 transition-colors">
                        {event.title}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest ${
                          isBirthday ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isBirthday ? 'Sinh nhật' : 'Sự kiện'}
                        </span>
                        {event.lunarDate && (
                          <span className="text-[8px] md:text-[9px] text-slate-300 font-bold italic truncate flex items-center gap-1">
                            🌙 {event.lunarDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="px-6 md:px-8 pb-6 md:pb-8 pt-2 md:pt-4">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-3.5 md:py-4 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] md:text-xs hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 border-b-4 border-indigo-800"
          >
            Bắt đầu thôi! 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
