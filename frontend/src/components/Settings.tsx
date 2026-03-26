'use client';

import { useAuth } from '@/hooks/useAuth';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTranslation } from '@/lib/i18n';
import { 
  FiUser, FiBell, FiMoon, FiGlobe, FiLogOut, FiShield, 
  FiChevronRight, FiSun, FiMonitor, FiClock, FiCheck, FiX, FiEdit2 
} from 'react-icons/fi';
import { useState, useEffect } from 'react';
import { usersAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface SettingItemProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
  readonly onClick?: () => void;
}

const SettingItem = ({ icon, label, value, onClick }: SettingItemProps) => {
  return (
    <button 
      onClick={onClick}
      className="group flex items-center justify-start w-full text-left gap-4 p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900 hover:bg-white dark:hover:bg-slate-900 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-black text-slate-700 dark:text-slate-200">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{value}</p>
      </div>
      <FiChevronRight className="text-slate-300 dark:text-slate-700 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-all" />
    </button>
  );
};

interface ProfileSectionProps {
  readonly user: any;
  readonly refreshUser: () => Promise<void>;
  readonly language: string;
}

const ProfileSection = ({ user, refreshUser, language }: ProfileSectionProps) => {
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
      toast.success(language === 'vi' ? 'Cập nhật tên thành công!' : 'Name updated successfully!');
    } catch (error) {
      console.error('Failed to update name:', error);
      toast.error(language === 'vi' ? 'Cập nhật tên thất bại' : 'Failed to update name');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-3 animate-in slide-in-from-left-2 duration-300">
        <input 
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="bg-white/20 border border-white/30 rounded-xl px-4 py-2 text-white font-black placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 w-full md:w-64 backdrop-blur-md"
          placeholder={language === 'vi' ? 'Nhập tên của bạn...' : 'Enter your name...'}
          autoFocus
        />
        <div className="flex gap-2">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 bg-white text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all flex items-center gap-1 shadow-lg shadow-indigo-900/20 disabled:opacity-50"
          >
            <FiCheck /> {language === 'vi' ? 'Lưu' : 'Save'}
          </button>
          <button 
            onClick={() => { setIsEditing(false); setNewName(user?.name || ''); }}
            disabled={isSaving}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
          >
            <FiX /> {language === 'vi' ? 'Hủy' : 'Cancel'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <h2 className="text-2xl md:text-3xl font-black">{user?.name}</h2>
        <button 
          onClick={() => setIsEditing(true)}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/70 hover:text-white transition-all active:scale-95"
          title={language === 'vi' ? 'Chỉnh sửa tên' : 'Edit Name'}
        >
          <FiEdit2 size={16} />
        </button>
      </div>
      <p className="text-indigo-100 font-medium opacity-80">{user?.email}</p>
      <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg text-[10px] font-black uppercase tracking-widest inline-block mt-3 border border-white/20">
        {user?.globalRole === 'SUPER_ADMIN' ? 'Quản trị viên hệ thống' : 'Thành viên gia đình'}
      </div>
    </>
  );
};

export default function Settings({ onNavigate }: { readonly onNavigate: (tab: any) => void }) {
  const { user, refreshUser, logout } = useAuth();
  const { t, language } = useTranslation();
  const { theme, setTheme, setLanguage } = useSettingsStore();

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
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Profile Header */}
      <div className="flex items-center gap-6 p-6 rounded-[2rem] bg-indigo-600 text-white shadow-xl shadow-indigo-100/50 dark:shadow-indigo-900/20 relative overflow-hidden group">
        <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700" />
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-[2rem] bg-white/20 backdrop-blur-md flex items-center justify-center text-4xl shadow-inner border border-white/20">
          👤
        </div>
        <div className="relative z-10 flex-1">
          <ProfileSection user={user} refreshUser={refreshUser} language={language} />
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
            {language === 'vi' ? 'Cá nhân' : 'Personal'}
          </h3>
          <SettingItem icon={<FiUser />} label={t('settings.profile')} value={t('settings.profileDesc')} />
          <SettingItem icon={<FiShield />} label={t('settings.security')} value={t('settings.securityDesc')} />
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
            {language === 'vi' ? 'Ứng dụng' : 'Application'}
          </h3>
          <SettingItem 
            icon={<FiBell />} 
            label={t('settings.notifications')} 
            value={getNotificationValue()}
            onClick={() => onNavigate('notifications')}
          />
        </div>
      </div>

      {/* Appearance & Language Sections */}
      <div className="space-y-4">
        {/* Theme Section */}
        <div className="p-6 rounded-[2.5rem] bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-indigo-500 flex items-center justify-center text-2xl shadow-sm">
                {currentThemeIcon()}
              </div>
              <div>
                <p className="text-base font-black text-slate-800 dark:text-slate-100">{t('settings.appearance')}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Thay đổi tông màu ứng dụng</p>
              </div>
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl self-start md:self-center">
              {[
                { id: 'light', icon: <FiSun />, label: t('settings.appearanceLight') },
                { id: 'dark', icon: <FiMoon />, label: t('settings.appearanceDark') },
                { id: 'system', icon: <FiMonitor />, label: t('settings.appearanceSystem') },
                { id: 'scheduled', icon: <FiClock />, label: t('settings.appearanceScheduled') }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTheme(item.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                    theme === item.id 
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-md' 
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {item.icon}
                  <span className="hidden xs:inline">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Language Section */}
        <div className="p-6 rounded-[2.5rem] bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-indigo-500 flex items-center justify-center text-2xl shadow-sm">
                <FiGlobe />
              </div>
              <div>
                <p className="text-base font-black text-slate-800 dark:text-slate-100">{t('settings.language')}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{t('settings.languageDesc')}</p>
              </div>
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl self-start md:self-center">
              {[
                { id: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
                { id: 'en', flag: '🇺🇸', label: 'English' }
              ].map((lang) => (
                <button 
                  key={lang.id}
                  onClick={() => setLanguage(lang.id as any)}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black transition-all ${
                    language === lang.id 
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-md' 
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <span>{lang.flag}</span> {lang.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="pt-4">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-3 p-5 rounded-[2rem] bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 hover:bg-rose-600 dark:hover:bg-rose-600 hover:text-white transition-all font-black text-base shadow-sm group"
        >
          <FiLogOut className="text-xl group-hover:scale-110 transition-transform" />
          {t('settings.logoutBtn')}
        </button>
        <p className="text-center mt-6 text-[10px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest">
          {t('settings.version')} Antigravity 🚀
        </p>
      </div>
    </div>
  );
}
