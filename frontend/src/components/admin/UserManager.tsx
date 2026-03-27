import React, { useState, useEffect } from 'react';
import { usersAPI, familiesAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';

export default function UserManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Create state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    familyIds: [] as string[],
    role: 'USER'
  });
  const [isCreating, setIsCreating] = useState(false);

  // Edit state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState({
    name: '',
    email: '',
    familyIds: [] as string[],
    role: 'USER',
    globalRole: 'USER'
  });
  const [isUpdating, setIsUpdating] = useState(false);
  
  const getButtonText = () => {
    if (editingUserId) return isUpdating ? 'Lưu...' : 'Lưu thay đổi';
    return isCreating ? 'Thêm...' : 'Thêm mới';
  };

  const getRoleBadgeClass = (role: string) => {
    if (role === 'SUPER_ADMIN') return 'bg-red-100 text-red-600';
    if (role === 'ADMIN') return 'bg-amber-100 text-amber-600';
    return 'bg-indigo-100 text-indigo-600';
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, familiesRes] = await Promise.all([
        usersAPI.getAll(),
        familiesAPI.getAll()
      ]);
      setUsers(usersRes.data);
      setFamilies(familiesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Không thể tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email) {
      toast.error('Vui lòng điền đủ tên và email');
      return;
    }

    setIsCreating(true);
    try {
      const payload = { ...newUser, familyIds: newUser.familyIds };
      await usersAPI.create(payload);
      toast.success('Đã thêm người dùng mới');
      setNewUser({ ...newUser, name: '', email: '', familyIds: [] });
      fetchData();
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Không thể thêm người dùng');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;

    setIsUpdating(true);
    try {
      const payload = { ...editingData, familyIds: editingData.familyIds };
      await usersAPI.update(editingUserId, payload);
      toast.success('Đã cập nhật người dùng');
      setEditingUserId(null);
      fetchData();
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Không thể cập nhật người dùng');
    } finally {
      setIsUpdating(false);
    }
  };

  const startEdit = (user: any) => {
    setEditingUserId(user.id);
    setEditingData({
      name: user.name,
      email: user.email,
      familyIds: user.families?.map((f: any) => f.id) || [],
      role: user.role,
      globalRole: user.globalRole
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa người dùng này?')) return;
    try {
      await usersAPI.delete(id);
      toast.success('Đã xóa người dùng');
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Không thể xóa người dùng');
    }
  };

  return (
    <div className="space-y-6">
      {/* Forms Section */}
      <div className="bg-white/50 p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <h3 className="text-lg font-black mb-4 uppercase tracking-wider text-slate-700">
          {editingUserId ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}
        </h3>
        <form onSubmit={editingUserId ? handleUpdateUser : handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <input
            type="text"
            value={editingUserId ? editingData.name : newUser.name}
            onChange={(e) => editingUserId 
              ? setEditingData({ ...editingData, name: e.target.value })
              : setNewUser({ ...newUser, name: e.target.value })
            }
            placeholder="Tên hiển thị"
            className="px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 font-bold shadow-inner"
          />
          <input
            type="email"
            value={editingUserId ? editingData.email : newUser.email}
            onChange={(e) => editingUserId
              ? setEditingData({ ...editingData, email: e.target.value })
              : setNewUser({ ...newUser, email: e.target.value })
            }
            placeholder="Email"
            className="px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 font-bold shadow-inner"
          />
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gia đình</p>
            <div className="flex flex-wrap gap-2 p-2 rounded-2xl border border-slate-200 bg-white shadow-inner max-h-32 overflow-y-auto">
              {families.map(f => {
                const isSelected = editingUserId 
                  ? editingData.familyIds.includes(f.id)
                  : newUser.familyIds.includes(f.id);
                
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (editingUserId) {
                        const newIds = editingData.familyIds.includes(f.id)
                          ? editingData.familyIds.filter(id => id !== f.id)
                          : [...editingData.familyIds, f.id];
                        setEditingData({ ...editingData, familyIds: newIds });
                      } else {
                        const newIds = newUser.familyIds.includes(f.id)
                          ? newUser.familyIds.filter(id => id !== f.id)
                          : [...newUser.familyIds, f.id];
                        setNewUser({ ...newUser, familyIds: newIds });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${
                      isSelected 
                        ? 'bg-red-500 text-white shadow-md shadow-red-100' 
                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          </div>
          <select
            value={editingUserId ? editingData.globalRole : newUser.role}
            onChange={(e) => editingUserId
              ? setEditingData({ ...editingData, globalRole: e.target.value })
              : setNewUser({ ...newUser, role: e.target.value })
            }
            className="px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 font-bold bg-white shadow-inner"
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isCreating || isUpdating}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-2xl font-black hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-100 active:scale-95"
            >
              {getButtonText()}
            </button>
            {editingUserId && (
              <button
                type="button"
                onClick={() => setEditingUserId(null)}
                className="px-4 py-2 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all active:scale-95 text-xs"
              >
                Hủy
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-5">Thành viên</th>
                <th className="px-8 py-5">Gia đình</th>
                <th className="px-8 py-5">Quyền hạn</th>
                <th className="px-8 py-5">Ngày tham gia</th>
                <th className="px-8 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.map((u) => (
                <tr key={u.id} className={`group hover:bg-slate-50/50 transition-all ${editingUserId === u.id ? 'bg-red-50/30' : ''}`}>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-[1.25rem] bg-slate-100 overflow-hidden flex-shrink-0 shadow-sm border border-white">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 text-sm truncate">{u.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 truncate uppercase tracking-tighter">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {u.families && u.families.length > 0 ? (
                        u.families.map((f: any) => (
                          <span key={f.id} className="text-[10px] font-black px-3 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                            {f.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] font-black px-3 py-1 rounded-lg bg-slate-50 text-slate-400 border border-transparent italic">
                          Chưa gia nhập
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg ${getRoleBadgeClass(u.globalRole)}`}>
                      {u.globalRole || 'USER'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-[11px] font-bold text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => startEdit(u)}
                          className="p-2.5 bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all active:scale-95"
                          title="Chỉnh sửa"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="p-2.5 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all active:scale-95"
                          title="Xóa người dùng"
                        >
                          🗑️
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
