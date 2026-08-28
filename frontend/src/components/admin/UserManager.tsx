import React, { useState, useEffect } from 'react';
import { usersAPI, familiesAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const NOTIFICATION_TYPE_OPTIONS = [
  { id: 'BIRTHDAY', label: 'Sinh nhật' },
  { id: 'ANNIVERSARY', label: 'Kỷ niệm' },
  { id: 'HOLIDAY', label: 'Ngày lễ' },
  { id: 'APPOINTMENT', label: 'Lịch hẹn' },
  { id: 'TASK', label: 'Công việc' },
  { id: 'GENERAL', label: 'Chung' },
  { id: 'proactiveAssistant', label: 'Trợ lý chủ động' },
];

const NOTIFICATION_CHANNEL_OPTIONS = [
  { id: 'webpush' as const, label: 'Web Push' },
  { id: 'telegram' as const, label: 'Telegram' },
];

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

  // Send email dialog state
  const [emailTarget, setEmailTarget] = useState<any | null>(null);
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' });
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Notification settings dialog state
  const [notifTarget, setNotifTarget] = useState<any | null>(null);
  const [notifSettings, setNotifSettings] = useState<any>({});
  const [isSavingNotif, setIsSavingNotif] = useState(false);

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

  const openEmailDialog = (user: any) => {
    setEmailTarget(user);
    setEmailForm({ subject: '', message: '' });
  };

  const handleSendEmail = async () => {
    if (!emailTarget) return;
    if (!emailForm.subject.trim() || !emailForm.message.trim()) {
      toast.error('Vui lòng nhập đủ tiêu đề và nội dung');
      return;
    }
    setIsSendingEmail(true);
    try {
      await usersAPI.sendEmail(emailTarget.id, emailForm);
      toast.success(`Đã gửi email tới ${emailTarget.name}`);
      setEmailTarget(null);
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Không thể gửi email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const openNotifDialog = (user: any) => {
    setNotifTarget(user);
    setNotifSettings(user.notificationSettings || {});
  };

  const toggleNotifType = (key: string) => {
    setNotifSettings((prev: any) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const toggleNotifChannel = (channel: 'webpush' | 'telegram') => {
    setNotifSettings((prev: any) => ({
      ...prev,
      proactiveAssistantChannels: {
        ...(prev.proactiveAssistantChannels || {}),
        [channel]: !((prev.proactiveAssistantChannels || {})[channel] ?? true),
      },
    }));
  };

  const handleSaveNotif = async () => {
    if (!notifTarget) return;
    setIsSavingNotif(true);
    try {
      await usersAPI.update(notifTarget.id, { notificationSettings: notifSettings });
      toast.success('Đã cập nhật cài đặt thông báo');
      setNotifTarget(null);
      fetchData();
    } catch (error) {
      console.error('Error updating notification settings:', error);
      toast.error('Không thể cập nhật cài đặt thông báo');
    } finally {
      setIsSavingNotif(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Forms Section */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
        <h3 className="text-lg font-bold mb-4  text-slate-700">
          {editingUserId ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}
        </h3>
        <form onSubmit={editingUserId ? handleUpdateUser : handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400  ml-1">Tên hiển thị</p>
            <Input
              value={editingUserId ? editingData.name : newUser.name}
              onChange={(e) => editingUserId 
                ? setEditingData({ ...editingData, name: e.target.value })
                : setNewUser({ ...newUser, name: e.target.value })
              }
              placeholder="Tên hiển thị"
            />
          </div>
          
          <div className="space-y-2">
             <p className="text-xs font-bold text-slate-400  ml-1">Email</p>
             <Input
                type="email"
                value={editingUserId ? editingData.email : newUser.email}
                onChange={(e) => editingUserId
                  ? setEditingData({ ...editingData, email: e.target.value })
                  : setNewUser({ ...newUser, email: e.target.value })
                }
                placeholder="Email"
              />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400  ml-1">Gia đình</p>
            <div className="flex flex-wrap gap-2 p-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 shadow-inner max-h-32 overflow-y-auto">
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelected 
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10' 
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400  ml-1">Quyền hạn</p>
            <Select
              value={editingUserId ? editingData.globalRole : newUser.role}
              onValueChange={(val) => editingUserId
                ? setEditingData({ ...editingData, globalRole: val as string })
                : setNewUser({ ...newUser, role: val as 'USER' | 'ADMIN' | 'SUPER_ADMIN' })
              }
            >
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">USER</SelectItem>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                <SelectItem value="SUPER_ADMIN">SUPER_ADMIN</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isCreating || isUpdating}
              className="flex-1 h-12"
            >
              {getButtonText()}
            </Button>
            {editingUserId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingUserId(null)}
                className="h-12 px-4"
              >
                Hủy
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* List */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-xs font-bold ">
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
                      <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 shadow-sm border border-white">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{u.name}</p>
                        <p className="text-xs font-bold text-slate-400 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {u.families && u.families.length > 0 ? (
                        u.families.map((f: any) => (
                          <span key={f.id} className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                            {f.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-50 text-slate-400 border border-transparent italic">
                          Chưa gia nhập
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${getRoleBadgeClass(u.globalRole)}`}>
                      {u.globalRole || 'USER'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-[11px] font-bold text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => openEmailDialog(u)}
                          className="p-2.5 bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 rounded-xl transition-all active:scale-95"
                          title="Gửi email"
                        >
                          📧
                        </button>
                        <button
                          onClick={() => openNotifDialog(u)}
                          className="p-2.5 bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-600 rounded-xl transition-all active:scale-95"
                          title="Cài đặt thông báo"
                        >
                          🔔
                        </button>
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

      {/* Send Email Dialog */}
      <Dialog open={!!emailTarget} onOpenChange={(open) => !open && setEmailTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gửi email tới {emailTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 ml-1">Tiêu đề</p>
              <Input
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                placeholder="Tiêu đề email"
                disabled={isSendingEmail}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 ml-1">Nội dung</p>
              <textarea
                value={emailForm.message}
                onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                placeholder="Nội dung email"
                disabled={isSendingEmail}
                className="w-full min-h-[160px] resize-y rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-slate-950/50 px-4 py-4 text-sm leading-relaxed outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)} disabled={isSendingEmail}>
              Hủy
            </Button>
            <Button onClick={handleSendEmail} disabled={isSendingEmail}>
              {isSendingEmail ? 'Đang gửi...' : 'Gửi email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Settings Dialog */}
      <Dialog open={!!notifTarget} onOpenChange={(open) => !open && setNotifTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cài đặt thông báo — {notifTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400">Loại thông báo</p>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_TYPE_OPTIONS.map((type) => {
                  const isActive = notifSettings[type.id] ?? true;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => toggleNotifType(type.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border border-transparent'
                      }`}
                    >
                      {type.label}
                      <span className={`w-8 h-4 rounded-full relative transition-all ${isActive ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isActive ? 'left-4' : 'left-0.5'}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400">Kênh trợ lý chủ động</p>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_CHANNEL_OPTIONS.map((channel) => {
                  const isActive = notifSettings.proactiveAssistantChannels?.[channel.id] ?? true;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => toggleNotifChannel(channel.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border border-transparent'
                      }`}
                    >
                      {channel.label}
                      <span className={`w-8 h-4 rounded-full relative transition-all ${isActive ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isActive ? 'left-4' : 'left-0.5'}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifTarget(null)} disabled={isSavingNotif}>
              Hủy
            </Button>
            <Button onClick={handleSaveNotif} disabled={isSavingNotif}>
              {isSavingNotif ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
