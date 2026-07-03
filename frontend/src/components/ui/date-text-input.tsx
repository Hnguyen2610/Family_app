import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

function isoToDisplayDate(value?: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatIsoDate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getCalendarGridDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function displayToIsoDate(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

interface DateTextInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value?: string;
  onValueChange: (value: string) => void;
}

function DateTextInput({ value, onValueChange, className, onBlur, ...props }: DateTextInputProps) {
  const [displayValue, setDisplayValue] = React.useState(isoToDisplayDate(value));
  const [isOpen, setIsOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(() => (
    value ? new Date(`${value}T00:00:00`) : new Date()
  ));
  const pickerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setDisplayValue(isoToDisplayDate(value));
    if (value) setViewDate(new Date(`${value}T00:00:00`));
  }, [value]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const commitDisplayValue = () => {
    if (!displayValue.trim()) {
      onValueChange("");
      return;
    }

    const isoValue = displayToIsoDate(displayValue);
    if (isoValue) {
      onValueChange(isoValue);
      setDisplayValue(isoToDisplayDate(isoValue));
    }
  };

  const calendarDays = React.useMemo(() => getCalendarGridDays(viewDate), [viewDate]);
  const currentMonth = viewDate.getMonth();
  const selectedIso = value || "";

  const moveMonth = (delta: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const selectDate = (date: Date) => {
    const isoValue = formatIsoDate(date);
    onValueChange(isoValue);
    setDisplayValue(isoToDisplayDate(isoValue));
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="relative">
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        value={displayValue}
        placeholder={props.placeholder || "dd/mm/yyyy"}
        className={cn("font-mono", className)}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onChange={(event) => setDisplayValue(event.target.value)}
        onBlur={(event) => {
          commitDisplayValue();
          onBlur?.(event);
        }}
      />

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-black/10 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-slate-950">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => moveMonth(-1)}
              className="h-9 w-9 rounded-xl border border-black/5 bg-slate-50 text-slate-500 transition-all hover:border-primary/30 hover:text-primary dark:border-white/10 dark:bg-white/5"
            >
              {"<"}
            </button>
            <div className="text-sm font-black capitalize text-slate-900 dark:text-slate-100">
              {new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(viewDate)}
            </div>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => moveMonth(1)}
              className="h-9 w-9 rounded-xl border border-black/5 bg-slate-50 text-slate-500 transition-all hover:border-primary/30 hover:text-primary dark:border-white/10 dark:bg-white/5"
            >
              {">"}
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
            {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((day) => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((date) => {
              const isoValue = formatIsoDate(date);
              const isSelected = isoValue === selectedIso;
              const isMuted = date.getMonth() !== currentMonth;

              return (
                <button
                  key={isoValue}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectDate(date)}
                  className={cn(
                    "h-9 rounded-xl text-xs font-black transition-all",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "hover:bg-primary/10 hover:text-primary",
                    isMuted ? "text-slate-300 dark:text-slate-700" : "text-slate-700 dark:text-slate-300",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3 dark:border-white/10">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setDisplayValue("");
                onValueChange("");
                setIsOpen(false);
              }}
              className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-500"
            >
              Xoa
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectDate(new Date())}
              className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10"
            >
              Hom nay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { DateTextInput, displayToIsoDate, isoToDisplayDate };
