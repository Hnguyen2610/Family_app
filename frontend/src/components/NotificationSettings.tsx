'use client';

import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { FiArrowLeft } from 'react-icons/fi';
import { useState, useEffect } from 'react';
import { usersAPI, notificationsAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { TimePicker } from '@/components/ui/time-picker';
import { getDateLocale } from '@/utils/date';

interface NotificationSettingsProps {
  readonly onBack: () => void;
}

export default function NotificationSettings({ onBack }: NotificationSettingsProps) {
  const { user, refreshUser } = useAuth();
  const { t, language } = useTranslation();
  
  // Default settings
  const defaultSettings = {
    BIRTHDAY: true,
    ANNIVERSARY: true,
    HOLIDAY: true,
    APPOINTMENT: true,
    TASK: true,
    GENERAL: true,
    proactiveAssistant: true,
    proactiveAssistantChannels: {
      webpush: true,
      telegram: true,
    },
    proactiveAssistantTypes: {
      eventChecklist: true,
      weather: true,
      finance: true,
      medicineSchool: true,
      familyNotes: true,
    },
    proactiveAssistantTime: '07:30',
  };

  const [settings, setSettings] = useState<any>(user?.notificationSettings || defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [deliveryLogs, setDeliveryLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState({
    fromName: settings.dailyBriefingSignature?.fromName || '',
    toName: settings.dailyBriefingSignature?.toName || '',
  });

  useEffect(() => {
    if (user?.id) {
      notificationsAPI.getDeliveryLogs({ userId: user.id, limit: 20 })
        .then(res => setDeliveryLogs(res.data || []))
        .catch(() => {});
    }
  }, [user?.id]);

  const toggleSetting = async (key: string) => {
    const oldSettings = { ...settings };
    const newSettings = { ...settings, [key]: !(settings[key] ?? true) };
    setSettings(newSettings);
    
    try {
      setIsSaving(true);
      await usersAPI.update(user!.id, { notificationSettings: newSettings });
      await refreshUser();
      toast.success(t('common.success'));
    } catch (error) {
      toast.error(t('common.error'));
      setSettings(oldSettings);
      console.error('NotificationSettings: Update failed', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProactiveChannel = async (channel: 'webpush' | 'telegram') => {
    const oldSettings = { ...settings };
    const currentChannels = settings.proactiveAssistantChannels || {};
    const newSettings = {
      ...settings,
      proactiveAssistantChannels: {
        ...currentChannels,
        [channel]: !(currentChannels[channel] ?? true),
      },
    };
    setSettings(newSettings);

    try {
      setIsSaving(true);
      await usersAPI.update(user!.id, { notificationSettings: newSettings });
      await refreshUser();
      toast.success(t('common.success'));
    } catch (error) {
      toast.error(t('common.error'));
      setSettings(oldSettings);
      console.error('NotificationSettings: Update failed', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProactiveType = async (type: 'eventChecklist' | 'weather' | 'finance' | 'medicineSchool' | 'familyNotes') => {
    const oldSettings = { ...settings };
    const currentTypes = settings.proactiveAssistantTypes || {};
    const newSettings = {
      ...settings,
      proactiveAssistantTypes: {
        ...currentTypes,
        [type]: !(currentTypes[type] ?? true),
      },
    };
    setSettings(newSettings);

    try {
      setIsSaving(true);
      await usersAPI.update(user!.id, { notificationSettings: newSettings });
      await refreshUser();
      toast.success(t('common.success'));
    } catch (error) {
      toast.error(t('common.error'));
      setSettings(oldSettings);
      console.error('NotificationSettings: Update failed', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateProactiveTime = async (time: string) => {
    const oldSettings = { ...settings };
    const newSettings = {
      ...settings,
      proactiveAssistantTime: time || '07:30',
    };
    setSettings(newSettings);

    try {
      setIsSaving(true);
      await usersAPI.update(user!.id, { notificationSettings: newSettings });
      await refreshUser();
      toast.success(t('common.success'));
    } catch (error) {
      toast.error(t('common.error'));
      setSettings(oldSettings);
      console.error('NotificationSettings: Update failed', error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveSignature = async () => {
    const oldSettings = { ...settings };
    const newSettings = {
      ...settings,
      dailyBriefingSignature: {
        fromName: signatureDraft.fromName.trim(),
        toName: signatureDraft.toName.trim(),
      },
    };
    setSettings(newSettings);

    try {
      setIsSaving(true);
      await usersAPI.update(user!.id, { notificationSettings: newSettings });
      await refreshUser();
      toast.success(t('common.success'));
    } catch (error) {
      toast.error(t('common.error'));
      setSettings(oldSettings);
      console.error('NotificationSettings: Update failed', error);
    } finally {
      setIsSaving(false);
    }
  };

  const notificationTypes = [
    { id: 'BIRTHDAY', label: t('settings.notificationsBirthday'), icon: '🎂' },
    { id: 'ANNIVERSARY', label: t('settings.notificationsAnniversary'), icon: '💍' },
    { id: 'HOLIDAY', label: t('settings.notificationsHoliday'), icon: '🎆' },
    { id: 'APPOINTMENT', label: t('settings.notificationsAppointment'), icon: '📅' },
    { id: 'TASK', label: t('settings.notificationsTask'), icon: '✅' },
    { id: 'GENERAL', label: t('settings.notificationsGeneral'), icon: '📢' },
    { id: 'proactiveAssistant', label: language === 'vi' ? 'Trợ lý chủ động' : 'Proactive Assistant', icon: '🤖' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm"
        >
          <FiArrowLeft />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('settings.notifications')}</h2>
          <p className="text-sm text-slate-500 font-medium">{t('settings.notificationsDesc')}</p>
        </div>
      </div>

      {/* Settings List */}
      <div className="space-y-3">
        {notificationTypes.map((type) => {
          const isActive = settings[type.id] ?? true;
          return (
            <button 
              key={type.id}
              type="button"
              onClick={() => !isSaving && toggleSetting(type.id)}
              className="w-full flex items-center justify-between p-5 rounded-2xl bg-card border border-border shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900 transition-all cursor-pointer group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  {type.icon}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{type.label}</p>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">{language === 'vi' ? 'Thông báo qua Email' : 'Email Notification'}</p>
                </div>
              </div>
              
              <div className={`w-12 h-6 rounded-full transition-all relative ${isActive ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isActive ? 'left-7' : 'left-1'}`} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold text-slate-400">
          {language === 'vi' ? 'Kênh nhận thông báo chủ động' : 'Proactive Assistant Channels'}
        </p>
        {[
          { id: 'webpush' as const, label: 'Web Push' },
          { id: 'telegram' as const, label: 'Telegram' },
        ].map((channel) => {
          const isActive = settings.proactiveAssistantChannels?.[channel.id] ?? true;
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => !isSaving && toggleProactiveChannel(channel.id)}
              className="w-full flex items-center justify-between p-5 rounded-2xl bg-card border border-border shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900 transition-all cursor-pointer group text-left"
            >
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{channel.label}</p>
                <p className="text-xs text-slate-400 font-bold mt-0.5">{language === 'vi' ? 'Kênh gửi' : 'Proactive assistant'}</p>
              </div>
              <div className={`w-12 h-6 rounded-full transition-all relative ${isActive ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isActive ? 'left-7' : 'left-1'}`} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold text-slate-400">
          {language === 'vi' ? 'Loại thông báo chủ động' : 'Proactive Assistant Types'}
        </p>
        {[
          { id: 'eventChecklist' as const, label: language === 'vi' ? 'Nhắc lịch sự kiện' : 'Event checklist' },
          { id: 'weather' as const, label: language === 'vi' ? 'Thời tiết' : 'Weather' },
          { id: 'finance' as const, label: language === 'vi' ? 'Chi tiêu' : 'Finance' },
          { id: 'medicineSchool' as const, label: language === 'vi' ? 'Thuốc / Học hành' : 'Medicine / School' },
          { id: 'familyNotes' as const, label: language === 'vi' ? 'Sổ tay gia đình' : 'Family notes' },
        ].map((type) => {
          const isActive = settings.proactiveAssistantTypes?.[type.id] ?? true;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => !isSaving && toggleProactiveType(type.id)}
              className="w-full flex items-center justify-between p-5 rounded-2xl bg-card border border-border shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900 transition-all cursor-pointer group text-left"
            >
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{type.label}</p>
                <p className="text-xs text-slate-400 font-bold mt-0.5">{language === 'vi' ? 'Tin tóm tắt hàng ngày' : 'Daily briefing'}</p>
              </div>
              <div className={`w-12 h-6 rounded-full transition-all relative ${isActive ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isActive ? 'left-7' : 'left-1'}`} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-5 rounded-2xl bg-card border border-border shadow-sm">
        <TimePicker
          value={settings.proactiveAssistantTime || '07:30'}
          onChange={updateProactiveTime}
          label={language === 'vi' ? 'Giờ nhận tin chủ động' : 'Proactive Assistant Time'}
          language={language}
          disabled={isSaving}
        />
      </div>

      <div className="p-5 rounded-2xl bg-card border border-border shadow-sm space-y-3">
        <div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {language === 'vi' ? 'Chữ ký cuối bản tin hàng ngày' : 'Daily briefing signature'}
          </p>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {language === 'vi' ? 'Chỉ hiện trên Telegram' : 'Shown on Telegram only'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={signatureDraft.fromName}
            onChange={(e) => setSignatureDraft((prev) => ({ ...prev, fromName: e.target.value }))}
            onBlur={() => !isSaving && saveSignature()}
            placeholder="Nguyên"
            disabled={isSaving}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
          />
          <input
            type="text"
            value={signatureDraft.toName}
            onChange={(e) => setSignatureDraft((prev) => ({ ...prev, toName: e.target.value }))}
            onBlur={() => !isSaving && saveSignature()}
            placeholder={user?.name || (language === 'vi' ? 'Tên bạn' : 'Your name')}
            disabled={isSaving}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
          />
        </div>
        <p className="text-xs text-slate-400 font-medium">
          {(signatureDraft.fromName.trim() || 'Nguyên')} {language === 'vi' ? 'yêu' : 'loves'} {(signatureDraft.toName.trim() || user?.name || '...')}
        </p>
      </div>

      {/* Delivery Log Section */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLogs(v => !v)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all"
        >
          <div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              📋 {language === 'vi' ? 'Lịch sử giao thông báo' : 'Delivery History'}
            </p>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              {deliveryLogs.length} {language === 'vi' ? 'bản ghi gần nhất' : 'recent records'}
            </p>
          </div>
          <span className="text-xs font-bold text-slate-400">{showLogs ? '▲' : '▼'}</span>
        </button>

        {showLogs && (
          <div className="border-t border-border max-h-72 overflow-y-auto">
            {deliveryLogs.length === 0 ? (
              <p className="text-xs text-slate-400 p-5 text-center font-bold italic">
                {language === 'vi' ? 'Chưa có lịch sử giao thông báo.' : 'No delivery records yet.'}
              </p>
            ) : (
              deliveryLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-4 border-b border-border last:border-0 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{log.title}</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      {log.channel?.toUpperCase()} · {new Date(log.createdAt).toLocaleTimeString(getDateLocale(language), { hour: '2-digit', minute: '2-digit' })} {new Date(log.createdAt).toLocaleDateString(getDateLocale(language))}
                    </p>
                    {log.errorMessage && (
                      <p className="text-[10px] text-rose-400 font-bold mt-0.5 truncate">{log.errorMessage}</p>
                    )}
                  </div>
                  <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                    log.status === 'SENT' ? 'bg-emerald-500/10 text-emerald-600' :
                    log.status === 'FAILED' ? 'bg-rose-500/10 text-rose-500' :
                    'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  }`}>
                    {log.status === 'SENT' ? (language === 'vi' ? 'Đã gửi' : 'Sent') :
                     log.status === 'FAILED' ? (language === 'vi' ? 'Lỗi' : 'Failed') :
                     (language === 'vi' ? 'Bỏ qua' : 'Skipped')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Note Section */}
      <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium leading-relaxed">
          {t('settings.notificationsNote')}
        </p>
      </div>
    </div>
  );
}
