'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiTrash2, FiPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { mealsAPI } from '@/lib/api-client';

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
  
  const [newMealName, setNewMealName] = useState('');
  const [newMealCategory, setNewMealCategory] = useState('MAIN_COURSE');
  const [adding, setAdding] = useState(false);
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

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pb-20 sm:pb-6">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-500 to-rose-500" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 sm:p-8 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-800">
              Khẩu vị của <span className="text-orange-600">{member.name}</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
              Thêm các món ăn yêu thích để AI gợi ý chuẩn xác hơn
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 sm:p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          
          {/* Add Form */}
          <form onSubmit={handleAdd} className="bg-slate-50 p-6 rounded-3xl mb-10 border border-slate-200/60">
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">Thêm món mới</h4>
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                placeholder="Tên món ăn (vd: Thịt kho tàu)"
                value={newMealName}
                onChange={(e) => setNewMealName(e.target.value)}
                className="input-field flex-1 text-sm"
              />
              <select
                value={newMealCategory}
                onChange={(e) => setNewMealCategory(e.target.value)}
                className="input-field sm:w-48 text-sm appearance-none"
              >
                <option value="MAIN_COURSE">🍗 Món chính</option>
                <option value="VEGETABLE">🥦 Rau xanh</option>
                <option value="SOUP">🥣 Canh</option>
              </select>
              <button
                type="submit"
                disabled={adding || !newMealName.trim()}
                className="btn-primary py-3 px-6 text-sm whitespace-nowrap bg-orange-500 hover:bg-orange-600 border-orange-500 hover:border-orange-600 disabled:bg-slate-100 disabled:border-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {adding ? (
                  <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <FiPlus />
                    Thêm món
                  </>
                )}
              </button>
            </div>
          </form>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              
              {/* MAIN COURSE */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-rose-500 font-black uppercase tracking-widest text-xs border-b border-slate-100 pb-2">
                  <span className="text-base">🍗</span> Món chính ({grouped.MAIN_COURSE.length})
                </div>
                {grouped.MAIN_COURSE.length === 0 && (
                  <div className="text-xs text-slate-400 italic">Chưa có món chính nào.</div>
                )}
                <div className="space-y-2">
                  {grouped.MAIN_COURSE.map((pref) => (
                    <div key={pref.mealId} className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-2xl group hover:border-orange-200 hover:shadow-md transition-all">
                      <span className="text-sm font-bold text-slate-700">{pref.meal.name}</span>
                      <button onClick={() => handleRemove(pref.mealId, pref.meal.name)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* VEGETABLE */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-500 font-black uppercase tracking-widest text-xs border-b border-slate-100 pb-2">
                  <span className="text-base">🥦</span> Rau xanh ({grouped.VEGETABLE.length})
                </div>
                {grouped.VEGETABLE.length === 0 && (
                  <div className="text-xs text-slate-400 italic">Chưa có rau xanh nào.</div>
                )}
                <div className="space-y-2">
                  {grouped.VEGETABLE.map((pref) => (
                    <div key={pref.mealId} className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-2xl group hover:border-emerald-200 hover:shadow-md transition-all">
                      <span className="text-sm font-bold text-slate-700">{pref.meal.name}</span>
                      <button onClick={() => handleRemove(pref.mealId, pref.meal.name)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* SOUP */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-amber-500 font-black uppercase tracking-widest text-xs border-b border-slate-100 pb-2">
                  <span className="text-base">🥣</span> Canh ({grouped.SOUP.length})
                </div>
                {grouped.SOUP.length === 0 && (
                  <div className="text-xs text-slate-400 italic">Chưa có món canh nào.</div>
                )}
                <div className="space-y-2">
                  {grouped.SOUP.map((pref) => (
                    <div key={pref.mealId} className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-2xl group hover:border-amber-200 hover:shadow-md transition-all">
                      <span className="text-sm font-bold text-slate-700">{pref.meal.name}</span>
                      <button onClick={() => handleRemove(pref.mealId, pref.meal.name)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
