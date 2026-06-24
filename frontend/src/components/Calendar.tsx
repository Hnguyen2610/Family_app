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
  FiArrowRight,
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
    isRecurring: false,
    recurring: 'NONE',
    useLunar: false,
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
    const key = `${familyId}-${year}-${month}`;
    if (eventsCache[key]) {
      setEvents(eventsCache[key]);
    } else {
      fetchEvents();
    }
  }, [month, year, familyId, eventsCache]);

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
    const key = `${familyId}-${year}-${month}`;
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
      isRecurring: false,
      recurring: 'NONE',
      useLunar: false,
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
      isRecurring: event.isRecurring || false,
      recurring: event.recurring?.replace('LUNAR_', '') || 'NONE',
      useLunar: event.recurring?.startsWith('LUNAR_') || false,
    });
    setIsModalOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!formData.title) {
      toast.error(language === 'vi' ? 'Vui lòng nhập tiêu đề' : 'Please enter a title');
      return;
    }

    const eventDate = new Date(year, month - 1, selectedDate!);
    const targetFamilyId = editingEvent ? editingEvent.familyId : familyId;

    if (!targetFamilyId) {
      toast.error(language === 'vi' ? 'Vui lòng chọn gia đình' : 'Please select a family');
      return;
    }

    const finalRecurring = formData.useLunar && (formData.recurring === 'MONTHLY' || formData.recurring === 'YEARLY')
      ? `LUNAR_${formData.recurring}`
      : formData.recurring;

    const payload = {
      ...formData,
      date: eventDate.toISOString(),
      isRecurring: formData.recurring !== 'NONE',
      recurring: finalRecurring,
    };

    try {
      if (editingEvent) {
        await eventsAPI.update(editingEvent.id, targetFamilyId, creatorId, payload);
        toast.success(t('common.success'));
      } else {
        await eventsAPI.create(targetFamilyId, creatorId, payload);
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
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Calendar Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-white/5 pb-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-3xl">
            <FiCalendar />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-primary/10 text-primary rounded text-[8px] font-black uppercase tracking-[0.2em] mb-2">
              {t('nav.calendarFull')}
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tighter capitalize bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 pb-4 leading-[1.2]">
              {t(monthKeys[month - 1])} <span className="text-primary">{year}</span>
            </h2>
         </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 p-1.5 rounded-xl">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 2, 1))}
              className="p-3 bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg transition-all text-slate-600 dark:text-slate-500 hover:text-primary hover:border-primary/30"
            >
              <FiChevronLeft size={20} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-6 py-2 text-[10px] font-black text-slate-500 dark:text-slate-400 hover:text-primary transition-all uppercase tracking-widest"
            >
               {t('calendar.today')}
            </button>
            <button
              onClick={() => setCurrentDate(new Date(year, month, 1))}
              className="p-3 bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg transition-all text-slate-600 dark:text-slate-500 hover:text-primary hover:border-primary/30"
            >
              <FiChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="relative group">
        <div className="grid grid-cols-7 gap-1 md:gap-4">
          {dayKeys.map((dayKey) => (
            <div key={dayKey} className="pb-2 md:pb-4 text-center text-[7px] md:text-[9px] font-black text-slate-500 uppercase tracking-tighter md:tracking-[0.2em]">
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
                styles += 'bg-primary/10 dark:bg-slate-800 border-primary shadow-xl z-10 scale-[1.02] shadow-primary/5';
              } else if (isTodayDate) {
                styles += 'bg-primary/5 border-primary/20 bg-white/40 dark:bg-primary/5';
              } else {
                styles += 'bg-white dark:bg-slate-900/40 border-black/5 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-black/20 dark:hover:border-white/10 shadow-sm';
              }
              return styles;
            };

            return (
              <div
                key={dayKey}
                onClick={() => day && handleDayClick(day)}
                className={`min-h-[100px] md:min-h-[160px] p-4 rounded-xl border transition-all duration-500 relative group/day ${getDayStyles()}`}
              >
                {day && (
                  <>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className={`text-xl font-black ${isTodayDate ? 'text-primary' : 'text-slate-700 dark:text-slate-300'}`}>
                          {day}
                        </span>
                        {language === 'vi' && (
                          <span className="text-[9px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-tighter">
                            {formatLunarDate(getLunarDate(day, month, year))}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); openAddModal(day); }}
                        className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition-all hover:bg-primary hover:text-primary-foreground border border-black/5 dark:border-white/5"
                      >
                        <FiPlus size={14} />
                      </button>
                    </div>

                    <div className="mt-4 space-y-2 overflow-hidden">
                      {dayEvents.slice(0, 2).map((event) => {
                        const getEventStyles = () => {
                          if (event.type === 'BIRTHDAY') return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
                          if (event.type === 'IMPORTANT') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
                          return 'bg-primary/10 text-primary border-primary/20';
                        };
                        return (
                          <div
                            key={event.id}
                            onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                            className={`px-2 py-1.5 rounded-lg text-[9px] font-black truncate border transition-all hover:scale-105 ${getEventStyles()}`}
                          >
                            <span className="flex items-center gap-1.5 uppercase tracking-tighter">
                              {getEventIcon(event.type)}
                              {event.title}
                            </span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <p className="text-[8px] font-black text-slate-500 dark:text-slate-600 text-center uppercase tracking-widest pt-1">
                          + {dayEvents.length - 2} {language === 'vi' ? 'Sự kiện' : 'Ledger Entries'}
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

      {/* Side Detail Panel */}
      {selectedDate && (
        <div className="animate-in slide-in-from-bottom-4 duration-500 p-10 rounded-2xl glass bg-white/60 dark:bg-slate-900/60 border border-black/5 dark:border-primary/30 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-slate-900 dark:text-white">
             <FiClock size={120} />
          </div>

          <div className="relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
              <div>
                <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-primary/20 text-primary rounded text-[8px] font-black uppercase tracking-[0.2em] mb-3">
                   {t('nav.node')}
                </div>
                <h3 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-slate-100 tracking-tighter italic">
                   {selectedDate} <span className="text-primary not-italic">{t(monthKeys[month - 1])}</span>
                </h3>
                {language === 'vi' && (
                  <p className="text-primary font-black text-[10px] uppercase tracking-[0.2em] mt-3 opacity-60">
                    {t('calendar.lunar')}: {formatLunarDate(getLunarDate(selectedDate, month, year))}
                  </p>
                )}
              </div>
              <button
                onClick={() => openAddModal(selectedDate)}
                className="btn-primary flex items-center gap-2"
              >
                <FiPlus /> {t('calendar.addEvent')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.filter(e => {
                const d = new Date(e.date);
                return d.getDate() === selectedDate && d.getMonth() === month - 1 && d.getFullYear() === year;
              }).length === 0 ? (
                <div className="col-span-full py-20 text-center glass-dark rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <FiClock className="text-slate-400 dark:text-slate-800 text-4xl mx-auto mb-4" />
                  <p className="text-[10px] text-slate-500 dark:text-slate-600 font-black uppercase tracking-widest">{t('calendar.noEvents')}</p>
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
                      className="p-6 rounded-xl bg-slate-100 dark:bg-slate-900 border border-black/5 dark:border-white/5 hover:border-primary/30 transition-all cursor-pointer group/item relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                         <FiArrowRight size={14} className="text-primary" />
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800 border border-black/5 dark:border-white/5 flex items-center justify-center text-primary text-xl">
                          {getEventIcon(event.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                             <h4 className="font-black text-slate-900 dark:text-slate-100 text-base truncate">{event.title}</h4>
                             <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 border border-black/5 dark:border-white/5 uppercase tracking-tighter">
                               {event.familyName || 'System'}
                             </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-500 font-black uppercase tracking-widest flex items-center gap-2">
                            <FiClock className="text-primary" /> {event.time || '00:00'} // {event.type}
                          </p>
                        </div>
                      </div>
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
            className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="relative w-full max-w-xl glass bg-white/95 dark:bg-slate-900/95 border border-black/10 dark:border-white/10 p-10 md:p-12 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-300 backdrop-blur-2xl">
            <div className="flex justify-between items-start mb-10">
              <div>
                <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-primary/10 text-primary rounded text-[8px] font-black uppercase tracking-[0.2em] mb-3">
                   {t('nav.protocol')}
                </div>
                <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">
                  {editingEvent ? t('calendar.editEvent') : t('calendar.addEvent')}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-500 hover:text-rose-500 transition-all bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-lg"
              >
                <FiX />
              </button>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">{t('calendar.eventTitle')}</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="..."
                  className="input-field"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">{t('calendar.eventDesc')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="..."
                  className="input-field min-h-[80px] py-4"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">{t('calendar.eventType')}</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="input-field appearance-none"
                  >
                    <option value="GENERAL">{t('calendar.type.general')}</option>
                    <option value="HOLIDAY">{t('calendar.type.holiday')}</option>
                    <option value="BIRTHDAY">{t('calendar.type.birthday')}</option>
                    <option value="ANNIVERSARY">{t('calendar.type.anniversary')}</option>
                    <option value="APPOINTMENT">{t('calendar.type.appointment')}</option>
                    <option value="TASK">{t('calendar.type.task')}</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">{t('calendar.recurring')}</label>
                  <select
                    value={formData.recurring}
                    onChange={(e) => setFormData({ ...formData, recurring: e.target.value })}
                    className="input-field appearance-none"
                  >
                    <option value="NONE">{t('calendar.recurring.none')}</option>
                    <option value="WEEKLY">{t('calendar.recurring.weekly')}</option>
                    <option value="MONTHLY">{t('calendar.recurring.monthly')}</option>
                    <option value="YEARLY">{t('calendar.recurring.yearly')}</option>
                  </select>
                </div>
              </div>

              {(formData.recurring === 'MONTHLY' || formData.recurring === 'YEARLY') && (
                <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10 dark:border-primary/20">
                  <input
                    type="checkbox"
                    id="useLunar"
                    checked={formData.useLunar}
                    onChange={(e) => setFormData({ ...formData, useLunar: e.target.checked })}
                    className="w-4 h-4 rounded bg-white dark:bg-slate-900 border-black/10 dark:border-white/10 text-primary focus:ring-primary"
                  />
                  <label htmlFor="useLunar" className="text-[11px] font-black text-primary uppercase tracking-widest cursor-pointer">
                    {t('calendar.useLunar')}
                  </label>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">{t('calendar.eventTime')}</label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="input-field shrink-white shadow-none"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">{t('calendar.eventScope')}</label>
                <div className="flex p-1 bg-slate-100 dark:bg-slate-900 border border-black/5 dark:border-white/5 rounded-xl">
                {['GLOBAL', 'FAMILY', 'PRIVATE'].map((s) => {
                  const isSelectedScope = formData.scope === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setFormData({ ...formData, scope: s })}
                      className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        isSelectedScope
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
                </div>
              </div>

              <div className="pt-10 flex gap-4">
                {isDeletable && (
                  <button
                    onClick={() => handleDeleteEvent(editingEvent.id)}
                    className="p-4 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-500/20 transition-all"
                  >
                    <FiTrash2 size={20} />
                  </button>
                )}
                <button
                  onClick={handleSaveEvent}
                  className="btn-primary flex-1 flex items-center justify-center gap-3 py-4"
                >
                  <FiCheck /> {language === 'vi' ? 'Xác nhận thay đổi' : 'Commit Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
