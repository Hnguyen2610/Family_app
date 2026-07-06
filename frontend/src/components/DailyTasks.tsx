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
  FiTrash2,
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
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DailyTask {
  id: string;
  title: string;
  priority: number;
  intervalMinutes: number;
  isActive: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

interface DailyTasksProps {
  readonly onBack?: () => void;
}

export default function DailyTasks({ onBack }: DailyTasksProps) {
  const { user } = useAuth();
  const { language } = useTranslation();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [title, setTitle] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(30);
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
        language === 'vi' ? 'Vui lòng nhập tên công việc' : 'Please enters task title'
      );
      return;
    }

    setIsSaving(true);
    try {
      const response = await dailyTasksAPI.create({
        userId: user.id,
        title: title.trim(),
        intervalMinutes: Number(intervalMinutes) || 30,
      });
      setTasks((prev) => [...prev, response.data].sort((a, b) => a.priority - b.priority));
      setTitle('');
      setIntervalMinutes(30);
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
      await dailyTasksAPI.update(id, { isActive: !currentStatus });
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

  const handleUpdateInterval = async (id: string, mins: number) => {
    if (mins < 1) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, intervalMinutes: mins } : t))
    );
    try {
      await dailyTasksAPI.update(id, { intervalMinutes: mins });
    } catch (error) {
      console.error('Failed to update task interval:', error);
      toast.error(
        language === 'vi' ? 'Không thể cập nhật thời gian' : 'Failed to update interval'
      );
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
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="outline" onClick={onBack} className="h-10 px-4 flex items-center gap-2">
              <FiArrowLeft /> {language === 'vi' ? 'Quay lại' : 'Back'}
            </Button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 text-2xl border border-indigo-500/20">
            <FiCheckCircle />
          </div>
          <div>
            <h2 className="text-2xl md:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tighter uppercase italic">
              {language === 'vi' ? 'Công việc hằng ngày' : 'Daily Tasks'}
            </h2>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-8">
        {/* Form add task */}
        <section className="glass rounded-3xl border border-black/5 dark:border-white/5 p-6 md:p-8 space-y-5 h-fit">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <FiPlus />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">
                {language === 'vi' ? 'Thêm công việc' : 'Add New Task'}
              </h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                {language === 'vi' ? 'Hỗ trợ nhắc lại tự động' : 'Automatic scheduled checkins'}
              </p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
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
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {language === 'vi' ? 'Thời gian nhắc lại (phút)' : 'Reminder Interval (mins)'}
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value)))}
                  disabled={isSaving}
                  className="h-11 rounded-xl pr-14"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 capitalize">
                  {language === 'vi' ? 'phút' : 'mins'}
                </span>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSaving}
              className="w-full h-12 text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 rounded-xl mt-4"
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
          <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 text-[11px] text-slate-500 space-y-1.5 leading-relaxed">
            <div className="flex items-center gap-2 text-indigo-500 font-black uppercase tracking-wider">
              <FiClock />
              <span>{language === 'vi' ? 'Khung giờ hoạt động' : 'Active Notification Windows'}</span>
            </div>
            <p>
              {language === 'vi'
                ? 'Hệ thống chỉ gửi thông qua Telegram trong các khung giờ: 8:00 - 12:00 và 14:00 - 17:00 (Giờ làm việc). Các công việc ngoài giờ hành chính sẽ tạm hoãn và tự động quay vòng tiếp tục vào sáng hôm sau.'
                : 'Notifications are pushed to Telegram exclusively during 8:00 - 12:00 and 14:00 - 17:00 ICT. Tasks triggered off-hours will resume the following morning cycle.'}
            </p>
          </div>
        </section>

        {/* Task List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
              {language === 'vi' ? 'Hàng đợi nhắc việc' : 'Reminder Queue'}
            </h3>
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">
              {tasks.length} {language === 'vi' ? 'công việc' : 'tasks'}
            </span>
          </div>

          {tasks.length === 0 ? (
            <div className="glass rounded-3xl border border-black/5 dark:border-white/5 p-12 text-center">
              <FiCheckCircle className="mx-auto text-4xl text-slate-300 dark:text-slate-700 mb-4" />
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
                      onToggleActive={handleToggleActive}
                      onUpdateInterval={handleUpdateInterval}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {tasks.length > 1 && (
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mt-2 flex items-center justify-center gap-1.5">
              <FiGrid />
              <span>{language === 'vi' ? 'Kéo thả các thẻ để sắp xếp thứ tự ưu tiên' : 'Drag items to reorder priorities'}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SortableTaskItem({
  task,
  language,
  onToggleActive,
  onUpdateInterval,
  onRemove,
}: {
  task: DailyTask;
  language: string;
  onToggleActive: (id: string, current: boolean) => void;
  onUpdateInterval: (id: string, mins: number) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`glass rounded-2xl border p-4 flex items-center gap-3 transition-colors ${
        isDragging
          ? 'border-primary/50 shadow-2xl bg-white/90 dark:bg-slate-900/90'
          : task.isActive
          ? 'border-black/5 dark:border-white/5 hover:border-primary/30'
          : 'border-black/5 dark:border-white/5 opacity-55 saturate-50'
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing p-1 touch-none shrink-0"
        {...attributes}
        {...listeners}
      >
        <FiGrid className="text-base" />
      </button>

      {/* Task Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-black text-[13px] text-slate-900 dark:text-slate-100 truncate leading-tight">
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            {language === 'vi' ? `Ưu tiên ${task.priority + 1}` : `Priority ${task.priority + 1}`}
          </span>
          <span className="flex items-center gap-1">
            <FiClock />
            {task.lastNotifiedAt
              ? (language === 'vi' ? 'Nhắc lúc ' : 'Sent ') +
                new Date(task.lastNotifiedAt).toLocaleTimeString(
                  language === 'vi' ? 'vi-VN' : 'en-US',
                  { hour: '2-digit', minute: '2-digit' }
                )
              : language === 'vi'
              ? 'Chưa thông báo hôm nay'
              : 'Idle today'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Interval settings */}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            value={task.intervalMinutes}
            onChange={(e) => onUpdateInterval(task.id, Math.max(1, Number(e.target.value)))}
            className="w-13 h-8 text-center rounded-lg border border-black/10 dark:border-white/10 bg-slate-100/50 dark:bg-slate-950/50 text-[11px] font-black outline-none focus:border-primary/50"
          />
          <span className="text-[9px] font-black uppercase text-slate-400 capitalize">
            {language === 'vi' ? 'Phút' : 'Mins'}
          </span>
        </div>

        {/* Toggle Active status */}
        <button
          type="button"
          onClick={() => onToggleActive(task.id, task.isActive)}
          className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 outline-none ${
            task.isActive ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-800'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ${
              task.isActive ? 'translate-x-4.5' : 'translate-x-0'
            }`}
          />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onRemove(task.id)}
          className="w-8 h-8 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 transition-all flex items-center justify-center border border-black/5 dark:border-white/5"
          title={language === 'vi' ? 'Xóa' : 'Delete'}
        >
          <FiTrash2 className="text-sm" />
        </button>
      </div>
    </article>
  );
}
