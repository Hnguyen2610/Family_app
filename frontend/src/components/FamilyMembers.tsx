'use client';

import { useState, useEffect } from 'react';
import { usersAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { FiTrash2, FiUser, FiMail, FiArrowRight, FiHome, FiUsers } from 'react-icons/fi';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string | null;
  birthday: string | null;
}

const ROLES_KEYS = [
  'family.role.father', 'family.role.mother', 'family.role.son',
  'family.role.daughter', 'family.role.grandpa', 'family.role.grandma', 'family.role.other'
];

export default function FamilyMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const { t,language } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    birthday: '',
  });

  const { user, currentFamilyId } = useAuth();
  const familyId = currentFamilyId || '';

  useEffect(() => {
    if (familyId) {
      fetchMembers();
    }
  }, [familyId]);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const response = await usersAPI.getAll(familyId, user?.id);
      setMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      toast.error(t('family.toastError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error(t('family.toastMissingFields'));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error(t('family.toastInvalidEmail'));
      return;
    }


    try {
      if (editingMemberId) {
        await usersAPI.update(editingMemberId, {
          ...formData,
          familyId,
        });
        toast.success(`${t('family.toastSaveSuccess')} ${formData.name}`);
      } else {
        await usersAPI.create({
          ...formData,
          familyId,
        });
        toast.success(`${t('family.toastAddSuccess')}: ${formData.name}`);
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
    if (confirm(`${t('family.deleteConfirm')} (${name})`)) {
      try {
        await usersAPI.delete(id);
        toast.success(language === 'vi' ? `Đã xóa ${name}` : `Removed ${name}`);
        fetchMembers();
      } catch (error) {
        console.error('Failed to delete member:', error);
        toast.error(t('family.toastError'));
      }
    }
  };

  const formatDisplayDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (!currentFamilyId && user?.globalRole !== 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-8 glass rounded-2xl border border-black/5 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/40 shadow-sm">
        <div className="w-24 h-24 bg-white dark:bg-slate-900/50 rounded-2xl flex items-center justify-center shadow-xl border border-black/5 dark:border-white/5 animate-soft-float">
          <FiHome size={40} className="text-primary" />
        </div>
        <div className="space-y-3 max-w-md">
          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">{t('common.noFamily')}</h3>
          <p className="text-slate-500 font-medium leading-relaxed">{t('common.noFamilyDesc')}</p>
        </div>
        <div className="pt-4">
          <div className="inline-flex items-center gap-2 px-6 py-2 bg-white dark:bg-slate-900 border border-black/5 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 shadow-md">
            <FiMail className="text-primary" />
            {user?.email}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black/5 dark:border-white/5 pb-8">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-md text-[9px] font-black uppercase tracking-[0.2em] border border-primary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            {language === 'vi' ? 'Quản lý thành viên' : 'Management System'}
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">
            {language === 'vi' ? 'Thành viên ' : 'Family '}<span className="text-primary italic">{language === 'vi' ? 'Gia đình' : 'Members'}</span>
          </h2>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Management Form */}
        <div className="lg:col-span-4 lg:sticky lg:top-8">
          <div className="p-8 glass rounded-2xl border border-black/5 dark:border-white/5 overflow-hidden relative group bg-white/80 dark:bg-slate-900/40">
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-3">
              {editingMemberId ? t('family.edit') : t('family.add')}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('family.name')}</Label>
                <div className="relative group/input">
                  <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/input:text-primary transition-colors z-10" />
                  <Input
                    placeholder="Nguyễn Hoàng Nguyên"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="pl-12"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('family.email')}</Label>
                <div className="relative group/input">
                  <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/input:text-primary transition-colors z-10" />
                  <Input
                    type="email"
                    placeholder="nguyen@family.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-12"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('family.role')}</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(val) => setFormData({ ...formData, role: val as string })}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder={language === 'vi' ? 'Chọn vai trò...' : 'Select role...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES_KEYS.map((roleKey) => (
                        <SelectItem key={roleKey} value={t(roleKey as any)}>
                          {t(roleKey as any)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{t('family.birthday')}</Label>
                  <Input
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-12 rounded-xl text-sm font-bold gap-2">
                {editingMemberId ? t('family.update') : t('family.submit')}
                <FiArrowRight className="inline-block group-hover/btn:translate-x-1 transition-transform" />
              </Button>

              {editingMemberId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMemberId(null);
                    setFormData({ name: '', email: '', role: '', birthday: '' });
                  }}
                  className="w-full py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  {t('settings.abort')}
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Member Grid */}
        <div className="lg:col-span-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 glass rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/40">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">{language === 'vi' ? 'Đang truy xuất dữ liệu...' : 'Querying data...'}</p>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-20 glass rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/40">
              <FiUsers size={40} className="mx-auto mb-4 text-slate-300 dark:text-slate-800" />
              <p className="text-slate-500 font-black uppercase tracking-widest text-xs">{language === 'vi' ? 'Cơ sở dữ liệu trống' : 'Database Empty'}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {members.map((member) => (
                <div
                  key={member.id}
                  onClick={() => handleEdit(member)}
                  className={`group relative p-8 rounded-2xl transition-all duration-500 border border-white/5 cursor-pointer flex flex-col ${
                    editingMemberId === member.id
                      ? 'bg-primary/10 border-primary/40 shadow-2xl shadow-primary/10'
                      : 'bg-slate-100/40 dark:bg-slate-900/40 hover:bg-slate-100/60 dark:hover:bg-slate-900/60 border-black/5 dark:border-white/10 hover:border-primary/20 hover:-translate-y-1'
                  }`}
                >
                  <div className="flex justify-between items-start mb-8">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black transition-all duration-500 ${
                      editingMemberId === member.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-primary group-hover:text-primary-foreground'
                    }`}>
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <button
                      onClick={(e) => handleDelete(member.id, member.name, e)}
                      className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-auto space-y-4">
                    <div>
                      <h4 className="text-xl font-black text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">{member.name}</h4>
                      <div className="flex items-center gap-2 text-slate-500 text-[11px] font-medium mt-1">
                        <FiMail size={12} className="text-slate-600" />
                        <span className="truncate">{member.email}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {member.role && (
                        <span className="px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] font-black rounded-md uppercase tracking-wider border border-black/5 dark:border-white/5 group-hover:border-primary/20 transition-colors">
                          {member.role}
                        </span>
                      )}
                      {member.birthday && (
                        <span className="px-3 py-1 bg-primary/5 text-primary/70 text-[9px] font-black rounded-md uppercase tracking-wider border border-primary/10">
                           {formatDisplayDate(member.birthday)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
