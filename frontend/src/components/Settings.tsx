'use client';

import { useAuth } from '@/hooks/useAuth';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTranslation } from '@/lib/i18n';
import {
  FiUser, FiBell, FiMoon, FiGlobe, FiLogOut, FiShield,
  FiChevronRight, FiSun, FiMonitor, FiClock, FiCheck, FiX, FiEdit2, FiSmartphone, FiBookOpen, FiFileText
} from 'react-icons/fi';

import { useState, useEffect } from 'react';
import { usersAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { useWebPush } from '@/hooks/useWebPush';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import IosPwaGuide from './IosPwaGuide';

interface SettingItemProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly labelClassName?: string;
  readonly value: string;
  readonly onClick?: () => void;
}

const SettingItem = ({ icon, label, labelClassName, value, onClick }: SettingItemProps) => {
  return (
    <button
      onClick={onClick}
      className="group flex items-center justify-start w-full text-left gap-5 p-5 rounded-xl bg-slate-100/40 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 hover:border-primary/30 transition-all cursor-pointer outline-none overflow-hidden relative shadow-sm"
    >
      <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 border border-black/5 dark:border-white/5 text-primary flex items-center justify-center text-xl group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500">
        {icon}
      </div>
      <div className="flex-1">
        <p className={`text-sm font-black uppercase tracking-widest leading-none mb-1 ${labelClassName || 'text-slate-900 dark:text-slate-100'}`}>{label}</p>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter opacity-60">{value}</p>
      </div>

      <FiChevronRight className="text-slate-400 dark:text-slate-700 group-hover:text-primary group-hover:translate-x-1 transition-all" />
      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </button>
  );
};

interface ProfileSectionProps {
  readonly user: any;
  readonly refreshUser: () => Promise<void>;
  readonly language: string;
}

