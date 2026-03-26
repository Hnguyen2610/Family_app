import React, { useState, useEffect } from 'react';
import { familiesAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';

export default function FamilyManager() {
  const [families, setFamilies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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
      <div className="bg-white/50 p-6 rounded-2xl border border-slate-100">
        <h3 className="text-lg font-bold mb-4">Tạo gia đình mới</h3>
        <form onSubmit={handleCreateFamily} className="flex gap-2">
          <input
            type="text"
            value={newFamilyName}
            onChange={(e) => setNewFamilyName(e.target.value)}
            placeholder="Tên gia đình (VD: Gia đình Nguyễn)"
            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all font-medium"
          />
          <button
            type="submit"
            disabled={isCreating}
            className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 transition-all"
          >
            {isCreating ? 'Đang tạo...' : 'Tạo'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold">Danh sách gia đình ({families.length})</h3>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {families.map((family) => (
              <div key={family.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between group">
                <div className="flex-1">
                  {editingFamilyId === family.id ? (
                    <div className="flex gap-2 pr-4">
                      <input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-3 py-1 rounded-lg border border-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm font-bold"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateName(family.id);
                          if (e.key === 'Escape') setEditingFamilyId(null);
                        }}
                      />
                      <button 
                        onClick={() => handleUpdateName(family.id)}
                        className="text-xs font-bold text-red-600"
                      >
                        Lưu
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900">{family.name}</h4>
                        <button
                          onClick={() => {
                            setEditingFamilyId(family.id);
                            setEditingName(family.name);
                          }}
                          className="p-1 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all"
                          title="Đổi tên"
                        >
                          ✏️
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {family.id}</p>
                      <p className="text-xs text-slate-500 font-bold mt-1">👥 {family._count?.users || 0} thành viên</p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(family.id)}
                  className="p-2 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
