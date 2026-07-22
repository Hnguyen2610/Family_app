'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { dailyTasksAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FiArrowLeft,
  FiPlus,
  FiGrid,
  FiClock,
  FiRefreshCw,
  FiCheckCircle,
} from 'react-icons/fi';
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableTaskItem, type DailyTask, WEEKDAYS, toggleWeekday } from './SortableTaskItem';

interface DailyTasksProps {
  readonly onBack?: () => void;
}

export default function DailyTasks({ onBack }: DailyTasksProps) {
  const { user } = useAuth();
  const { language } = useTranslation();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [title, setTitle] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([]);
  const [activeStartTime, setActiveStartTime] = useState('08:00');
  const [activeEndTime, setActiveEndTime] = useState('17:00');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchTasks = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const response = await dailyTasksAPI.getAll(user.id);
      setTasks(response.data || []);
    } catch (error) {
      console.error('Failed to fetch daily tasks:', error);
      toast.error(
        language === 'vi' ? 'Không thể tải danh sách công việc' : 'Failed to load tasks'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!title.trim()) {
      toast.error(
        language === 'vi' ? 'Vui lòng nhập tên công việc' : 'Please enter task title'
      );
      return;
    }

    setIsSaving(true);
    try {
      const response = await dailyTasksAPI.create({
        userId: user.id,
        title: title.trim(),
        intervalMinutes: Number(intervalMinutes) || 30,
        repeatWeekdays,
        activeStartTime,
        activeEndTime,
      });
      setTasks((prev) => [...prev, response.data].sort((a, b) => a.priority - b.priority));
      setTitle('');
      setIntervalMinutes(30);
      setRepeatWeekdays([]);
      setActiveStartTime('08:00');
      setActiveEndTime('17:00');
      toast.success(
        language === 'vi' ? 'Đã thêm công việc nhắc nhở' : 'Task added successfully'
      );
    } catch (error) {
      console.error('Failed to create task:', error);
      toast.error(language === 'vi' ? 'Không thể thêm công việc' : 'Failed to add task');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isActive: !currentStatus } : t))
    );
    try {
      const response = await dailyTasksAPI.update(id, { isActive: !currentStatus });
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...response.data } : t)));
    } catch (error) {
      console.error('Failed to toggle task active status:', error);
      toast.error(
        language === 'vi' ? 'Không thể cập nhật trạng thái' : 'Failed to update status'
      );
      // Rollback
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isActive: currentStatus } : t))
      );
    }
  };

  const handleCompleteToday = async (id: string) => {
    if (!user?.id) return;
    const completedAt = new Date().toISOString();
    const previousTasks = [...tasks];
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completedAt, nextReminderAt: null } : t))
    );
    try {
      await dailyTasksAPI.completeToday(id, user.id);
      toast.success(language === 'vi' ? 'Đã hoàn thành hôm nay' : 'Marked done for today');
    } catch (error) {
      console.error('Failed to complete task:', error);
      toast.error(language === 'vi' ? 'Không thể đánh dấu hoàn thành' : 'Failed to mark done');
      setTasks(previousTasks);
    }
  };

  const handleUpdateInterval = async (id: string, mins: number) => {
    if (mins < 1) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, intervalMinutes: mins } : t))
    );
    try {
      const response = await dailyTasksAPI.update(id, { intervalMinutes: mins });
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...response.data } : t)));
    } catch (error) {
      console.error('Failed to update task interval:', error);
      toast.error(
        language === 'vi' ? 'Không thể cập nhật thời gian' : 'Failed to update interval'
      );
    }
  };

  const handleUpdateSchedule = async (
    id: string,
    data: Pick<Partial<DailyTask>, 'repeatWeekdays' | 'activeStartTime' | 'activeEndTime'>
  ) => {
    const previousTasks = [...tasks];
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    try {
      const response = await dailyTasksAPI.update(id, data as any);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...response.data } : t)));
    } catch (error) {
      console.error('Failed to update task schedule:', error);
      toast.error(
        language === 'vi' ? 'Không thể cập nhật lịch nhắc nhở' : 'Failed to update schedule'
      );
      setTasks(previousTasks);
    }
  };

  const handleRemove = async (id: string) => {
    const check = window.confirm(
      language === 'vi'
        ? 'Bạn có chắc chắn muốn xóa công việc này không?'
        : 'Are you sure you want to delete this task?'
    );
    if (!check) return;

    // Optimistic UI update
    const previousTasks = [...tasks];
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await dailyTasksAPI.remove(id);
      toast.success(language === 'vi' ? 'Đã xóa công việc' : 'Task deleted');
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast.error(language === 'vi' ? 'Không thể xóa công việc' : 'Failed to delete task');
      setTasks(previousTasks); // roll back
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((item) => item.id === active.id);
    const newIndex = tasks.findIndex((item) => item.id === over.id);

    const reorderedTasks = arrayMove(tasks, oldIndex, newIndex);
    // Recalculate priorities based on new index
    const updatedTasks = reorderedTasks.map((t, idx) => ({
      ...t,
      priority: idx,
    }));

    setTasks(updatedTasks);

    try {
      const payload = updatedTasks.map((t) => ({ id: t.id, priority: t.priority }));
      await dailyTasksAPI.reorder(payload);
    } catch (error) {
      console.error('Failed to save reordered tasks:', error);
      toast.error(
        language === 'vi' ? 'Không thể lưu thứ tự sắp xếp' : 'Failed to save layout order'
      );
      // Re-fetch to reset system state
      fetchTasks();
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="outline" onClick={onBack} className="h-10 px-4 flex items-center gap-2">
              <FiArrowLeft /> {language === 'vi' ? 'Quay lại' : 'Back'}
            </Button>
          )}
          <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-500 text-2xl border border-pink-500/20 shadow-sm shadow-pink-100">
            <FiCheckCircle />
          </div>
          <div>
            <h2 className="text-2xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {language === 'vi' ? 'Công việc hằng ngày' : 'Daily Tasks'}
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {language === 'vi'
                ? 'Nhắc nhở tuần hoàn qua Telegram'
                : 'Cyclic Telegram Reminders'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={fetchTasks}
          disabled={isLoading}
          className="h-10 px-4 flex items-center gap-2"
        >
          <FiRefreshCw className={isLoading ? 'animate-spin' : ''} />
          {language === 'vi' ? 'Tải lại' : 'Refresh'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6">
        {/* Form add task */}
        <section className="rounded-2xl border border-pink-100 dark:border-pink-500/10 bg-white/90 dark:bg-slate-950/75 p-5 md:p-6 space-y-5 h-fit shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-500 border border-pink-500/20">
              <FiPlus />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {language === 'vi' ? 'Thêm công việc' : 'Add New Task'}
              </h3>
              <p className="text-xs text-slate-500 font-semibold">
                {language === 'vi' ? 'Hỗ trợ nhắc lại tự động' : 'Automatic scheduled checkins'}
              </p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500">
                {language === 'vi' ? 'Tên công việc' : 'Task Title'}
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSaving}
                placeholder={
                  language === 'vi'
                    ? 'Ví dụ: Đọc báo cáo ngày, Kiểm tra server...'
                    : 'E.g. Read morning logs, Check servers...'
                }
                className="h-11 rounded-xl border-pink-100 focus:border-pink-300 focus:ring-pink-200"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500">
                {language === 'vi' ? 'Thời gian nhắc lại (phút)' : 'Reminder Interval (mins)'}
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value)))}
                  disabled={isSaving}
                  className="h-11 rounded-xl pr-14 border-pink-100 focus:border-pink-300 focus:ring-pink-200"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 capitalize">
                  {language === 'vi' ? 'phút' : 'mins'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500">
                {language === 'vi' ? 'Lặp lại vào ngày' : 'Repeat on'}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRepeatWeekdays([])}
                  className={`h-8 px-3 rounded-lg text-xs font-bold border transition-colors ${
                    repeatWeekdays.length === 0
                      ? 'bg-pink-500 text-white border-pink-500'
                      : 'bg-white text-slate-500 border-pink-100 hover:border-pink-300'
                  }`}
                >
                  {language === 'vi' ? 'Mỗi ngày' : 'Every day'}
                </button>
                {WEEKDAYS.map((day) => (
                  <button
                    type="button"
                    key={day.value}
                    onClick={() => setRepeatWeekdays((prev) => toggleWeekday(prev, day.value))}
                    className={`h-8 min-w-9 px-2 rounded-lg text-xs font-bold border transition-colors ${
                      repeatWeekdays.includes(day.value)
                        ? 'bg-pink-500 text-white border-pink-500'
                        : 'bg-white text-slate-500 border-pink-100 hover:border-pink-300'
                    }`}
                  >
                    {language === 'vi' ? day.vi : day.en}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">
                  {language === 'vi' ? 'Từ giờ' : 'From'}
                </label>
                <Input
                  type="time"
                  value={activeStartTime}
                  onChange={(e) => setActiveStartTime(e.target.value)}
                  disabled={isSaving}
                  className="h-11 rounded-xl border-pink-100 focus:border-pink-300 focus:ring-pink-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">
                  {language === 'vi' ? 'Đến giờ' : 'To'}
                </label>
                <Input
                  type="time"
                  value={activeEndTime}
                  onChange={(e) => setActiveEndTime(e.target.value)}
                  disabled={isSaving}
                  className="h-11 rounded-xl border-pink-100 focus:border-pink-300 focus:ring-pink-200"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSaving}
              className="w-full h-12 text-sm flex items-center justify-center gap-2 rounded-xl mt-4 bg-pink-500 hover:bg-pink-600 text-white shadow-md shadow-pink-200"
            >
              <FiPlus />
              {isSaving
                ? language === 'vi'
                  ? 'Đang thêm...'
                  : 'Adding...'
                : language === 'vi'
                ? 'Thêm vào hàng đợi'
                : 'Add to reminder queue'}
            </Button>
          </form>

          {/* Business Hours Note */}
          <div className="p-4 rounded-2xl bg-pink-50 border border-pink-100 text-[11px] text-slate-500 space-y-1.5 leading-relaxed dark:bg-pink-500/5 dark:border-pink-500/10">
            <div className="flex items-center gap-2 text-pink-500 font-bold">
              <FiClock />
              <span>{language === 'vi' ? 'Khung giờ hoạt động' : 'Active Notification Windows'}</span>
            </div>
            <p>
              {language === 'vi'
                ? 'Mỗi công việc có thể chọn ngày lặp và khoảng giờ nhắc riêng. Khi bấm Xong, hệ thống sẽ ngừng nhắc công việc đó trong ngày.'
                : 'Each task can have its own repeat days and active reminder hours. Marking it Done stops reminders for that task today.'}
            </p>
          </div>
        </section>

        {/* Task List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {language === 'vi' ? 'Hàng đợi nhắc việc' : 'Reminder Queue'}
            </h3>
            <span className="text-xs font-bold text-pink-500">
              {tasks.length} {language === 'vi' ? 'công việc' : 'tasks'}
            </span>
          </div>

          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-pink-100 dark:border-pink-500/10 bg-white/90 p-10 text-center shadow-sm">
              <FiCheckCircle className="mx-auto text-4xl text-pink-200 dark:text-pink-500/30 mb-4" />
              <p className="text-sm font-bold text-slate-500">
                {isLoading
                  ? language === 'vi'
                    ? 'Đang tải hàng đợi...'
                    : 'Loading queue...'
                  : language === 'vi'
                  ? 'Chưa có công việc nhắc nhở nào.'
                  : 'No tasks scheduled yet.'}
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <SortableTaskItem
                      key={task.id}
                      task={task}
                      language={language}
                      onCompleteToday={handleCompleteToday}
                      onToggleActive={handleToggleActive}
                      onUpdateInterval={handleUpdateInterval}
                      onUpdateSchedule={handleUpdateSchedule}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {tasks.length > 1 && (
            <div className="text-xs font-semibold text-slate-400 text-center mt-2 flex items-center justify-center gap-1.5">
              <FiGrid />
              <span>{language === 'vi' ? 'Kéo thả các thẻ để sắp xếp thứ tự ưu tiên' : 'Drag items to reorder priorities'}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

