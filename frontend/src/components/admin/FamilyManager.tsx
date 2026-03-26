import React, { useState, useEffect } from 'react';
import { familiesAPI, usersAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface FamilyManagerProps {
  onTabChange?: (tab: 'families' | 'users') => void;
}

export default function FamilyManager({ onTabChange }: FamilyManagerProps) {
  const [families, setFamilies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
  const [familyMembers, setFamilyMembers] = useState<Record<string, any[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);

  useEffect(() => {
    fetchFamilies();
  }, []);

  const fetchFamilies = async () => {
    try {
      const response = await familiesAPI.getAll();
      setFamilies(response.data);
    } catch (error) {
      console.error('Failed to fetch families', error);
      toast.error('Không thể tải danh sách gia đình');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMembers = async (familyId: string) => {
    if (familyMembers[familyId]) return;
    setLoadingMembers(familyId);
    try {
      const response = await usersAPI.getAll(familyId);
      setFamilyMembers(prev => ({ ...prev, [familyId]: response.data || response }));
    } catch (error) {
      toast.error('Không thể tải thành viên');
    } finally {
      setLoadingMembers(null);
    }
  };

  const toggleExpand = (familyId: string) => {
    if (expandedFamilyId === familyId) {
      setExpandedFamilyId(null);
    } else {
      setExpandedFamilyId(familyId);
      fetchMembers(familyId);
    }
  };

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFamilyName.trim()) return;

    setIsCreating(true);
    try {
      await familiesAPI.create(newFamilyName);
      toast.success('Đã tạo gia đình mới');
      setNewFamilyName('');
      fetchFamilies();
    } catch (error) {
      console.error('Failed to create family', error);
      toast.error('Không thể tạo gia đình');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateName = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await familiesAPI.update(id, editingName);
      toast.success('Đã cập nhật tên gia đình');
      setEditingFamilyId(null);
      fetchFamilies();
    } catch (error) {
      toast.error('Không thể cập nhật tên');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa gia đình này? Một khi đã xóa, toàn bộ dữ liệu liên quan sẽ mất.')) return;
    
    try {
      await familiesAPI.delete(id);
      toast.success('Đã xóa gia đình');
      fetchFamilies();
    } catch (error) {
      toast.error('Không thể xóa gia đình');
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <div className="bg-white/50 p-6 rounded-2xl border border-slate-100 shadow-sm">
        <h3 className="text-lg font-black mb-4 uppercase tracking-wider text-slate-700">Tạo gia đình mới</h3>
        <form onSubmit={handleCreateFamily} className="flex gap-3">
          <input
            type="text"
            value={newFamilyName}
            onChange={(e) => setNewFamilyName(e.target.value)}
            placeholder="Tên gia đình (VD: Gia đình Nguyễn)"
            className="flex-1 px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all font-bold text-slate-800 shadow-inner"
          />
          <button
            type="submit"
            disabled={isCreating}
            className="bg-red-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-100 active:scale-95"
          >
            {isCreating ? 'Đang tạo...' : 'Tạo'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-4">
        <h3 className="text-lg font-black uppercase tracking-wider text-slate-700">Danh sách gia đình ({families.length})</h3>
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {families.map((family) => (
              <div key={family.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
                <div className="p-6 flex items-center justify-between group">
                  <div className="flex-1">
                    {editingFamilyId === family.id ? (
                      <div className="flex items-center gap-3">
                        <input
                          autoFocus
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 max-w-md px-4 py-2 rounded-xl border-2 border-red-500 focus:outline-none font-black text-xl text-slate-800"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateName(family.id);
                            if (e.key === 'Escape') setEditingFamilyId(null);
                          }}
                        />
                        <button 
                          onClick={() => handleUpdateName(family.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-xl font-black text-sm active:scale-95 transition-all"
                        >
                          Lưu
                        </button>
                        <button 
                          onClick={() => setEditingFamilyId(null)}
                          className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl font-black text-sm active:scale-95 transition-all"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <h4 className="text-xl font-black text-slate-900">{family.name}</h4>
                          <button
                            onClick={() => {
                              setEditingFamilyId(family.id);
                              setEditingName(family.name);
                            }}
                            className="p-2 text-slate-300 hover:text-red-600 transition-all active:scale-90"
                            title="Đổi tên"
                          >
                            ✏️
                          </button>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                           <p className="text-[10px] text-slate-400 font-mono tracking-tight bg-slate-50 px-2 py-0.5 rounded">ID: {family.id}</p>
                           <button 
                              onClick={() => toggleExpand(family.id)}
                              className="text-xs font-black text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-widest"
                           >
                              👥 {family._count?.users || 0} thành viên
                           </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                        onClick={() => toggleExpand(family.id)}
                        className={`p-3 rounded-2xl transition-all active:scale-90 ${expandedFamilyId === family.id ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400 hover:text-indigo-600'}`}
                        title="Xem thành viên"
                      >
                       <span className={`inline-block transition-transform duration-300 ${expandedFamilyId === family.id ? 'rotate-180' : ''}`}>▼</span>
                    </button>
                    <button
                      onClick={() => handleDelete(family.id)}
                      className="p-3 bg-slate-50 text-slate-300 hover:bg-red-50 hover:text-red-600 rounded-2xl transition-all active:scale-90"
                      title="Xóa gia đình"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {expandedFamilyId === family.id && (
                    <div className="px-6 pb-6 pt-2 bg-slate-50/50 border-t border-slate-50 animate-in slide-in-from-top-4 duration-300">
                        <div className="flex justify-between items-center mb-4">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Danh sách thành viên</h5>
                            <button 
                                onClick={() => onTabChange?.('users')} // In case we want to jump to user manager
                                className="text-[10px] font-black uppercase tracking-widest text-red-600 hover:underline"
                            >
                                Quản lý người dùng →
                            </button>
                        </div>
                        
                        {loadingMembers === family.id ? (
                            <div className="flex justify-center py-4">
                                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {familyMembers[family.id]?.length === 0 ? (
                                    <p className="text-xs italic text-slate-400 col-span-full py-4 text-center">Chưa có thành viên nào.</p>
                                ) : (
                                    familyMembers[family.id]?.map((u: any) => (
                                        <div key={u.id} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200/50 shadow-sm">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm">👤</div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-slate-800 truncate">{u.name}</p>
                                                <p className="text-[9px] font-bold text-slate-400 truncate uppercase tracking-tighter">{u.email}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
