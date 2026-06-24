'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiTrash2, FiPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { mealsAPI } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n';
interface Member {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

interface MealPreferenceModalProps {
  member: Member;
  onClose: () => void;
}

export default function MealPreferenceModal({ member, onClose }: MealPreferenceModalProps) {
  const [preferences, setPreferences] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { t, language } = useTranslation();
  const [newMealName, setNewMealName] = useState('');
  const [newMealCategory, setNewMealCategory] = useState('MAIN_COURSE');
  const [adding, setAdding] = useState(false);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchPreferences();
  }, [member.id]);

  const fetchPreferences = async () => {
    setLoading(true);
    try {
      const response = await mealsAPI.getUserPreferences(member.id);
      setPreferences(response.data);
    } catch (error) {
      console.error('Failed to fetch preferences', error);
      toast.error('Không thể tải danh sách món ăn yêu thích');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMealName.trim()) {
      toast.error('Vui lòng nhập tên món ăn');
      return;
    }

    setAdding(true);
    try {
      await mealsAPI.addCustomPreference(member.id, newMealName.trim(), newMealCategory);
      toast.success('Đã thêm món ăn');
      setNewMealName('');
      fetchPreferences();
    } catch (error) {
      console.error('Failed to add preference', error);
      toast.error('Có lỗi xảy ra khi thêm món ăn');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (mealId: string, mealName: string) => {
    if (!confirm(`Xóa món ${mealName} khỏi danh sách yêu thích?`)) return;

    try {
      await mealsAPI.removePreference(member.id, mealId);
      toast.success('Đã xóa món ăn');
      setPreferences(preferences.filter((p) => p.mealId !== mealId));
    } catch (error) {
      console.error('Failed to remove preference', error);
      toast.error('Có lỗi xảy ra khi xóa món ăn');
    }
  };

  // Group preferences
  const grouped = {
    MAIN_COURSE: preferences.filter((p) => p.meal.category === 'MAIN_COURSE'),
    VEGETABLE: preferences.filter((p) => p.meal.category === 'VEGETABLE'),
    SOUP: preferences.filter((p) => p.meal.category === 'SOUP'),
  };

  const filteredPreferences = filterCategory === 'ALL'
    ? preferences
    : preferences.filter((p) => p.meal.category === filterCategory);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-5xl max-h-[85vh] flex flex-col glass rounded-2xl border border-black/5 dark:border-white/5 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary/20" />

        {/* Header */}
        <div className="flex items-center justify-between p-8 sm:p-10 border-b border-black/5 dark:border-white/5 shrink-0">
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-primary/10 text-primary rounded text-[8px] font-black uppercase tracking-[0.2em] mb-3">
               {language === 'vi' ? 'Cấu hình khẩu vị' : 'Palette Config'}
            </div>
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 italic tracking-tighter">
              Member <span className="text-primary not-italic">{member.name}</span>
            </h3>
            <p className="text-[10px] text-slate-500 mt-2 font-black uppercase tracking-widest leading-none">
              {language === 'vi' ? 'Khởi tạo hồ sơ hương vị cho động cơ tổng hợp AI.' : 'Initializing flavor profiles for AI synthesis engine.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 text-slate-500 hover:text-rose-500 transition-all bg-white/5 border border-white/5 rounded-lg"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 sm:p-10 no-scrollbar">

          {/* Add Form */}
          <form onSubmit={handleAdd} className="bg-slate-100/50 dark:bg-slate-900/60 p-8 rounded-xl mb-8 border border-black/5 dark:border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
               <FiPlus size={60} className="text-primary" />
            </div>
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">{language === 'vi' ? 'THÊM MÓN MỚI' : 'ADD NEW DISH'}</h4>
            <div className="flex flex-col gap-4">
              {/* Category Segmented Tabs */}
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'MAIN_COURSE', label: t('meal.category.MAIN_COURSE') },
                  { value: 'VEGETABLE', label: t('meal.category.VEGETABLE') },
                  { value: 'SOUP', label: t('meal.category.SOUP') },
                ].map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setNewMealCategory(cat.value)}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all border ${
                      newMealCategory === cat.value
                        ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-black/10 dark:border-white/10 hover:border-primary/40 hover:text-primary'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Name Input + Submit */}
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder={language === 'vi' ? 'Tên món ăn...' : 'Dish name...'}
                  value={newMealName}
                  onChange={(e) => setNewMealName(e.target.value)}
                  className="input-field flex-1"
                />
                <button
                  type="submit"
                  disabled={adding || !newMealName.trim()}
                  className="btn-primary flex items-center justify-center gap-3 py-3 sm:w-40 shrink-0"
                >
                  {adding ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><FiPlus /> {language === 'vi' ? 'Thêm' : 'Add'}</>
                  )}
                </button>
              </div>
            </div>
          </form>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{language === 'vi' ? 'Đang tải...' : 'Loading...'}</p>
            </div>
          ) : (
            <div className="pb-10">
              {/* Filter Tabs */}
              <div className="flex flex-wrap gap-2 mb-8">
                {[
                  { value: 'ALL', label: language === 'vi' ? 'Tất cả' : 'All', count: preferences.length },
                  { value: 'MAIN_COURSE', label: t('meal.category.MAIN_COURSE'), count: grouped.MAIN_COURSE.length },
                  { value: 'VEGETABLE', label: t('meal.category.VEGETABLE'), count: grouped.VEGETABLE.length },
                  { value: 'SOUP', label: t('meal.category.SOUP'), count: grouped.SOUP.length },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setFilterCategory(tab.value)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border ${
                      filterCategory === tab.value
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-white dark:bg-slate-800/60 text-slate-500 border-black/5 dark:border-white/5 hover:border-primary/20 hover:text-primary'
                    }`}
                  >
                    {tab.label}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${filterCategory === tab.value ? 'bg-primary/20 text-primary' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Meal List */}
              {filteredPreferences.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest italic">
                    {language === 'vi' ? 'Chưa có món ăn nào trong danh mục này.' : 'No dishes in this category yet.'}
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPreferences.map((pref) => {
                    const catLabel =
                      pref.meal.category === 'MAIN_COURSE' ? t('meal.category.MAIN_COURSE') :
                      pref.meal.category === 'VEGETABLE' ? t('meal.category.VEGETABLE') :
                      t('meal.category.SOUP');
                    return (
                      <div key={pref.mealId} className="flex items-center justify-between bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 p-4 rounded-xl group/item hover:border-primary/20 hover:shadow-sm transition-all">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800 dark:text-slate-200 italic truncate">{pref.meal.name}</p>
                          <p className="text-[9px] text-primary font-black uppercase tracking-widest mt-0.5">{catLabel}</p>
                        </div>
                        <button
                          onClick={() => handleRemove(pref.mealId, pref.meal.name)}
                          className="shrink-0 ml-3 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 opacity-100 md:opacity-0 group-hover/item:opacity-100"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
