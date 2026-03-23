'use client';

import { useState, useEffect } from 'react';
import { eventsAPI, usersAPI } from '@/lib/api-client';
import { getCalendarDays, vietnameseMonths, isToday } from '@/utils/date';
import {
  FiChevronLeft,
  FiChevronRight,
  FiCalendar,
  FiClock,
  FiPlus,
  FiX,
  FiCheck,
  FiTrash2,
  FiEdit3,
  FiGift,
  FiStar,
  FiBell,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { getLunarDate } from '@/utils/lunar';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventsCache, setEventsCache] = useState<Record<string, any[]>>({});

  // Manual Event Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Event', // Event, Birthday, Lunar
    time: '09:00',
  });

  const [creatorId, setCreatorId] = useState<string>('');

  const familyId = process.env.NEXT_PUBLIC_FAMILY_ID || 'default-family';

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const days = getCalendarDays(month, year);

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

  const fetchInitialUser = async () => {
    try {
      const response = await usersAPI.getAll(familyId);
      if (response.data && response.data.length > 0) {
        setCreatorId(response.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch initial user:', error);
    }
  };

  const fetchEvents = async (forceRefresh = false) => {
    const key = `${year}-${month}`;
    if (!forceRefresh && eventsCache[key]) {
      setEvents(eventsCache[key]);
      return;
    }

    setLoading(true);
    try {
      const response = await eventsAPI.getAll(familyId, month, year);
      setEvents(response.data);
      setEventsCache((prev) => ({ ...prev, [key]: response.data }));
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: string) => {
    const lowerType = type?.toLowerCase();
    switch (lowerType) {
      case 'birthday':
        return <FiGift size={12} />;
      case 'memorial':
      case 'giỗ':
        return <FiStar size={12} />;
      case 'holiday':
      case 'lunar':
        return <FiStar size={12} color="#10b981" />;
      default:
        return <FiBell size={12} />;
    }
  };

  const getEventsForDay = (day: number) => {
    return events.filter((event) => {
      const eventDate = new Date(event.date);
      return (
        eventDate.getDate() === day &&
        eventDate.getMonth() + 1 === month &&
        eventDate.getFullYear() === year
      );
    });
  };

  const openAddForm = () => {
    if (!selectedDate) return;
    setEditingEvent(null);
    setFormData({
      title: '',
      description: '',
      type: 'Event',
      time: '09:00',
    });
    setIsModalOpen(true);
  };

  const openEditForm = (event: any) => {
    const eventDate = new Date(event.date);
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      type: event.type || 'Event',
      time: eventDate.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    });
    setIsModalOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!formData.title.trim() || !selectedDate) {
      toast.error('Vui lòng nhập tiêu đề sự kiện');
      return;
    }

    const eventDate = new Date(year, month - 1, selectedDate);
    const [hours, minutes] = formData.time.split(':');
    eventDate.setHours(Number.parseInt(hours, 10), Number.parseInt(minutes, 10));

    const payload = {
      title: formData.title,
      description: formData.description,
      type: formData.type,
      date: eventDate.toISOString(),
      familyId,
    };

    try {
      if (editingEvent) {
        await eventsAPI.update(editingEvent.id, familyId, payload);
        toast.success('Đã cập nhật sự kiện');
      } else {
        if (!creatorId) {
          toast.error('Không tìm thấy thông tin người tạo');
          return;
        }
        await eventsAPI.create(familyId, creatorId, payload);
        toast.success('Đã thêm sự kiện');
      }
      fetchEvents(true);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to save event:', error);
      toast.error('Không thể lưu sự kiện');
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!globalThis.confirm?.('Bạn có chắc chắn muốn xóa sự kiện này?')) return;
    try {
      await eventsAPI.delete(id, familyId);
      toast.success('Đã xóa sự kiện');
      fetchEvents(true);
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error('Không thể xóa sự kiện');
    }
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
    setSelectedDate(null);
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
    setSelectedDate(null);
  };

  return (
    <div className="space-y-6 md:space-y-10">
      {/* Calendar Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl md:text-3xl shadow-xl shadow-indigo-100 shrink-0">
            <FiCalendar />
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-black text-slate-800 tracking-tight">
              {vietnameseMonths[month - 1]} <span className="text-slate-300">/ {year}</span>
            </h2>
            <p className="text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-widest mt-1">
              {events.length} sự kiện trong tháng
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 bg-slate-100/50 p-1.5 rounded-2xl md:rounded-3xl border border-slate-100 self-center md:self-auto">
          <button
            onClick={prevMonth}
            className="p-2 md:p-3 hover:bg-white hover:text-indigo-600 rounded-xl md:rounded-2xl transition-all hover:shadow-md"
            title="Tháng trước"
          >
            <FiChevronLeft size={20} />
          </button>
          <div className="w-[1px] h-6 bg-slate-200" />
          <button
            onClick={nextMonth}
            className="p-2 md:p-3 hover:bg-white hover:text-indigo-600 rounded-xl md:rounded-2xl transition-all hover:shadow-md"
            title="Tháng sau"
          >
            <FiChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Calendar Body */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[2px] rounded-3xl">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        <div className="space-y-4">
          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 md:gap-3">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((day) => (
              <div
                key={day}
                className={`text-center text-[10px] md:text-xs font-black uppercase tracking-widest py-2 md:py-4 ${
                  day === 'CN' ? 'text-rose-400' : 'text-slate-300'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 md:gap-4">
            {days.map((day, index) => {
              if (!day)
                return (
                  <div key={`empty-${index}`} className="opacity-0 min-h-[60px] md:min-h-[120px]" />
                );

              const dayEvents = getEventsForDay(day);
              const isSelected = selectedDate === day;
              const isTdy = isToday(new Date(year, month - 1, day));

              let containerClasses =
                'relative min-h-[70px] xs:min-h-[80px] md:min-h-[140px] p-1.5 xs:p-2.5 md:p-5 rounded-2xl md:rounded-[2.5rem] border transition-all duration-500 cursor-pointer overflow-hidden text-left w-full h-full flex flex-col outline-none focus:ring-4 focus:ring-indigo-500/10';

              if (isSelected) {
                containerClasses +=
                  ' bg-indigo-600 border-indigo-500 shadow-2xl shadow-indigo-100 scale-[1.03] z-20';
              } else if (isTdy) {
                containerClasses += ' bg-white border-indigo-600 shadow-lg shadow-indigo-50';
              } else {
                containerClasses +=
                  ' bg-white border-slate-50 hover:border-indigo-100 hover:shadow-xl hover:-translate-y-1';
              }

              let textClasses =
                'text-xs xs:text-sm md:text-xl font-black transition-colors duration-500 line-height-1';
              if (isSelected) {
                textClasses += ' text-white';
              } else if (isTdy) {
                textClasses += ' text-indigo-600';
              } else {
                textClasses += ' text-slate-800';
              }

              return (
                <button
                  key={`${year}-${month}-${day}`}
                  onClick={() => setSelectedDate(day)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedDate(day)}
                  className={containerClasses}
                  aria-label={`Ngày ${day} tháng ${month}`}
                  tabIndex={0}
                >
                  <div className="flex flex-col items-center justify-center h-fit">
                    <div className={textClasses}>{day}</div>
                    {day && (
                      <div
                        className={`text-[9px] md:text-[11px] font-bold leading-none ${
                          isSelected ? 'text-white/80' : 'text-slate-400'
                        }`}
                      >
                        {getLunarDate(day, month, year).day}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1 md:gap-1.5 flex-1 w-full text-left overflow-hidden items-start">
                    {dayEvents.slice(0, 4).map((event) => {
                      let badgeClasses =
                        'flex items-center justify-center w-5 h-5 md:w-8 md:h-8 rounded-lg md:rounded-xl shadow-sm transition-all duration-500 hover:scale-110';
                      const lowerType = event.type?.toLowerCase();
                      if (isSelected) {
                        badgeClasses += ' bg-white/20 text-white backdrop-blur-md';
                      } else if (lowerType === 'birthday') {
                        badgeClasses += ' bg-rose-500 text-white';
                      } else if (lowerType === 'giỗ' || lowerType === 'memorial') {
                        badgeClasses += ' bg-amber-500 text-white';
                      } else if (lowerType === 'holiday' || lowerType === 'lunar') {
                        badgeClasses += ' bg-emerald-500 text-white';
                      } else {
                        badgeClasses += ' bg-indigo-50 text-indigo-600 border border-indigo-100';
                      }

                      return (
                        <div key={event.id} className={badgeClasses} title={event.title}>
                          {getEventIcon(event.type)}
                        </div>
                      );
                    })}
                    {dayEvents.length > 4 && (
                      <div
                        className={`text-[7px] md:text-[9px] font-black uppercase tracking-wider px-1 self-center ${
                          isSelected ? 'text-white/60' : 'text-slate-300'
                        }`}
                      >
                        +{dayEvents.length - 4}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Day Details (Below calendar) */}
      <div className="animate-in fade-in slide-in-from-top-4 duration-700">
        {selectedDate && (
          <div className="bg-indigo-50/50 p-6 md:p-10 rounded-[2.5rem] border-2 border-dashed border-indigo-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center text-xl font-black text-indigo-600">
                {selectedDate}
              </div>
              <button
                onClick={openAddForm}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-2xl font-black text-xs md:text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 group"
              >
                <FiPlus className="group-hover:rotate-90 transition-transform" />
                <span>Thêm sự kiện</span>
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {getEventsForDay(selectedDate).length === 0 ? (
                <div className="col-span-full py-10 text-center bg-white/50 rounded-3xl border-2 border-dashed border-indigo-100">
                  <p className="text-slate-400 font-medium italic">
                    Không có sự kiện nào cho ngày này.
                  </p>
                </div>
              ) : (
                getEventsForDay(selectedDate).map((event) => {
                  const lowerType = event.type?.toLowerCase();
                  return (
                    <div
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEditForm(event)}
                      onKeyDown={(e) => e.key === 'Enter' && openEditForm(event)}
                      className="bg-white p-6 rounded-3xl shadow-md border border-slate-50 relative overflow-hidden group cursor-pointer hover:border-indigo-200 hover:shadow-xl transition-all"
                    >
                      <div
                        className={`absolute top-0 left-0 w-1.5 h-full ${
                          lowerType === 'birthday'
                            ? 'bg-rose-500'
                            : lowerType === 'giỗ' || lowerType === 'memorial'
                              ? 'bg-amber-500'
                              : 'bg-indigo-600'
                        }`}
                      />
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div
                            className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                              lowerType === 'birthday'
                                ? 'bg-rose-50 text-rose-500'
                                : lowerType === 'giỗ' || lowerType === 'memorial'
                                  ? 'bg-amber-50 text-amber-500'
                                  : 'bg-indigo-50 text-indigo-500'
                            }`}
                          >
                            {getEventIcon(event.type)}
                          </div>
                          <h4 className="font-black text-slate-800 truncate group-hover:text-indigo-600 transition-colors uppercase tracking-tight text-sm">
                            {event.title}
                          </h4>
                        </div>
                        <FiEdit3 className="text-slate-300 group-hover:text-indigo-600 transition-colors flex-shrink-0 mt-1" />
                      </div>
                      {event.description && (
                        <p className="text-slate-500 text-xs leading-relaxed mb-3 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                          <FiClock className="text-indigo-400" />{' '}
                          {new Date(event.date).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {event.lunarDate && (
                          <span className="text-[10px] font-black text-indigo-400/60 uppercase tracking-widest flex items-center gap-1.5">
                            🌙 {event.lunarDate}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Event Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            <div className="bg-indigo-600 p-8 text-white relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <FiX size={24} />
              </button>
              <h3 className="text-2xl font-black">
                {editingEvent ? 'Chỉnh sửa sự kiện' : 'Thêm sự kiện mới'}
              </h3>
              <p className="text-indigo-100 text-sm font-medium mt-1">
                Ngày {selectedDate} tháng {month}, {year}
              </p>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="event-title"
                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block"
                  >
                    Tiêu đề sự kiện
                  </label>
                  <input
                    id="event-title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Nhập tiêu đề..."
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-slate-800 font-bold placeholder:text-slate-300 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="event-type"
                      className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block"
                    >
                      Loại sự kiện
                    </label>
                    <select
                      id="event-type"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-slate-800 font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none cursor-pointer"
                    >
                      <option value="Event">Sự kiện</option>
                      <option value="Birthday">Sinh nhật</option>
                      <option value="Giỗ">Ngày giỗ</option>
                      <option value="Lunar">Âm lịch</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="event-time"
                      className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block"
                    >
                      Thời gian
                    </label>
                    <div className="relative">
                      <FiClock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input
                        id="event-time"
                        type="time"
                        value={formData.time}
                        onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                        className="w-full bg-slate-50 border-none rounded-2xl pl-14 pr-6 py-4 text-slate-800 font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="event-description"
                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block"
                  >
                    Mô tả (không bắt buộc)
                  </label>
                  <textarea
                    id="event-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Thêm chi tiết..."
                    rows={3}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-slate-800 font-bold placeholder:text-slate-300 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                {editingEvent && (
                  <button
                    onClick={() => {
                      handleDeleteEvent(editingEvent.id);
                      setIsModalOpen(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-rose-500 hover:bg-rose-50 transition-colors border-2 border-rose-50"
                  >
                    <FiTrash2 />
                    <span>Xóa</span>
                  </button>
                )}
                <button
                  onClick={handleSaveEvent}
                  className="flex-[2] flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                >
                  <FiCheck />
                  <span>{editingEvent ? 'Cập nhật' : 'Lưu sự kiện'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
