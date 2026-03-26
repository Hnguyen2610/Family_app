'use client';

import { useState, useEffect } from 'react';
import { eventsAPI } from '@/lib/api-client';
import { getCalendarDays, isToday } from '@/utils/date';
import { useTranslation, TranslationKey } from '@/lib/i18n';
import {
  FiChevronLeft,
  FiChevronRight,
  FiCalendar,
  FiClock,
  FiPlus,
  FiX,
  FiCheck,
  FiTrash2,
  FiGift,
  FiStar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { getLunarDate, formatLunarDate } from '@/utils/lunar';
import { useAuth } from '@/hooks/useAuth';

export default function Calendar() {
  const { t, language } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [eventsCache, setEventsCache] = useState<Record<string, any[]>>({});

  // Manual Event Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const isDeletable = editingEvent && 
                      !editingEvent.id?.toString().startsWith('holiday-') && 
                      !editingEvent.id?.toString().startsWith('birthday-');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'GENERAL',
    time: '09:00',
    scope: 'GLOBAL',
  });

  const { user, currentFamilyId } = useAuth();
  const [creatorId, setCreatorId] = useState<string>(user?.id || '');

  const familyId = currentFamilyId || '';

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const days = getCalendarDays(month, year);

  const monthKeys: TranslationKey[] = [
    'calendar.months.jan', 'calendar.months.feb', 'calendar.months.mar', 'calendar.months.apr',
    'calendar.months.may', 'calendar.months.jun', 'calendar.months.jul', 'calendar.months.aug',
    'calendar.months.sep', 'calendar.months.oct', 'calendar.months.nov', 'calendar.months.dec'
  ];

  const dayKeys: TranslationKey[] = [
    'calendar.days.sun', 'calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed',
    'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat'
  ];

  useEffect(() => {
    fetchInitialUser();
  }, []);

  useEffect(() => {
    const key = `${year}-${month}`;
    if (eventsCache[key]) {
      setEvents(eventsCache[key]);
    } else {
      fetchEvents();
    }
  }, [month, year, eventsCache]);

  // Background polling for events every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEvents(true); // forceRefresh=true to bypass cache
    }, 15000);
    return () => clearInterval(interval);
  }, [month, year, familyId, creatorId]);

  const fetchInitialUser = async () => {
    if (user?.id) {
      setCreatorId(user.id);
    }
  };

  const fetchEvents = async (forceRefresh = false) => {
    const key = `${year}-${month}`;
    if (!forceRefresh && eventsCache[key]) {
      setEvents(eventsCache[key]);
      return;
    }

    try {
      const response = await eventsAPI.getAll(familyId, month, year, creatorId);
      setEvents(response.data);
      setEventsCache((prev) => ({ ...prev, [key]: response.data }));
    } catch (error) {
      console.error('Failed to fetch events:', error);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'BIRTHDAY':
        return <FiGift size={12} />;
      case 'ANNIVERSARY':
        return <FiStar size={12} />;
      case 'HOLIDAY':
        return <FiStar size={12} />;
      case 'TASK':
      case 'WORK':
        return <FiCheck size={12} />;
      case 'APPOINTMENT':
        return <FiClock size={12} />;
      default:
        return <FiCalendar size={12} />;
    }
  };

  const handleDayClick = (day: number) => {
    setSelectedDate(day);
  };

  const openAddModal = (day: number) => {
    setSelectedDate(day);
    setEditingEvent(null);
    setFormData({
      title: '',
      description: '',
      type: 'GENERAL',
      time: '09:00',
      scope: 'GLOBAL',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (event: any) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      type: event.type,
      time: event.time || '09:00',
      scope: event.scope,
    });
    setIsModalOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!formData.title) {
      toast.error(language === 'vi' ? 'Vui lòng nhập tiêu đề' : 'Please enter a title');
      return;
    }

    const eventDate = new Date(year, month - 1, selectedDate!);
    const payload = {
      ...formData,
      date: eventDate.toISOString(),
      familyId,
      creatorId,
    };

    try {
      if (editingEvent) {
        await eventsAPI.update(editingEvent.id, familyId, creatorId, payload);
        toast.success(t('common.success'));
      } else {
        await eventsAPI.create(familyId, creatorId, payload);
        toast.success(t('common.success'));
      }
      setIsModalOpen(false);
      fetchEvents(true);
    } catch (error) {
      console.error('Failed to save event:', error);
      toast.error(t('common.error'));
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa?' : 'Are you sure?')) return;
    try {
      await eventsAPI.delete(id, familyId, creatorId);
      toast.success(t('common.success'));
      setIsModalOpen(false);
      setEditingEvent(null);
      fetchEvents(true);
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error(t('common.error'));
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-700">
      {/* Calendar Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-[1.5rem] bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center text-2xl md:text-3xl shadow-xl shadow-indigo-100 dark:shadow-none">
            <FiCalendar />
          </div>
          <div>
            <h2 className="text-2xl md:text-4xl font-black text-slate-800 dark:text-slate-100">
              {t(monthKeys[month - 1])} {year}
            </h2>
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-[10px] md:text-xs">
              {t('nav.calendarFull')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl shadow-inner">
            <button 
              onClick={() => setCurrentDate(new Date(year, month - 2, 1))}
              className="p-2 md:p-3 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all text-slate-600 dark:text-slate-300 active:scale-90"
            >
              <FiChevronLeft size={20} />
            </button>
            <button 
              onClick={() => setCurrentDate(new Date())}
              className="px-4 md:px-6 py-2 text-xs md:text-sm font-black text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all uppercase tracking-widest"
            >
              {t('calendar.today')}
            </button>
            <button 
              onClick={() => setCurrentDate(new Date(year, month, 1))}
              className="p-2 md:p-3 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all text-slate-600 dark:text-slate-300 active:scale-90"
            >
              <FiChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="relative group">
        <div className="grid grid-cols-7 gap-1 md:gap-3">
          {dayKeys.map((dayKey) => (
            <div key={dayKey} className="pb-4 text-center text-[10px] md:text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {t(dayKey)}
            </div>
          ))}
          
          {days.map((day, index) => {
            const dayKey = day ? `day-${year}-${month}-${day}` : `padding-${index}`;
            const dayEvents = day ? events.filter(e => {
              const d = new Date(e.date);
              return d.getDate() === day && d.getMonth() === month - 1 && d.getFullYear() === year;
            }) : [];
            const isTodayDate = day && isToday(new Date(year, month - 1, day));
            const isSelected = selectedDate === day;

            const getDayStyles = () => {
              if (!day) return 'bg-transparent border-transparent opacity-0 pointer-events-none';
              
              let styles = 'cursor-pointer ';
              if (isSelected) {
                styles += 'bg-white dark:bg-slate-800 border-indigo-400 dark:border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-none z-10 scale-[1.02]';
              } else if (isTodayDate) {
                styles += 'bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900/30';
              } else {
                styles += 'bg-white/40 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900';
              }
              return styles;
            };

            return (
              <div
                key={dayKey}
                onClick={() => day && handleDayClick(day)}
                onKeyDown={(e) => {
                  if (day && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleDayClick(day);
                  }
                }}
                role={day ? "button" : undefined}
                tabIndex={day ? 0 : -1}
                aria-label={day ? `Day ${day}` : undefined}
                className={`min-h-[90px] md:min-h-[140px] p-2 md:p-3 rounded-2xl md:rounded-[2rem] border transition-all duration-300 relative group/day ${getDayStyles()}`}
              >
                {day && (
                  <>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className={`text-base md:text-xl font-black ${isTodayDate ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {day}
                        </span>
                        {/* Lunar Date Small - Only for Vietnamese */}
                        {language === 'vi' && (
                          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 dark:text-slate-600 -mt-1">
                            {formatLunarDate(getLunarDate(day, month, year))}
                          </span>
                        )}
                      </div>
                      
                      {!!day && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); openAddModal(day); }}
                          className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition-all hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white"
                        >
                          <FiPlus size={14} />
                        </button>
                      )}
                    </div>

                    <div className="mt-2 space-y-1 overflow-hidden">
                      {dayEvents.slice(0, 3).map((event) => {
                        const getEventStyles = () => {
                          if (event.type === 'BIRTHDAY') return 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/30';
                          if (event.type === 'IMPORTANT') return 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30';
                          return 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/30';
                        };

                        return (
                          <div
                            key={event.id}
                            onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                openEditModal(event);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded-lg text-[9px] md:text-[10px] font-black truncate border transition-all hover:scale-105 active:scale-95 ${getEventStyles()}`}
                          >
                            <span className="flex items-center gap-1">
                              {getEventIcon(event.type)}
                              {event.title}
                            </span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 dark:text-slate-600 text-center uppercase tracking-widest pt-1">
                          + {dayEvents.length - 3} {language === 'vi' ? 'Sự kiện' : 'Events'}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Side Detail Panel (Mobile toggle or desktop side) */}
      {selectedDate && (
        <div className="animate-in slide-in-from-right-4 duration-500 p-6 md:p-8 rounded-[2.5rem] bg-indigo-600 dark:bg-indigo-900/40 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000" />
          
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <div>
                <h3 className="text-xl md:text-3xl font-black">{selectedDate} {t(monthKeys[month - 1])}</h3>
                {language === 'vi' && (
                  <p className="text-indigo-100 dark:text-indigo-300 font-bold text-xs md:text-sm uppercase tracking-widest opacity-80">
                    {t('calendar.lunar')}: {formatLunarDate(getLunarDate(selectedDate, month, year))}
                  </p>
                )}
              </div>
              <button 
                onClick={() => openAddModal(selectedDate)}
                className="px-4 md:px-6 py-2 md:py-3 bg-white text-indigo-600 rounded-2xl text-xs md:text-sm font-black shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <FiPlus /> {t('calendar.addEvent')}
              </button>
            </div>

            <div className="space-y-3 md:space-y-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
              {events.filter(e => {
                const d = new Date(e.date);
                return d.getDate() === selectedDate && d.getMonth() === month - 1 && d.getFullYear() === year;
              }).length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-4xl block mb-2 opacity-40">🌙</span>
                  <p className="text-indigo-200 dark:text-indigo-400 font-bold text-sm">{t('calendar.noEvents')}</p>
                </div>
              ) : (
                events
                  .filter(e => {
                    const d = new Date(e.date);
                    return d.getDate() === selectedDate && d.getMonth() === month - 1 && d.getFullYear() === year;
                  })
                  .map((event) => (
                    <div 
                      key={event.id}
                      onClick={() => openEditModal(event)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openEditModal(event);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="p-4 md:p-5 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all cursor-pointer group/item flex justify-between items-center"
                    >
                      <div className="flex gap-4 items-center">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl">
                          {getEventIcon(event.type)}
                        </div>
                        <div>
                          <h4 className="font-black text-sm md:text-lg">{event.title}</h4>
                          <p className="text-indigo-100 dark:text-indigo-300 text-[10px] md:text-xs font-bold opacity-70 flex items-center gap-1 uppercase tracking-wide">
                            <FiClock /> {event.time || '09:00'} • {event.type}
                            {event.user?.name && (
                                <span className="ml-1 opacity-60">• {language === 'vi' ? 'Bởi ' : 'By '}{event.user.name}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <FiChevronRight className="opacity-0 group-hover/item:opacity-100 group-hover/item:translate-x-1 transition-all" />
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Event Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => setIsModalOpen(false)} 
            role="button"
            tabIndex={-1}
            aria-label="Close modal"
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl p-6 md:p-10 animate-in zoom-in-95 duration-300 border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-slate-100">
                  {editingEvent ? t('calendar.editEvent') : t('calendar.addEvent')}
                </h3>
                {editingEvent?.user?.name && (
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                    {language === 'vi' ? 'Người tạo' : 'Created by'}: {editingEvent.user.name}
                  </p>
                )}
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
              >
                <FiX />
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">{t('calendar.eventTitle')}</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('calendar.eventTitle')}
                  className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-transparent focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 outline-none transition-all text-slate-700 dark:text-slate-200 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">{t('calendar.eventType')}</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-transparent outline-none text-slate-700 dark:text-slate-200 font-bold"
                  >
                    <option value="GENERAL">{t('calendar.type.general')}</option>
                    <option value="HOLIDAY">{t('calendar.type.holiday')}</option>
                    <option value="BIRTHDAY">{t('calendar.type.birthday')}</option>
                    <option value="ANNIVERSARY">{t('calendar.type.anniversary')}</option>
                    <option value="TASK">{t('calendar.type.task')}</option>
                    <option value="APPOINTMENT">{t('calendar.type.appointment')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">{t('calendar.eventTime')}</label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-transparent outline-none text-slate-700 dark:text-slate-200 font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">{t('calendar.eventScope')}</label>
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                {['GLOBAL', 'FAMILY', 'PRIVATE'].map((s) => {
                  const isSelectedScope = formData.scope === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setFormData({ ...formData, scope: s })}
                      className={`flex-1 py-3 rounded-xl text-[10px] md:text-xs font-black transition-all ${
                        isSelectedScope 
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                      }`}
                    >
                      {s === 'GLOBAL' ? t('calendar.scope.global') : s === 'FAMILY' ? t('calendar.scope.family') : t('calendar.scope.personal')}
                    </button>
                  );
                })}
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                {isDeletable && (
                  <button
                    onClick={() => handleDeleteEvent(editingEvent.id)}
                    className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition-all active:scale-95"
                  >
                    <FiTrash2 size={20} />
                  </button>
                )}
                <button
                  onClick={handleSaveEvent}
                  className="flex-1 p-4 rounded-2xl bg-indigo-600 dark:bg-indigo-500 text-white font-black text-sm shadow-xl shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <FiCheck /> {editingEvent ? t('common.save') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