const ProfileSection = ({ user, refreshUser, language }: ProfileSectionProps) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.name) setNewName(user.name);
  }, [user]);

  const handleSave = async () => {
    if (!user?.id || !newName.trim()) return;
    setIsSaving(true);
    try {
      await usersAPI.update(user.id, { name: newName });
      await refreshUser();
      setIsEditing(false);
      toast.success(t('settings.loginSuccess'));
    } catch (error) {
      console.error('Failed to update name:', error);
      toast.error(t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-4 animate-in slide-in-from-left-2 duration-300">
        <Input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full md:w-64"
          placeholder={language === 'vi' ? 'Nhập tên của bạn...' : 'Enter your name...'}
          autoFocus
        />
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 h-10 text-[10px] flex items-center gap-2"
          >
            <FiCheck /> {t('settings.commit')}
          </Button>
          <Button
            variant="outline"
            onClick={() => { setIsEditing(false); setNewName(user?.name || ''); }}
            disabled={isSaving}
            className="px-5 py-2 h-10 text-[10px] uppercase tracking-widest flex items-center gap-2"
          >
            <FiX /> {t('settings.abort')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-slate-100 tracking-tighter italic capitalize">
          {user?.name || 'Anonymous User'}
        </h2>
        <button
          onClick={() => setIsEditing(true)}
          className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-primary/20 rounded-lg text-slate-500 hover:text-primary transition-all border border-black/5 dark:border-white/5"
        >
          <FiEdit2 size={16} />
        </button>
      </div>
      <p className="text-primary font-black text-[10px] uppercase tracking-[0.2em] mt-2 opacity-60">
        {user?.email} // {user?.globalRole === 'SUPER_ADMIN' ? (language === 'vi' ? 'Quyền tối cao' : 'Root Access') : (language === 'vi' ? 'Thành viên' : 'Node User')}
      </p>
    </>
  );
};

export default function Settings({ onNavigate }: { readonly onNavigate: (tab: any) => void }) {
  const { user, refreshUser, logout } = useAuth();
  const { t, language } = useTranslation();
  const { theme, setTheme, setLanguage } = useSettingsStore();
  const { isSupported, isSubscribed, isProcessing, isIOS, isStandalone, subscribe, unsubscribe } = useWebPush();
  const [showIosGuide, setShowIosGuide] = useState(false);

  const getNotificationValue = () => {
    const hasSettings = user?.notificationSettings && Object.keys(user.notificationSettings as object).length > 0;
    if (hasSettings) {
      return language === 'vi' ? 'Đã tùy chỉnh' : 'Customized';
    }
    return t('settings.notificationsOn');
  };

  const currentThemeIcon = () => {
    if (theme === 'dark') return <FiMoon />;
    if (theme === 'light') return <FiSun />;
    if (theme === 'system') return <FiMonitor />;
    return <FiClock />;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-20">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-10 p-10 md:p-12 glass rounded-2xl border border-black/10 dark:border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-10 opacity-5">
           <FiUser size={160} />
        </div>
        <div className="w-24 h-24 md:w-40 md:h-40 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-black/5 dark:border-white/5 flex items-center justify-center text-6xl text-primary shadow-xl relative z-10">
          <FiUser />
        </div>
        <div className="relative z-10 flex-1 text-center md:text-left">
          <ProfileSection user={user} refreshUser={refreshUser} language={language} />
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
             {language === 'vi' ? 'Truy cập hệ thống' : 'System Access'}
          </h3>
          <SettingItem icon={<FiUser />} label={t('settings.profile')} value={language === 'vi' ? 'Tài khoản & thay mật khẩu' : 'Credential Overhaul'} />
          <SettingItem icon={<FiShield />} label={t('settings.security')} value={language === 'vi' ? 'Bảo mật giao thức' : 'Protocol Lockdown'} />
          <SettingItem
             icon={<FiBookOpen />}
             label="AI Memory"
             labelClassName="text-indigo-600 dark:text-indigo-400"
             value={language === 'vi' ? 'Trí nhớ cá nhân hóa' : 'Cognitive Profile'}
             onClick={() => onNavigate('ai-memory')}
           />
          <SettingItem
             icon={<FiFileText />}
             label={language === 'vi' ? 'Sổ tay gia đình' : 'Family Notes'}
             labelClassName="text-indigo-600 dark:text-indigo-400"
             value={language === 'vi' ? 'Dữ liệu cho RAG' : 'Long-form RAG knowledge'}
             onClick={() => onNavigate('notes')}
           />
        </div>

        <div className="space-y-6">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
             {language === 'vi' ? 'Liên lạc' : 'Communication'}
          </h3>
          <SettingItem
            icon={<FiBell />}
            label={t('settings.notifications')}
            value={getNotificationValue()}
            onClick={() => onNavigate('notifications')}
          />
          {(isSupported || isIOS) && (
            <SettingItem
              icon={<FiSmartphone />}
              label={language === 'vi' ? 'Đẩy điện thoại' : 'Neural Push'}
              value={
                isIOS && !isStandalone 
                  ? (language === 'vi' ? 'Yêu cầu cài đặt' : 'Installation Required')
                  : (isProcessing ? (language === 'vi' ? 'Đang đồng bộ...' : 'Syncing...') : (isSubscribed ? (language === 'vi' ? 'Đang hoạt động' : 'Active') : (language === 'vi' ? 'Chưa kết nối' : 'Bypass Mode')))
              }
              onClick={async () => {
                if (isProcessing) return;
                
                // Show iOS guide if on iOS but not standalone
                if (isIOS && !isStandalone) {
                  setShowIosGuide(true);
                  return;
                }

                if (!isSupported) {
                  toast.error(language === 'vi' ? 'Trình duyệt không hỗ trợ thông báo' : 'Browser lacks push capabilities');
                  return;
                }

                let success = false;
                if (isSubscribed) {
                  success = await unsubscribe();
                  if (success) toast.success(language === 'vi' ? 'Đã hủy kết nối' : 'Link severed');
                } else {
                  success = await subscribe();
                  if (success) toast.success(language === 'vi' ? 'Đã kết nối' : 'Connection established');
                }
              }}
            />
          )}
          <SettingItem
            icon={<span className="text-xl">✈️</span>}
            label="Telegram Bot"
            value={
              user?.telegramChatId 
                ? (language === 'vi' ? `Đã kết nối (${user.telegramUsername || '—'})` : `Linked (@${user.telegramUsername || '—'})`)
                : (language === 'vi' ? 'Nhấn để kết nối' : 'Tap to Connect')
            }
            onClick={() => {
              if (user?.id) {
                window.open(`https://t.me/NHN2610_bot?start=${user.id}`, '_blank');
              }
            }}
          />
        </div>
      </div>

      {showIosGuide && <IosPwaGuide onClose={() => setShowIosGuide(false)} />}

      {/* Appearance & Language Sections */}
      <div className="space-y-8">
        {/* Theme Section */}
        <div className="p-8 md:p-10 glass rounded-2xl border border-black/5 dark:border-white/5 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-black/5 dark:border-white/5 text-primary flex items-center justify-center text-3xl">
                {currentThemeIcon()}
              </div>
              <div>
                <p className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tighter uppercase">{t('settings.appearance')}</p>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">{language === 'vi' ? 'Ma trận ánh sáng' : 'Luminosity Matrix'}</p>
              </div>
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-950 border border-black/5 dark:border-white/5 p-1.5 rounded-xl self-start lg:self-center overflow-x-auto no-scrollbar max-w-full">
              {[
                { id: 'light', icon: <FiSun />, label: t('settings.appearanceLight') },
                { id: 'dark', icon: <FiMoon />, label: t('settings.appearanceDark') },
                { id: 'system', icon: <FiMonitor />, label: language === 'vi' ? 'Hệ thống' : 'Hybrid' },
                { id: 'scheduled', icon: <FiClock />, label: language === 'vi' ? 'Tự động' : 'Cycle' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTheme(item.id as any)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    theme === item.id
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Language Section */}
        <div className="p-8 md:p-10 glass rounded-2xl border border-black/5 dark:border-white/5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-black/5 dark:border-white/5 text-primary flex items-center justify-center text-3xl">
                <FiGlobe />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tighter uppercase">{t('settings.language')}</p>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">{language === 'vi' ? 'Lựa chọn ngôn ngữ' : 'Linguistic Overlay'}</p>
              </div>
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-950 border border-black/5 dark:border-white/5 p-1.5 rounded-xl self-start lg:self-center">
              {[
                { id: 'vi', label: 'Tiếng Việt' },
                { id: 'en', label: 'English' }
              ].map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setLanguage(lang.id as any)}
                  className={`flex items-center gap-2 px-8 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    language === lang.id
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Termination */}
      <div className="pt-10">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-3 py-6 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all font-black text-sm uppercase tracking-[0.3em] group"
        >
          <FiLogOut className="text-xl group-hover:scale-110 transition-transform" />
          {t('settings.logoutBtn')}
        </button>
        <p className="text-center mt-10 text-[9px] text-slate-400 dark:text-slate-700 font-black uppercase tracking-[0.3em]">
           {t('settings.version')} Family Hub
        </p>
      </div>
    </div>
  );
}
