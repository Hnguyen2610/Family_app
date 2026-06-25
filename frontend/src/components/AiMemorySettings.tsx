'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { 
  FiArrowLeft, FiTrash2, FiPlus, FiBookOpen, 
  FiHeart, FiAlertTriangle, FiFileText, 
  FiX
} from 'react-icons/fi';
import { usersAPI, mealsAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { parseMemoryProfile, AiUserMemoryProfile } from '@/utils/ai-memory-profile';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AiMemorySettings({ onBack }: { readonly onBack: () => void }) {
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<AiUserMemoryProfile>({});
  const [mealPrefs, setMealPrefs] = useState<any[]>([]);
  const [newItems, setNewItems] = useState<{ [key: string]: string }>({
    foodLikes: '',
    foodDislikes: '',
    healthRestrictions: '',
    familyNotes: ''
  });

  useEffect(() => {
    if (user?.notificationSettings) {
      setProfile(parseMemoryProfile(user.notificationSettings));
    }
    if (user?.id) {
       mealsAPI.getUserPreferences(user.id).then(res => {
          setMealPrefs(res.data || []);
       }).catch(console.error);
    }
  }, [user]);

  const saveProfile = async (updatedProfile: AiUserMemoryProfile) => {
    if (!user?.id) return;
    try {
      const currentSettings = (user.notificationSettings || {}) as any;
      await usersAPI.update(user.id, {
        notificationSettings: {
          ...currentSettings,
          aiMemory: {
            ...updatedProfile,
            lastUpdatedAt: new Date().toISOString()
          }
        }
      });
      await refreshUser();
      toast.success(t('settings.memory.updateSuccess'));
    } catch (error) {
      console.error('Failed to update AI memory:', error);
      toast.error(t('settings.memory.updateError'));
    } finally {
    }
  };

  const removeItem = (type: keyof AiUserMemoryProfile, index: number) => {
    const list = [...(profile[type] as string[])];
    list.splice(index, 1);
    const updated = { ...profile, [type]: list };
    setProfile(updated);
    saveProfile(updated);
  };

  const addItem = (type: keyof AiUserMemoryProfile) => {
    const val = newItems[type as string]?.trim();
    if (!val) return;
    
    const list = [...(profile[type] as string[] || [])];
    if (list.includes(val)) {
        toast.error(t('settings.memory.exists'));
        return;
    }
    
    const updated = { ...profile, [type]: [...list, val] };
    setProfile(updated);
    setNewItems(prev => ({ ...prev, [type as string]: '' }));
    saveProfile(updated);
  };

  const MemorySection = ({ 
    title, 
    type, 
    icon, 
    placeholder,
    extraItems = []
  }: { 
    title: string; 
    type: keyof AiUserMemoryProfile; 
    icon: React.ReactNode;
    placeholder: string;
    extraItems?: string[];
  }) => {
    const items = (profile[type] as string[]) || [];
    
    return (
      <div className="glass rounded-2xl p-6 border border-black/5 dark:border-white/5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            {icon}
          </div>
          <h3 className="font-black text-sm uppercase tracking-widest text-slate-800 dark:text-slate-200">{title}</h3>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <div 
              key={i} 
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold border border-black/5 dark:border-white/10 group animate-in zoom-in-95 duration-200"
            >
              <span>{item}</span>
              <button 
                onClick={() => removeItem(type, i)}
                className="text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <FiTrash2 size={12} />
              </button>
            </div>
          ))}
          
          {extraItems.map((item, i) => (
            <div 
              key={`extra-${i}`} 
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-black uppercase tracking-tighter border border-indigo-500/20 opacity-80"
              title={t('settings.memory.fromMeals')}
            >
              <span>{item}</span>
            </div>
          ))}

          {items.length === 0 && extraItems.length === 0 && (
            <p className="text-[10px] text-slate-400 italic">
              {t('settings.memory.noInfo')}
            </p>
          )}
        </div>


        <div className="flex gap-2 pt-2">
          <Input
            type="text"
            value={newItems[type as string]}
            onChange={(e) => setNewItems(prev => ({ ...prev, [type as string]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && addItem(type)}
            placeholder={placeholder}
            className="flex-1 h-10 text-xs"
          />
          <Button
            size="icon"
            onClick={() => addItem(type)}
            className="w-10 h-10 shrink-0"
          >
            <FiPlus />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex items-center gap-2 h-10 px-4"
        >
          <FiArrowLeft /> {t('settings.memory.back')}
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 text-2xl border border-indigo-500/20 shadow-xl shadow-indigo-500/10">
            <FiBookOpen />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tighter uppercase italic">{t('settings.memory.title')}</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-60">
              {t('settings.memory.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 glass rounded-3xl border border-indigo-500/20 bg-indigo-500/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 text-indigo-500 rotate-12">
            <FiBookOpen size={100} />
        </div>
        <p className="text-[11px] text-indigo-800 dark:text-indigo-300 font-bold leading-relaxed relative z-10">
          {t('settings.memory.desc')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MemorySection 
          title={t('settings.memory.foodLikes')}
          type="foodLikes"
          icon={<FiHeart />}
          placeholder={t('settings.memory.foodLikesPlaceholder')}
          extraItems={mealPrefs.map(p => p.meal.name)}
        />

        <MemorySection 
          title={t('settings.memory.foodDislikes')}
          type="foodDislikes"
          icon={<FiX size={20} />}
          placeholder={t('settings.memory.foodDislikesPlaceholder')}
        />
        <MemorySection 
          title={t('settings.memory.healthRestrictions')}
          type="healthRestrictions"
          icon={<FiAlertTriangle />}
          placeholder={t('settings.memory.healthRestrictionsPlaceholder')}
        />
        <MemorySection 
          title={t('settings.memory.familyNotes')}
          type="familyNotes"
          icon={<FiFileText />}
          placeholder={t('settings.memory.familyNotesPlaceholder')}
        />
      </div>

      <div className="pt-6 flex justify-between items-center text-[10px] text-slate-400 font-black uppercase tracking-widest border-t border-black/5 dark:border-white/5">
        <span>{t('settings.memory.secure')}</span>
        {profile.enabled !== false && (
          <div className="flex items-center gap-2 text-indigo-500">
             <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
             {t('settings.memory.active')}
          </div>
        )}
      </div>
    </div>
  );
}
