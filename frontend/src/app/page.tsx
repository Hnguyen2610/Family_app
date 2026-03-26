'use client';

import { useState } from 'react';
import Calendar from '@/components/Calendar';
import Chatbot from '@/components/Chatbot';
import FamilyMembers from '@/components/FamilyMembers';
import MealPlanner from '@/components/MealPlanner';
import NewMonthModal from '@/components/NewMonthModal';
import AdminDashboard from '@/components/admin/AdminDashboard';

import { useAuth } from '@/hooks/useAuth';
import Login from '@/components/Login';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'chat' | 'family' | 'meals' | 'admin'>('calendar');
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 relative overflow-x-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100/50 rounded-full blur-[120px] -z-10" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-[120px] -z-10" />

      {/* Header */}
      <header className="pt-6 md:pt-10 pb-2 md:pb-6 relative z-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center">
          <div className="w-full flex justify-end mb-4">
            <button
              onClick={logout}
              className="glass px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-red-600 hover:bg-white transition-all duration-300"
            >
              🚪 Đăng xuất
            </button>
          </div>
          <div className="inline-block animate-float">
            <span className="text-4xl md:text-6xl mb-2 md:mb-4 block">👨‍👩‍👧‍👦</span>
          </div>
          <h1 className="text-3xl md:text-6xl font-black tracking-tight leading-tight">
            Family <span className="gradient-text">Calendar</span>
          </h1>
          {user && (
            <p className="mt-4 text-slate-500 font-bold">
              Chào {user.name} 👋
            </p>
          )}
        </div>
      </header>

      {/* Floating Tab Navigation */}
      <nav className="sticky top-4 md:top-8 z-50 mt-2 md:mt-4 mb-4 md:mb-8">
        <div className="max-w-fit mx-auto px-4">
          <div className="glass p-1 md:p-1.5 rounded-2xl flex gap-0.5 md:gap-1 shadow-indigo-100/20 overflow-x-auto no-scrollbar max-w-[92vw]">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center gap-1.5 md:gap-2 px-4 md:px-8 py-2 md:py-3 rounded-xl text-xs md:text-base font-black transition-all duration-500 shrink-0 ${
                activeTab === 'calendar'
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-[1.02]'
                  : 'text-slate-500 hover:bg-white hover:text-indigo-600'
              }`}
            >
              <span className="text-base md:text-xl">📅</span>{' '}
              <span className="hidden xs:inline">Lịch gia đình</span>
              <span className="xs:hidden">Lịch</span>
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 md:gap-2 px-4 md:px-8 py-2 md:py-3 rounded-xl text-xs md:text-base font-black transition-all duration-500 shrink-0 ${
                activeTab === 'chat'
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-[1.02]'
                  : 'text-slate-500 hover:bg-white hover:text-indigo-600'
              }`}
            >
              <span className="text-base md:text-xl">🤖</span> AI Chat
            </button>
            <button
              onClick={() => setActiveTab('family')}
              className={`flex items-center gap-1.5 md:gap-2 px-4 md:px-8 py-2 md:py-3 rounded-xl text-xs md:text-base font-black transition-all duration-500 shrink-0 ${
                activeTab === 'family'
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-[1.02]'
                  : 'text-slate-500 hover:bg-white hover:text-indigo-600'
              }`}
            >
              <span className="text-base md:text-xl">👪</span>{' '}
              <span className="hidden xs:inline">Thành viên</span>
              <span className="xs:hidden">Nhà</span>
            </button>
            <button
              onClick={() => setActiveTab('meals')}
              className={`flex items-center gap-1.5 md:gap-2 px-4 md:px-8 py-2 md:py-3 rounded-xl text-xs md:text-base font-black transition-all duration-500 shrink-0 ${
                activeTab === 'meals'
                  ? 'bg-orange-500 text-white shadow-xl shadow-orange-200 scale-[1.02]'
                  : 'text-slate-500 hover:bg-white hover:text-orange-500'
              }`}
            >
              <span className="text-base md:text-xl">🍽️</span>{' '}
              <span className="hidden xs:inline">Hôm nay ăn gì?</span>
              <span className="xs:hidden">Ăn gì</span>
            </button>
            {user?.globalRole === 'SUPER_ADMIN' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-1.5 md:gap-2 px-4 md:px-8 py-2 md:py-3 rounded-xl text-xs md:text-base font-black transition-all duration-500 shrink-0 ${
                  activeTab === 'admin'
                    ? 'bg-red-600 text-white shadow-xl shadow-red-200 scale-[1.02]'
                    : 'text-slate-500 hover:bg-white hover:text-red-600'
                }`}
              >
                <span className="text-base md:text-xl">🛡️</span> Quản trị
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Content Area */}
      <main className="max-w-6xl mx-auto px-3 md:px-8 pb-20 md:pb-32 min-h-[60vh] animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <NewMonthModal />
        <div className="glass rounded-[2.5rem] p-4 md:p-12 min-h-[500px] border-white/40 shadow-2xl">
          {activeTab === 'calendar' && <Calendar />}
          {activeTab === 'chat' && <Chatbot />}
          {activeTab === 'family' && <FamilyMembers />}
          {activeTab === 'meals' && <MealPlanner />}
          {activeTab === 'admin' && <AdminDashboard />}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-10 md:py-20 border-t border-slate-200/60 bg-white/40 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-slate-400 font-bold text-xs md:text-sm uppercase tracking-widest">
            © 2026 Family Calendar. Made with ❤️ for your home.
          </p>
        </div>
      </footer>
    </div>
  );
}
