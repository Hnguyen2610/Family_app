import React, { useState, useEffect } from 'react';
import { familiesAPI, usersAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FiEdit2, FiTrash2, FiPlus, FiChevronDown, FiUser } from 'react-icons/fi';
import { useAsync } from '@/hooks/useAsync';

interface FamilyManagerProps {
  onTabChange?: (tab: 'families' | 'users') => void;
}

export default function FamilyManager({ onTabChange }: FamilyManagerProps) {
  const { data: familiesData, isLoading, error, refetch: fetchFamilies } = useAsync<any[]>(
    () => familiesAPI.getAll().then((response) => response.data),
    [],
  );
  const families = familiesData ?? [];
  const [newFamilyName, setNewFamilyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
  const [familyMembers, setFamilyMembers] = useState<Record<string, any[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      console.error('Failed to fetch families', error);
      toast.error('Không thể tải danh sách gia đình');
    }
  }, [error]);

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
      <div className="p-8 rounded-2xl border border-border bg-card shadow-sm">
        <h3 className="text-sm font-bold mb-6  text-slate-900 dark:text-slate-100 italic">Tạo gia đình mới</h3>
        <form onSubmit={handleCreateFamily} className="flex flex-col sm:flex-row gap-4">
          <Input
            type="text"
            value={newFamilyName}
            onChange={(e) => setNewFamilyName(e.target.value)}
            placeholder="Tên gia đình (VD: Gia đình Nguyễn)..."
            className="flex-1 h-12"
          />
          <Button
            type="submit"
            disabled={isCreating}
            className="h-12 px-8 font-bold text-xs gap-2"
          >
            {isCreating ? 'Đang tạo...' : <><FiPlus size={16} /> Tạo</>}
          </Button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-700">Danh sách gia đình ({families.length})</h3>
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {families.map((family) => (
              <div key={family.id} className="bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-all overflow-hidden">
                <div className="p-6 flex items-center justify-between group">
                  <div className="flex-1">
                    {editingFamilyId === family.id ? (
                      <div className="flex items-center gap-3">
                        <Input
                          autoFocus
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 max-w-md h-12 text-lg font-bold italic"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateName(family.id);
                            if (e.key === 'Escape') setEditingFamilyId(null);
                          }}
                        />
                        <Button 
                          onClick={() => handleUpdateName(family.id)}
                          className="h-12 px-6"
                        >
                          Lưu
                        </Button>
                        <Button 
                          variant="ghost"
                          onClick={() => setEditingFamilyId(null)}
                          className="h-12 px-6"
                        >
                          Hủy
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 italic tracking-tight">{family.name}</h4>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingFamilyId(family.id);
                              setEditingName(family.name);
                            }}
                            className="h-8 w-8 text-slate-400 hover:text-primary"
                          >
                            <FiEdit2 size={12} />
                          </Button>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                           <p className="text-xs text-slate-400 font-bold bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">NODE ID: {family.id}</p>
                           <button 
                              onClick={() => toggleExpand(family.id)}
                              className="text-xs font-bold text-primary hover:underline transition-colors  flex items-center gap-1"
                           >
                              <FiUser size={10} /> {family._count?.users || 0} thành viên
                           </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                        variant={expandedFamilyId === family.id ? 'default' : 'ghost'}
                        size="icon"
                        onClick={() => toggleExpand(family.id)}
                        className={`h-11 w-11 transition-all ${expandedFamilyId === family.id ? '' : 'text-slate-400'}`}
                      >
                       <FiChevronDown className={`transition-transform duration-300 ${expandedFamilyId === family.id ? 'rotate-180' : ''}`} size={18} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(family.id)}
                      className="h-11 w-11 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
                    >
                      <FiTrash2 size={18} />
                    </Button>
                  </div>
                </div>

                {expandedFamilyId === family.id && (
                    <div className="px-6 pb-6 pt-2 bg-slate-50/50 border-t border-slate-50 animate-in slide-in-from-top-4 duration-300">
                        <div className="flex justify-between items-center mb-4">
                            <h5 className="text-xs font-bold text-slate-400">Danh sách thành viên</h5>
                            <button 
                                onClick={() => onTabChange?.('users')} // In case we want to jump to user manager
                                className="text-xs font-bold text-red-600 hover:underline"
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
                                                <p className="text-xs font-bold text-slate-800 truncate">{u.name}</p>
                                                <p className="text-xs font-bold text-slate-400 truncate">{u.email}</p>
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
