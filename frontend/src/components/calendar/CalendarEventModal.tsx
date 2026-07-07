import { FiCheck, FiTrash2 } from 'react-icons/fi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DateTextInput } from '@/components/ui/date-text-input';
import { TimePicker } from '@/components/ui/time-picker';
import type { TranslationKey } from '@/lib/i18n';

export type CalendarEventFormData = {
  title: string;
  description: string;
  date: string;
  endDate: string;
  type: string;
  time: string;
  scope: string;
  isRecurring: boolean;
  recurring: string;
  useLunar: boolean;
};

type CalendarEventModalProps = {
  editingEvent: any;
  formData: CalendarEventFormData;
  isDeletable: boolean;
  isOpen: boolean;
  language: string;
  onDelete: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  setFormData: (data: CalendarEventFormData) => void;
  t: (key: TranslationKey) => string;
};

export function CalendarEventModal({
  editingEvent,
  formData,
  isDeletable,
  isOpen,
  language,
  onDelete,
  onOpenChange,
  onSave,
  setFormData,
  t,
}: CalendarEventModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="mb-2">
          <div className="inline-flex w-fit items-center gap-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            {t('nav.protocol')}
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {editingEvent ? t('calendar.editEvent') : t('calendar.addEvent')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <TextField
            label={t('calendar.eventTitle')}
            value={formData.title}
            onChange={(title) => setFormData({ ...formData, title })}
          />

          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500">
              {t('calendar.eventDesc')}
            </Label>
            <Textarea
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              placeholder="..."
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DateField
              label={language === 'vi' ? 'Từ ngày' : 'From date'}
              value={formData.date}
              onChange={(date) => setFormData({ ...formData, date, endDate: formData.endDate || date })}
            />
            <DateField
              label={language === 'vi' ? 'Đến ngày' : 'To date'}
              value={formData.endDate}
              onChange={(endDate) => setFormData({ ...formData, endDate })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label={t('calendar.eventType')}
              value={formData.type}
              onChange={(type) => setFormData({ ...formData, type })}
              options={[
                ['GENERAL', t('calendar.type.general')],
                ['HOLIDAY', t('calendar.type.holiday')],
                ['BIRTHDAY', t('calendar.type.birthday')],
                ['ANNIVERSARY', t('calendar.type.anniversary')],
                ['APPOINTMENT', t('calendar.type.appointment')],
                ['TASK', t('calendar.type.task')],
              ]}
            />

            <SelectField
              label={t('calendar.recurring')}
              value={formData.recurring}
              onChange={(recurring) => setFormData({ ...formData, recurring })}
              options={[
                ['NONE', t('calendar.recurring.none')],
                ['WEEKLY', t('calendar.recurring.weekly')],
                ['MONTHLY', t('calendar.recurring.monthly')],
                ['YEARLY', t('calendar.recurring.yearly')],
              ]}
            />
          </div>

          {(formData.recurring === 'MONTHLY' || formData.recurring === 'YEARLY') && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4 dark:border-primary/20">
              <input
                type="checkbox"
                id="useLunar"
                checked={formData.useLunar}
                onChange={(event) => setFormData({ ...formData, useLunar: event.target.checked })}
                className="h-4 w-4 rounded border-black/10 text-primary focus:ring-primary dark:border-white/10"
              />
              <label htmlFor="useLunar" className="cursor-pointer text-[11px] font-bold text-primary">
                {t('calendar.useLunar')}
              </label>
            </div>
          )}

          <TimePicker
            value={formData.time}
            onChange={(time) => setFormData({ ...formData, time })}
            label={t('calendar.eventTime')}
            language={language}
          />
          <ScopeToggle formData={formData} setFormData={setFormData} t={t} />

          <div className="flex gap-3 pt-4">
            {isDeletable && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => onDelete(editingEvent.id)}
                className="h-12 w-12 rounded-xl"
              >
                <FiTrash2 size={18} />
              </Button>
            )}
            <Button
              onClick={onSave}
              className="h-12 flex-1 gap-2 rounded-xl text-sm font-bold"
            >
              <FiCheck />
              {language === 'vi' ? 'Xác nhận thay đổi' : 'Commit Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TextField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-slate-500">
        {label}
      </Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder="..." />
    </div>
  );
}

function DateField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-slate-500">
        {label}
      </Label>
      <DateTextInput value={value} onValueChange={onChange} />
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-slate-500">
        {label}
      </Label>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as string)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ScopeToggle({ formData, setFormData, t }: Pick<CalendarEventModalProps, 'formData' | 'setFormData' | 't'>) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-slate-500">
        {t('calendar.eventScope')}
      </Label>
      <div className="flex rounded-xl border border-black/5 bg-slate-100 p-1 dark:border-white/5 dark:bg-slate-900">
        {['GLOBAL', 'FAMILY', 'PRIVATE'].map((scope) => (
          <button
            key={scope}
            onClick={() => setFormData({ ...formData, scope })}
            className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
              formData.scope === scope
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
            }`}
          >
            {scope}
          </button>
        ))}
      </div>
    </div>
  );
}
