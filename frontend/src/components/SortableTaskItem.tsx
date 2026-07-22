'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FiGrid,
  FiClock,
  FiBell,
  FiPauseCircle,
  FiTrash2,
  FiCheckCircle,
} from 'react-icons/fi';

export interface DailyTask {
  id: string;
  title: string;
  priority: number;
  intervalMinutes: number;
  repeatWeekdays: number[] | null;
  activeStartTime: string | null;
  activeEndTime: string | null;
  nextReminderAt: string | null;
  isActive: boolean;
  lastNotifiedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export const WEEKDAYS = [
  { value: 1, vi: 'T2', en: 'Mon' },
  { value: 2, vi: 'T3', en: 'Tue' },
  { value: 3, vi: 'T4', en: 'Wed' },
  { value: 4, vi: 'T5', en: 'Thu' },
  { value: 5, vi: 'T6', en: 'Fri' },
  { value: 6, vi: 'T7', en: 'Sat' },
  { value: 0, vi: 'CN', en: 'Sun' },
];

export function toggleWeekday(days: number[], day: number) {
  return days.includes(day)
    ? days.filter((item) => item !== day)
    : [...days, day].sort((a, b) => a - b);
}

function isCompletedToday(completedAt: string | null) {
  if (!completedAt) return false;
  const completedDate = new Date(completedAt);
  const now = new Date();
  return completedDate.toDateString() === now.toDateString();
}

function formatTime(date: Date, language: string) {
  return date.toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function formatReminderTime(value: string, language: string) {
  return formatTime(new Date(value), language);
}

function getNextReminderLabel(task: DailyTask, language: string, completedToday: boolean) {
  if (completedToday) return language === 'vi' ? 'Đã xong hôm nay' : 'Done today';
  if (!task.isActive) return language === 'vi' ? 'Đã tạm dừng' : 'Paused';

  if (!task.nextReminderAt) return language === 'vi' ? 'Chưa có lịch nhắc' : 'No reminder scheduled';

  return `${language === 'vi' ? 'Nhắc tiếp' : 'Next'} ${formatTime(new Date(task.nextReminderAt), language)}`;
}

interface SortableTaskItemProps {
  task: DailyTask;
  language: string;
  onCompleteToday: (id: string) => void;
  onToggleActive: (id: string, current: boolean) => void;
  onUpdateInterval: (id: string, mins: number) => void;
  onUpdateSchedule: (
    id: string,
    data: Pick<Partial<DailyTask>, 'repeatWeekdays' | 'activeStartTime' | 'activeEndTime'>
  ) => void;
  onRemove: (id: string) => void;
}

export function SortableTaskItem({
  task,
  language,
  onToggleActive,
  onCompleteToday,
  onUpdateInterval,
  onUpdateSchedule,
  onRemove,
}: SortableTaskItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const completedToday = isCompletedToday(task.completedAt);
  const reminderLabel = getNextReminderLabel(task, language, completedToday);
  const taskWeekdays = Array.isArray(task.repeatWeekdays) ? task.repeatWeekdays : [];

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border p-4 grid grid-cols-[auto_minmax(0,1fr)] gap-3 transition-colors shadow-sm ${
        isDragging
          ? 'border-pink-300 shadow-lg shadow-pink-100 bg-white/95 dark:bg-slate-900/90'
          : completedToday
          ? 'border-emerald-500/20 bg-emerald-500/5 opacity-70'
          : task.isActive
          ? 'border-pink-100 bg-pink-50/35 hover:border-pink-300 dark:border-pink-500/10 dark:bg-pink-500/5'
          : 'border-black/5 dark:border-white/5 opacity-55 saturate-50'
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="mt-1 text-pink-300 hover:text-pink-500 dark:hover:text-pink-300 cursor-grab active:cursor-grabbing p-1 touch-none shrink-0"
        {...attributes}
        {...listeners}
      >
        <FiGrid className="text-base" />
      </button>

      <div className="min-w-0 space-y-4">
        {/* Task Content */}
        <div className="min-w-0 space-y-1.5">
          <p className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight break-words">
            {task.title}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-400">
            <span className="px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-600 dark:text-pink-300 whitespace-nowrap">
              {language === 'vi' ? `Ưu tiên ${task.priority + 1}` : `Priority ${task.priority + 1}`}
            </span>
            {completedToday && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                {language === 'vi' ? 'Đã xong hôm nay' : 'Done today'}
              </span>
            )}
            <span className="flex items-center gap-1 min-w-0">
              <FiClock className="shrink-0" />
              <span className="break-words">{reminderLabel}</span>
              <span className="hidden">
                {task.lastNotifiedAt
                  ? (language === 'vi' ? 'Nhắc lúc ' : 'Sent ') +
                    formatReminderTime(task.lastNotifiedAt, language)
                  : language === 'vi'
                  ? 'Chưa thông báo hôm nay'
                  : 'Idle today'}
              </span>
            </span>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-pink-100 bg-white/60 p-3 dark:border-pink-500/10 dark:bg-slate-950/30">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateSchedule(task.id, { repeatWeekdays: [] })}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition-colors ${
                taskWeekdays.length === 0
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
                onClick={() =>
                  onUpdateSchedule(task.id, { repeatWeekdays: toggleWeekday(taskWeekdays, day.value) })
                }
                className={`h-7 min-w-8 px-2 rounded-lg text-[11px] font-bold border transition-colors ${
                  taskWeekdays.includes(day.value)
                    ? 'bg-pink-500 text-white border-pink-500'
                    : 'bg-white text-slate-500 border-pink-100 hover:border-pink-300'
                }`}
              >
                {language === 'vi' ? day.vi : day.en}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400">
                {language === 'vi' ? 'Từ' : 'From'}
              </span>
              <input
                type="time"
                value={task.activeStartTime || '08:00'}
                onChange={(e) => onUpdateSchedule(task.id, { activeStartTime: e.target.value })}
                className="h-9 w-full rounded-lg border border-pink-100 bg-white/75 px-2 text-sm font-semibold outline-none focus:border-pink-300 dark:border-pink-500/10 dark:bg-slate-950/50"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400">
                {language === 'vi' ? 'Đến' : 'To'}
              </span>
              <input
                type="time"
                value={task.activeEndTime || '17:00'}
                onChange={(e) => onUpdateSchedule(task.id, { activeEndTime: e.target.value })}
                className="h-9 w-full rounded-lg border border-pink-100 bg-white/75 px-2 text-sm font-semibold outline-none focus:border-pink-300 dark:border-pink-500/10 dark:bg-slate-950/50"
              />
            </label>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!completedToday && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                value={task.intervalMinutes}
                onChange={(e) => onUpdateInterval(task.id, Math.max(1, Number(e.target.value)))}
                className="w-20 h-9 text-center rounded-lg border border-pink-100 dark:border-pink-500/10 bg-white/75 dark:bg-slate-950/50 text-sm font-semibold outline-none focus:border-pink-300"
              />
              <span className="text-xs font-semibold text-slate-400 capitalize">
                {language === 'vi' ? 'Phút' : 'Mins'}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => onCompleteToday(task.id)}
            disabled={completedToday}
            className={`h-9 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              completedToday
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 cursor-default'
                : 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 shadow-sm'
            }`}
            title={language === 'vi' ? 'Hoàn thành hôm nay' : 'Done today'}
          >
            <FiCheckCircle className="text-sm" />
            <span>{completedToday ? (language === 'vi' ? 'Xong' : 'Done') : 'Done'}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleActive(task.id, task.isActive)}
            className={`h-9 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border max-w-full ${
              task.isActive
                ? 'bg-pink-500/10 text-pink-600 border-pink-500/20 hover:bg-pink-500/15'
                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
            }`}
            title={
              task.isActive
                ? language === 'vi'
                  ? 'Đang nhắc theo interval'
                  : 'Reminder is active'
                : language === 'vi'
                ? 'Đã tạm dừng nhắc'
                : 'Reminder is paused'
            }
          >
            {task.isActive ? <FiBell className="text-sm" /> : <FiPauseCircle className="text-sm" />}
            <span>{task.isActive ? (language === 'vi' ? 'Đang nhắc' : 'Active') : (language === 'vi' ? 'Tạm dừng' : 'Paused')}</span>
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => onRemove(task.id)}
            className="w-9 h-9 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 transition-all flex items-center justify-center border border-black/5 dark:border-white/5"
            title={language === 'vi' ? 'Xóa' : 'Delete'}
          >
            <FiTrash2 className="text-sm" />
          </button>
        </div>
      </div>
    </article>
  );
}
