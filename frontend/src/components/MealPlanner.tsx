'use client';

import { useState, useEffect } from 'react';
import { usersAPI } from '@/lib/api-client';
import apiClient from '@/lib/api-client';
import toast from 'react-hot-toast';
import { FiUsers, FiCpu, FiCheckCircle } from 'react-icons/fi';
import MealPreferenceModal from './MealPreferenceModal';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

export default function MealPlanner() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [generatingMenu, setGeneratingMenu] = useState(false);
  const [generatedMenu, setGeneratedMenu] = useState<any>(null);

  const familyId = process.env.NEXT_PUBLIC_FAMILY_ID || 'default-family';

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const response = await usersAPI.getAll(familyId);
      setMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      toast.error('Không thể tải danh sách thành viên');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleGenerateMenu = async () => {
    setGeneratingMenu(true);
    try {
      const response = await apiClient.get(`/api/meals/family/${familyId}/generate-menu`);
      setGeneratedMenu(response.data);
      toast.success('Đã lên thực đơn thành công!');
    } catch (error) {
      console.error('Failed to generate menu', error);
      toast.error('Không thể tạo AI menu lúc này');
    } finally {
      setGeneratingMenu(false);
    }
  };

  return (
    <div className="space-y-10 md:space-y-16">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-pulse"></span>
            Meal Planner
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-slate-800 tracking-tight leading-none">
            Hôm nay <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-500">ăn gì?</span>
          </h2>
          <p className="text-slate-400 font-medium text-sm md:text-base">
            Chọn thành viên để thêm món yêu thích, sau đó để AI gợi ý bữa ăn!
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 md:gap-12 items-start">
        
        {/* Members Grid */}
        <div className="lg:col-span-8">
          <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <FiUsers className="text-orange-500" /> Khẩu vị gia đình
          </h3>
          
          {loadingMembers ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white/50 rounded-[2.5rem] border border-slate-200 border-dashed">
              <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Đang tải dữ liệu...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-20 bg-white/50 rounded-[2.5rem] border border-slate-200 border-dashed">
              <span className="text-6xl mb-6 block opacity-20 filter grayscale">👨‍👩‍👧‍👦</span>
              <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Chưa có ai</p>
              <p className="text-slate-300 text-[10px] mt-2">Vui lòng sang tab "Gia đình" để thêm thành viên trước.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {members.map((member) => (
                <div
                  key={member.id}
                  onClick={() => setSelectedMember(member)}
                  className="group relative p-6 bg-white rounded-3xl border border-slate-100 hover:border-orange-200 hover:shadow-xl hover:shadow-orange-100/50 hover:-translate-y-1 transition-all cursor-pointer flex flex-col items-center text-center gap-4"
                >
                  <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center text-2xl font-black group-hover:bg-orange-500 group-hover:text-white transition-colors duration-500">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800">{member.name}</h4>
                    {member.role && (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{member.role}</span>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/0 via-orange-500/0 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl pointer-events-none" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Menu Generator Block */}
        <div className="lg:col-span-4 lg:sticky lg:top-32 space-y-6">
          <div className="p-6 md:p-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <h3 className="text-xl font-black text-white mb-2 flex items-center gap-3 relative z-10">
              <FiCpu className="text-orange-400" /> AI Menu
            </h3>
            <p className="text-slate-400 text-xs mb-8 relative z-10">
              Gợi ý thực đơn hôm nay dựa trên những chuyên gia ẩm thực gia đình bạn.
            </p>

            <button
              onClick={handleGenerateMenu}
              disabled={generatingMenu || members.length === 0}
              className="w-full relative z-10 py-4 px-6 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-white font-black uppercase tracking-widest text-xs transition-all flex justify-center items-center gap-2 hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed group/btn"
            >
              {generatingMenu ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang suy nghĩ...
                </>
              ) : (
                <>
                  ✨ GỢI Ý NGAY
                </>
              )}
            </button>
          </div>

          {/* Generated Result Container */}
          {generatedMenu && (
            <div className="p-6 md:p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/50 animate-in slide-in-from-bottom-8 fade-in duration-500 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm mb-2">
                <FiCheckCircle /> Thực đơn hôm nay:
              </div>
              
              <div className="space-y-3">
                <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl flex items-center gap-3">
                  <span className="text-2xl">🍗</span>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-0.5">Món chính</div>
                    <div className="font-bold text-slate-800">{generatedMenu.mainCourse?.name || 'Thịt kho tàu (Mặc định)'}</div>
                  </div>
                </div>

                <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-center gap-3">
                  <span className="text-2xl">🥦</span>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-0.5">Rau xanh</div>
                    <div className="font-bold text-slate-800">{generatedMenu.vegetable?.name || 'Rau muống xào (Mặc định)'}</div>
                  </div>
                </div>

                <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-center gap-3">
                  <span className="text-2xl">🥣</span>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-0.5">Canh</div>
                    <div className="font-bold text-slate-800">{generatedMenu.soup?.name || 'Canh chua (Mặc định)'}</div>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-center text-slate-400 mt-4 italic">
                Thực đơn đã được lưu vào lịch sử để tránh trùng lặp ngày mai!
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modal */}
      {selectedMember && (
        <MealPreferenceModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
