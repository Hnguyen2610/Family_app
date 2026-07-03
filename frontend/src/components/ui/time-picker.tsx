import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface TimePickerProps {
  /** Time in 24-hour "HH:MM" format, e.g. "07:30" or "14:00" */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  language?: string;
  disabled?: boolean;
}

function getHour12Value(time: string) {
  const hour = parseInt(time.split(':')[0] ?? '0', 10);
  const hour12 = hour % 12 || 12;
  return hour12.toString().padStart(2, '0');
}

function updateHour(time: string, value: string) {
  const [currentHour, minute] = time.split(':');
  const isPM = parseInt(currentHour ?? '0', 10) >= 12;
  let nextHour = parseInt(value, 10);
  if (isPM && nextHour < 12) nextHour += 12;
  if (!isPM && nextHour === 12) nextHour = 0;
  return `${nextHour.toString().padStart(2, '0')}:${minute ?? '00'}`;
}

function updatePeriod(time: string, value: string) {
  const [hour, minute] = time.split(':');
  let nextHour = parseInt(hour ?? '0', 10);
  if (value === 'PM' && nextHour < 12) nextHour += 12;
  if (value === 'AM' && nextHour >= 12) nextHour -= 12;
  return `${nextHour.toString().padStart(2, '00')}:${minute ?? '00'}`;
}

export function TimePicker({
  value,
  onChange,
  label,
  language = 'vi',
  disabled = false,
}: TimePickerProps) {
  const safeParts = value?.includes(':') ? value : '07:30';
  const [rawHour, rawMinute] = safeParts.split(':');
  const currentMinute = rawMinute ?? '00';
  const period = parseInt(rawHour ?? '0', 10) >= 12 ? 'PM' : 'AM';

  // Normalize minute to nearest 15 for display
  const normalizedMinute = ['00', '15', '30', '45'].includes(currentMinute)
    ? currentMinute
    : '00';

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
          {label}
        </Label>
      )}
      <div className="flex gap-3">
        {/* Hour */}
        <div className="flex-1">
          <Select
            disabled={disabled}
            value={getHour12Value(safeParts)}
            onValueChange={(hour) => onChange(updateHour(safeParts, hour ?? ''))}
          >
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) =>
                (i + 1).toString().padStart(2, '0'),
              ).map((hour) => (
                <SelectItem key={hour} value={hour}>
                  {hour}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Minute */}
        <div className="flex-1">
          <Select
            disabled={disabled}
            value={normalizedMinute}
            onValueChange={(minute) =>
              onChange(`${safeParts.split(':')[0]}:${minute}`)
            }
          >
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['00', '15', '30', '45'].map((minute) => (
                <SelectItem key={minute} value={minute}>
                  {minute}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* AM / PM */}
        <div className="w-[80px]">
          <Select
            disabled={disabled}
            value={period}
            onValueChange={(p) => onChange(updatePeriod(safeParts, p ?? 'AM'))}
          >
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AM">
                {language === 'vi' ? 'Sáng' : 'AM'}
              </SelectItem>
              <SelectItem value="PM">
                {language === 'vi' ? 'Chiều' : 'PM'}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
