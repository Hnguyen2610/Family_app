'use client';

import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { FiArrowLeft } from 'react-icons/fi';
import { useState } from 'react';
import { usersAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface NotificationSettingsProps {
  readonly onBack: () => void;
}

export default function NotificationSettings({ onBack }: NotificationSettingsProps) {
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation();
  
  // Default settings
  const defaultSettings = {
    BIRTHDAY: true,
    ANNIVERSARY: true,
    HOLIDAY: true,
    APPOINTMENT: true,
    TASK: true,
    GENERAL: true
  };

  const [settings, setSettings] = useState<any>(user?.notificationSettings || defaultSettings);
  const [isSaving, setIsSaving] = useState(false);

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

  const notificationTypes = [
    { id: 'BIRTHDAY', label: t('settings.notificationsBirthday'), icon: '🎂' },
    { id: 'ANNIVERSARY', label: t('settings.notificationsAnniversary'), icon: '💍' },
    { id: 'HOLIDAY', label: t('settings.notificationsHoliday'), icon: '🎆' },
    { id: 'APPOINTMENT', label: t('settings.notificationsAppointment'), icon: '📅' },
    { id: 'TASK', label: t('settings.notificationsTask'), icon: '✅' },
    { id: 'GENERAL', label: t('settings.notificationsGeneral'), icon: '📢' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
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
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">{t('settings.notifications')}</h2>
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
              className="w-full flex items-center justify-between p-5 rounded-[1.5rem] bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900 transition-all cursor-pointer group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  {type.icon}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-700 dark:text-slate-200">{type.label}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Email Notification</p>
                </div>
              </div>
              
              <div className={`w-12 h-6 rounded-full transition-all relative ${isActive ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isActive ? 'left-7' : 'left-1'}`} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Note Section */}
      <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-[1.5rem] border border-indigo-100 dark:border-indigo-800/30">
        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium leading-relaxed">
          {t('settings.notificationsNote')}
        </p>
      </div>
    </div>
  );
}
