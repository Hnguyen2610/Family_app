import React, { useState, useEffect } from 'react';
import { usersAPI, familiesAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';

export default function UserManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    familyId: '',
    role: 'USER'
  });
  const [isCreating, setIsCreating] = useState(false);

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
      const payload = { ...newUser, familyId: newUser.familyId || undefined };
      await usersAPI.create(payload);
      toast.success('Đã thêm người dùng mới');
      setNewUser({ ...newUser, name: '', email: '', familyId: '' });
      fetchData();
    } catch (error) {
      toast.error('Không thể thêm người dùng');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa người dùng này?')) return;
    try {
      await usersAPI.delete(id);
      toast.success('Đã xóa người dùng');
      fetchData();
    } catch (error) {
      toast.error('Không thể xóa người dùng');
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <div className="bg-white/50 p-6 rounded-2xl border border-slate-100">
        <h3 className="text-lg font-bold mb-4">Thêm người dùng mới</h3>
        <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            placeholder="Tên hiển thị"
            className="px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
          />
          <input
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            placeholder="Email (phải đúng với email Google)"
            className="px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
          />
          <select
            value={newUser.familyId}
            onChange={(e) => setNewUser({ ...newUser, familyId: e.target.value })}
            className="px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium bg-white"
          >
            <option value="">Chọn gia đình (Để sau)</option>
            {families.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isCreating}
            className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 transition-all"
          >
            {isCreating ? 'Đang thêm...' : 'Thêm người dùng'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-[1.5rem] border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-black uppercase tracking-wider">
                <th className="px-6 py-4">Thành viên</th>
                <th className="px-6 py-4">Gia đình</th>
                <th className="px-6 py-4">Quyền</th>
                <th className="px-6 py-4">Ngày tham gia</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center">
                    <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.map((u) => (
                <tr key={u.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${u.family ? 'text-slate-600 bg-slate-100' : 'text-slate-400 bg-slate-50 italic'}`}>
                      {u.family?.name || 'Chưa gia nhập'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-black px-2 py-1 rounded ${u.globalRole === 'SUPER_ADMIN' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                      {u.globalRole || 'USER'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-slate-300 hover:text-red-600 transition-colors"
                    >
                      🗑️
                    </button>
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
