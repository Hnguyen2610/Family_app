'use client';

import { useState, useEffect } from 'react';
import { usersAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { FiTrash2, FiUser, FiMail, FiArrowRight } from 'react-icons/fi';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string | null;
  birthday: string | null;
}

const ROLES = ['Bố', 'Mẹ', 'Con trai lớn', 'Con gái lớn', 'Con út', 'Ông', 'Bà'];

export default function FamilyMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    birthday: '',
  });

  const familyId = process.env.NEXT_PUBLIC_FAMILY_ID || 'default-family';

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const response = await usersAPI.getAll(familyId);
      setMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      toast.error('Không thể tải danh sách thành viên');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error('Vui lòng điền đủ tên và email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Vui lòng nhập đúng định dạng email (ví dụ: a@domain.com)');
      return;
    }


    try {
      if (editingMemberId) {
        await usersAPI.update(editingMemberId, {
          ...formData,
          familyId,
        });
        toast.success(`Đã cập nhật thông tin ${formData.name}`);
      } else {
        await usersAPI.create({
          ...formData,
          familyId,
        });
        toast.success(`Đã thêm ${formData.name} vào gia đình`);
      }

      setFormData({ name: '', email: '', role: '', birthday: '' });
      setEditingMemberId(null);
      fetchMembers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại');
    }
  };

  const handleEdit = (member: Member) => {
    setEditingMemberId(member.id);
    setFormData({
      name: member.name,
      email: member.email,
      role: member.role || '',
      birthday: member.birthday ? new Date(member.birthday).toISOString().split('T')[0] : '',
    });
    // Scroll to form on mobile
    if (window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Bạn có chắc muốn xóa ${name}?`)) {
      try {
        await usersAPI.delete(id);
        toast.success(`Đã xóa ${name}`);
        fetchMembers();
      } catch (error) {
        console.error('Failed to delete member:', error);
        toast.error('Không thể xóa thành viên');
      }
    }
  };

  const formatDisplayDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-10 md:space-y-16">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
            Family Hub
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-slate-800 tracking-tight leading-none">
            Thành <span className="gradient-text">viên</span>
          </h2>
          <p className="text-slate-400 font-medium text-sm md:text-base">
            Quản lý những người thân yêu trong tổ ấm của bạn
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 md:gap-12 items-start">
        {/* Management Form */}
        <div className="lg:col-span-5 lg:sticky lg:top-32">
          <div className="p-6 md:p-10 bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-indigo-100/30 overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 to-blue-500" />

            <h3 className="text-xl md:text-2xl font-black text-slate-800 mb-2 flex items-center gap-3">
              {editingMemberId ? 'Cập nhật' : 'Thêm mới'}
              {editingMemberId && (
                <button
                  onClick={() => {
                    setEditingMemberId(null);
                    setFormData({ name: '', email: '', role: '', birthday: '' });
                  }}
                  className="text-xs font-bold text-indigo-600 ml-auto bg-indigo-50 px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors"
                >
                  Hủy chỉnh sửa
                </button>
              )}
            </h3>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-8">
              Thông tin cơ bản
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1"
                >
                  Họ và tên
                </label>
                <div className="relative group/input">
                  <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/input:text-indigo-500 transition-colors" />
                  <input
                    id="name"
                    type="text"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input-field pl-12 text-sm md:text-base"
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1"
                >
                  Email
                </label>
                <div className="relative group/input">
                  <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/input:text-indigo-500 transition-colors" />
                  <input
                    id="email"
                    type="email"
                    placeholder="nguyenvan@family.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input-field pl-12 text-sm md:text-base"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="role"
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1"
                  >
                    Vai trò
                  </label>
                  <select
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="input-field appearance-none text-xs md:text-sm"
                  >
                    <option value="">Chọn vai trò...</option>
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="birthday"
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1"
                  >
                    Ngày sinh
                  </label>
                  <input
                    id="birthday"
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                    className="input-field text-xs md:text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary w-full py-4 text-xs md:text-sm uppercase tracking-[0.2em] font-black flex items-center justify-center gap-3 group/btn hover:translate-y-[-2px] active:translate-y-[1px]"
              >
                {editingMemberId ? 'Lưu thay đổi' : 'Thêm thành viên'}
                <FiArrowRight className="group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>
        </div>

        {/* Member Grid */}
        <div className="lg:col-span-7">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white/50 rounded-[2.5rem] border border-slate-200 border-dashed">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                Đang tải dữ liệu...
              </p>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-20 bg-white/50 rounded-[2.5rem] border border-slate-200 border-dashed">
              <span className="text-6xl mb-6 block opacity-20 filter grayscale">👪</span>
              <p className="text-slate-400 font-black uppercase tracking-widest text-xs">
                Ngôi nhà còn trống
              </p>
              <p className="text-slate-300 text-[10px] mt-2">Hãy thêm thành viên đầu tiên nhé!</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4 md:gap-8">
              {members.map((member) => (
                <div
                  key={member.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleEdit(member)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEdit(member);
                    }
                  }}
                  className={`group relative p-6 md:p-8 rounded-[2.5rem] transition-all duration-700 border-2 cursor-pointer outline-none focus:ring-4 focus:ring-indigo-500/10 text-left w-full h-full flex flex-col ${
                    editingMemberId === member.id
                      ? 'bg-indigo-600 border-indigo-500 shadow-2xl shadow-indigo-200 scale-[1.02] z-10'
                      : 'bg-white border-white hover:border-indigo-100 hover:shadow-2xl hover:shadow-indigo-100/40 hover:-translate-y-2'
                  }`}
                >
                  <div className="flex justify-between items-start mb-6 md:mb-8">
                    <div
                      className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl md:rounded-3xl flex items-center justify-center text-xl md:text-2xl font-black transition-all duration-700 shadow-lg ${
                        editingMemberId === member.id
                          ? 'bg-white/20 text-white'
                          : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white group-hover:scale-110'
                      }`}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <button
                      onClick={(e) => handleDelete(member.id, member.name, e)}
                      className={`p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-300 ${
                        editingMemberId === member.id
                          ? 'text-white/40 hover:text-white hover:bg-white/10'
                          : 'text-slate-200 hover:text-rose-500 hover:bg-rose-50'
                      }`}
                      title="Xóa"
                    >
                      <FiTrash2 size={18} />
                    </button>
                  </div>

                  <div className="mt-auto">
                    <h4
                      className={`text-lg md:text-2xl font-black mb-1 md:mb-2 transition-all duration-700 ${
                        editingMemberId === member.id ? 'text-white' : 'text-slate-800'
                      }`}
                    >
                      {member.name}
                    </h4>
                    <p
                      className={`text-[10px] md:text-xs font-bold flex items-center gap-2 mb-6 transition-all duration-700 ${
                        editingMemberId === member.id ? 'text-white/70' : 'text-slate-400'
                      }`}
                    >
                      <FiMail
                        size={12}
                        className={
                          editingMemberId === member.id ? 'text-white/40' : 'text-indigo-300'
                        }
                      />
                      <span className="truncate">{member.email}</span>
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {member.role && (
                        <span
                          className={`px-4 py-1.5 text-[9px] md:text-[10px] font-black rounded-full uppercase tracking-widest transition-all duration-700 ${
                            editingMemberId === member.id
                              ? 'bg-white/15 text-white'
                              : 'bg-slate-50 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                          }`}
                        >
                          {member.role}
                        </span>
                      )}
                      {member.birthday && (
                        <span
                          className={`px-4 py-1.5 text-[9px] md:text-[10px] font-black rounded-full uppercase tracking-widest flex items-center gap-1.5 transition-all duration-700 ${
                            editingMemberId === member.id
                              ? 'bg-white/15 text-white'
                              : 'bg-rose-50 text-rose-500'
                          }`}
                        >
                          🎂 {formatDisplayDate(member.birthday)}
                        </span>
                      )}
                    </div>
                  </div>

                  {editingMemberId === member.id && (
                    <div className="absolute top-4 right-4 hidden md:flex items-center gap-2 bg-white/20 backdrop-blur-md text-white px-4 py-1.5 rounded-full shadow-lg border border-white/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        Đang sửa
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
