'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { eventsAPI } from '@/lib/api-client';
import { getCalendarDateKey, getCalendarDays } from '@/utils/date';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { CalendarEventModal, type CalendarEventFormData } from './calendar/CalendarEventModal';
import { getIsoDateRange } from './calendar/calendar-render-utils';
import { CalendarDayDetailPanel } from './calendar/CalendarDayDetailPanel';
import { CalendarGrid } from './calendar/CalendarGrid';
import { CalendarHeader } from './calendar/CalendarHeader';
import { useCalendarEvents } from './calendar/useCalendarEvents';

export default function Calendar() {
  const { t, language } = useTranslation();
  const { user, currentFamilyId } = useAuth();
  const familyId = currentFamilyId || '';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [formData, setFormData] = useState<CalendarEventFormData>({
    title: '',
    description: '',
    date: '',
    endDate: '',
    type: 'GENERAL',
    time: '09:00',
    scope: 'GLOBAL',
    isRecurring: false,
    recurring: 'NONE',
    useLunar: false,
  });

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const days = getCalendarDays(month, year);
  const { events, fetchEvents } = useCalendarEvents({
    familyId,
    month,
    userId: user?.id,
    year,
  });

  const isDeletable = editingEvent &&
    !editingEvent.id?.toString().startsWith('holiday-') &&
    !editingEvent.id?.toString().startsWith('birthday-');

  const monthKeys: TranslationKey[] = [
    'calendar.months.jan', 'calendar.months.feb', 'calendar.months.mar', 'calendar.months.apr',
    'calendar.months.may', 'calendar.months.jun', 'calendar.months.jul', 'calendar.months.aug',
    'calendar.months.sep', 'calendar.months.oct', 'calendar.months.nov', 'calendar.months.dec',
  ];

  const dayKeys: TranslationKey[] = [
    'calendar.days.sun', 'calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed',
    'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat',
  ];

  const openAddModal = (day: number) => {
    setSelectedDate(day);
    setEditingEvent(null);
    setFormData({
      title: '',
      description: '',
      date: format(new Date(year, month - 1, day), 'yyyy-MM-dd'),
      endDate: format(new Date(year, month - 1, day), 'yyyy-MM-dd'),
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
      date: event.date ? getCalendarDateKey(event.date) : format(new Date(), 'yyyy-MM-dd'),
      endDate: event.endDate
        ? getCalendarDateKey(event.endDate)
        : event.date
          ? getCalendarDateKey(event.date)
          : format(new Date(), 'yyyy-MM-dd'),
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

    if (!formData.date) {
      toast.error(language === 'vi' ? 'Vui lòng chọn ngày bắt đầu' : 'Please choose a start date');
      return;
    }

    const targetFamilyId = editingEvent
      ? editingEvent.familyId
      : formData.scope === 'GLOBAL'
        ? 'system'
        : (currentFamilyId === 'all' ? user?.familyId : (currentFamilyId || user?.familyId));
    const activeCreatorId = user?.id;

    if (!targetFamilyId || !activeCreatorId) {
      toast.error(language === 'vi' ? 'Vui lòng đăng nhập' : 'Please login');
      return;
    }
    if (formData.scope === 'FAMILY' && currentFamilyId === 'all') {
      toast.error(language === 'vi' ? 'Hãy chọn một gia đình cụ thể trước khi tạo sự kiện' : 'Choose a specific family before creating a family event');
      return;
    }

    const finalRecurring = formData.useLunar && (formData.recurring === 'MONTHLY' || formData.recurring === 'YEARLY')
      ? `LUNAR_${formData.recurring}`
      : formData.recurring;

    const endDate = formData.endDate || formData.date;
    const { endDate: _formEndDate, ...eventData } = formData;
    const payload = {
      ...eventData,
      date: formData.date,
      endDate,
      isRecurring: formData.recurring !== 'NONE',
      recurring: finalRecurring,
    };

    try {
      const dateRange = getIsoDateRange(formData.date, endDate);
      if (dateRange.length === 0) {
        toast.error(language === 'vi' ? 'Khoảng ngày không hợp lệ' : 'Invalid date range');
        return;
      }
      if (dateRange.length >= 32) {
        toast.error(language === 'vi' ? 'Khoảng ngày tối đa là 31 ngày' : 'Date range is limited to 31 days');
        return;
      }

      if (editingEvent) {
        await eventsAPI.update(editingEvent.id, targetFamilyId, activeCreatorId, payload);
        toast.success(t('common.success'));
      } else {
        await eventsAPI.create(targetFamilyId, activeCreatorId, payload);
        toast.success(t('common.success'));
      }
      setIsModalOpen(false);
      fetchEvents(true);
    } catch (error) {
      console.error('Failed to save event:', error);
      const message = (error as any)?.response?.data?.message;
      toast.error(Array.isArray(message) ? message.join(', ') : message || t('common.error'));
    }
  };

  const handleDeleteEvent = async (id: string) => {
    const activeCreatorId = user?.id;
    const targetFamilyId =
      editingEvent?.familyId ||
      (currentFamilyId === 'all' ? user?.familyId : currentFamilyId) ||
      user?.familyId;

    if (!activeCreatorId || !targetFamilyId) return;
    if (!confirm(language === 'vi' ? 'Bạn có chắc chắn muốn xóa?' : 'Are you sure?')) return;

    try {
      await eventsAPI.delete(id, targetFamilyId, activeCreatorId);
      toast.success(t('common.success'));
      setIsModalOpen(false);
      setEditingEvent(null);
      fetchEvents(true);
    } catch (error) {
      console.error('Failed to delete event:', error);
      const message = (error as any)?.response?.data?.message;
      toast.error(Array.isArray(message) ? message.join(', ') : message || t('common.error'));
    }
  };

  return (
    <div className="space-y-5 md:space-y-8">
      <div className="animate-in fade-in duration-300 space-y-5 md:space-y-8">
        <CalendarHeader
          monthKey={monthKeys[month - 1]}
          t={t}
          year={year}
          onNextMonth={() => setCurrentDate(new Date(year, month, 1))}
          onPreviousMonth={() => setCurrentDate(new Date(year, month - 2, 1))}
          onToday={() => setCurrentDate(new Date())}
        />

        <CalendarGrid
          dayKeys={dayKeys}
          days={days}
          events={events}
          language={language}
          month={month}
          selectedDate={selectedDate}
          t={t}
          year={year}
          onAddEvent={openAddModal}
          onEditEvent={openEditModal}
          onSelectDay={setSelectedDate}
        />

        {selectedDate && (
          <CalendarDayDetailPanel
            events={events}
            language={language}
            month={month}
            monthKey={monthKeys[month - 1]}
            selectedDate={selectedDate}
            t={t}
            year={year}
            onAddEvent={openAddModal}
            onEditEvent={openEditModal}
          />
        )}
      </div>

      <CalendarEventModal
        editingEvent={editingEvent}
        formData={formData}
        isDeletable={!!isDeletable}
        isOpen={isModalOpen}
        language={language}
        onDelete={handleDeleteEvent}
        onOpenChange={setIsModalOpen}
        onSave={handleSaveEvent}
        setFormData={setFormData}
        t={t}
      />
    </div>
  );
}
