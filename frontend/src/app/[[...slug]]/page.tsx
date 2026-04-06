'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Calendar from '@/components/Calendar';
import Chatbot from '@/components/Chatbot';
import FamilyMembers from '@/components/FamilyMembers';
import MealPlanner from '@/components/MealPlanner';
import NewMonthModal from '@/components/NewMonthModal';
import AdminDashboard from '@/components/admin/AdminDashboard';
import Settings from '@/components/Settings';
import NotificationSettings from '@/components/NotificationSettings';
import ThemeManager from '@/components/ThemeManager';
import NotificationDropdown from '@/components/NotificationDropdown';
import Onboarding from '@/components/Onboarding';
import Dashboard from '@/components/Dashboard';
import Finance from '@/components/Finance';

import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import Login from '@/components/Login';

type TabType = 'dashboard' | 'calendar' | 'chat' | 'family' | 'meals' | 'finance' | 'admin' | 'settings' | 'notifications';

export default function Home({ params }: { readonly params: { readonly slug?: readonly string[] } }) {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user, isAuthenticated, isLoading, currentFamilyId, setCurrentFamilyId } = useAuth();
  const { t } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const slugTab = params.slug?.[0] as TabType;
  const activeTab: TabType = slugTab || 'dashboard';

  const families = user?.families || [];
  const currentFamily = families.find(f => f.id === currentFamilyId) || user?.family;

  const setActiveTab = (tab: TabType) => {
    router.push('/' + (tab === 'dashboard' ? '' : tab));
  };

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(globalThis.window.scrollY > 250);
    };
    globalThis.window.addEventListener('scroll', onScroll, { passive: true });
    return () => globalThis.window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (globalThis.window !== undefined && globalThis.window.scrollY > 0) {
      globalThis.window.scrollTo({ top: 0, behavior: 'instant' as any });
    }
  }, [activeTab]);

  useEffect(() => {
    if (user?.id) {
      const hasSeen = localStorage.getItem(`has_seen_onboarding_${user.id}`);
      if (!hasSeen) setShowOnboarding(true);
    }
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden transition-colors duration-500">
      <ThemeManager />
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
      
      {/* Background Decorative Elements */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100/30 dark:bg-indigo-900/10 rounded-full blur-[120px] -z-10" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/30 dark:bg-blue-900/10 rounded-full blur-[120px] -z-10" />

      {/* Main static header area */}
      <div className={`transition-opacity duration-300 min-h-[280px] md:min-h-[350px] ${isScrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="absolute top-4 left-4 md:top-8 md:left-8 z-50">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="w-12 h-12 md:w-16 md:h-16 glass rounded-2xl flex items-center justify-center text-xl md:text-3xl hover:bg-white/10 active:scale-90 transition-all shadow-xl shadow-indigo-500/10 border-white/20"
          >
            ☰
          </button>
        </div>

        <header className="pt-8 md:pt-16 pb-4 md:pb-8 relative z-10 text-center">
          <div className="absolute top-4 right-4 md:top-8 md:right-8 flex items-center gap-4">
             {/* Family Selection (Optional if multiple) */}
            {families.length > 1 && (
              <select
                value={currentFamilyId || ''}
                onChange={(e) => setCurrentFamilyId(e.target.value)}
                className="bg-card/50 backdrop-blur-md border border-border/40 rounded-xl px-3 py-1.5 text-xs font-bold outline-none ring-indigo-500 focus:ring-1"
              >
                {families.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
            <NotificationDropdown />
          </div>
          <div className="inline-block animate-float mb-4 md:mb-6">
            <span className="text-6xl md:text-9xl">👨‍👩‍👧‍👦</span>
          </div>
          <h1 className="text-4xl md:text-8xl font-black tracking-tight leading-tight">
            Family <span className="gradient-text">Calendar</span>
          </h1>
          {user && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <p className="text-muted-foreground font-bold text-lg">
                {t('nav.welcome')} {user.name} 👋
              </p>
              {currentFamily && (
                <span className="text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase tracking-[0.2em]">
                   {currentFamily.name}
                </span>
              )}
            </div>
          )}
        </header>
      </div>

      {/* Sticky Bar */}
      <div className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 border-b border-border/60 ${isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <header className="bg-background/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-2 md:px-8 py-2 md:py-2.5 flex justify-between items-center gap-2 md:gap-4">
            {/* Menu Left (Sticky) */}
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 bg-card/60 backdrop-blur-md rounded-xl flex items-center justify-center text-xl hover:bg-card/90 active:scale-95 transition-all border border-border/40 shrink-0"
            >
              ☰
            </button>

            {/* Logo Center */}
            <div 
              className="flex-1 flex justify-center items-center gap-2 group cursor-pointer transition-transform active:scale-95 shrink-0" 
              onClick={() => {
                globalThis.window.scrollTo({ top: 0, behavior: 'smooth' });
                setActiveTab('dashboard');
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-card rounded-xl flex items-center justify-center shadow-sm border border-border/40">
                  <span className="text-lg">👨‍👩‍👧‍👦</span>
                </div>
                <div className="hidden sm:block text-left">
                  <h1 className="text-sm font-black tracking-tighter leading-tight">
                    Family <span className="gradient-text">Calendar</span>
                  </h1>
                </div>
              </div>
            </div>

            {/* Shortcut */}
            <div className="shrink-0 items-center flex gap-2 md:gap-4">
               {families.length > 1 && (
                <select
                  value={currentFamilyId || ''}
                  onChange={(e) => setCurrentFamilyId(e.target.value)}
                  className="bg-muted/50 border-none rounded-lg px-2 py-1 text-[10px] font-black outline-none"
                >
                  {families.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              )}
               <NotificationDropdown />
            </div>
          </div>
        </header>
      </div>

      {/* Content Area */}
      <main className="max-w-6xl mx-auto px-3 md:px-8 pb-20 md:pb-32 min-h-[60vh] animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <NewMonthModal />
        <div className="glass rounded-[2.5rem] p-4 md:p-12 min-h-[500px] border-white/40 dark:border-slate-800/40 shadow-2xl">
          {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'calendar' && <Calendar />}
          {activeTab === 'chat' && <Chatbot />}
          {activeTab === 'family' && <FamilyMembers />}
          {activeTab === 'meals' && <MealPlanner />}
          {activeTab === 'finance' && <Finance />}
          {activeTab === 'admin' && <AdminDashboard />}
          {activeTab === 'settings' && <Settings onNavigate={setActiveTab} />}
          {activeTab === 'notifications' && <NotificationSettings onBack={() => setActiveTab('settings')} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-10 md:py-20 border-t border-border/60 bg-card/40 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-muted-foreground font-bold text-xs md:text-sm uppercase tracking-widest">
            © 2026 Family Calendar. Made with ❤️ for your home.
          </p>
        </div>
      </footer>

      {/* Premium Sidebar Overlay */}
      <div className={`fixed inset-0 z-[200] transition-all duration-500 ${isSidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
        {/* Backdrop */}
        <div 
          className={`absolute inset-0 bg-background/40 backdrop-blur-md transition-opacity duration-500 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsSidebarOpen(false)}
        />
        
        {/* Sidebar Panel */}
        <aside 
          className={`absolute top-0 left-0 h-full w-72 md:w-80 bg-background/80 backdrop-blur-2xl border-r border-white/20 dark:border-slate-800/20 shadow-[20px_0_50px_rgba(0,0,0,0.1)] transition-transform duration-500 ease-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {/* Sidebar Header */}
          <div className="p-8 pb-4 flex justify-between items-center">
            <h3 className="text-2xl font-black gradient-text">Menu Family</h3>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="w-10 h-10 rounded-xl bg-card hover:bg-card/80 flex items-center justify-center text-xl active:scale-90 transition-all border border-border/40"
            >
              ✕
            </button>
          </div>

          {/* User Profile Summary */}
          <div className="px-8 py-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg">👤</div>
              <div className="flex flex-col">
                <span className="font-black text-sm">{user?.name}</span>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{currentFamily?.name}</span>
              </div>
            </div>
          </div>

          {/* Navigation List */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
            <SidebarItem 
              active={activeTab === 'dashboard'} 
              onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} 
              icon="🏠" 
              label="Trang chủ" 
            />
            <SidebarItem 
              active={activeTab === 'calendar'} 
              onClick={() => { setActiveTab('calendar'); setIsSidebarOpen(false); }} 
              icon="📅" 
              label={t('nav.calendarFull')} 
            />
            <SidebarItem 
              active={activeTab === 'chat'} 
              onClick={() => { setActiveTab('chat'); setIsSidebarOpen(false); }} 
              icon="🤖" 
              label={t('nav.chatFull')} 
            />
            <SidebarItem 
              active={activeTab === 'family'} 
              onClick={() => { setActiveTab('family'); setIsSidebarOpen(false); }} 
              icon="👪" 
              label={t('nav.familyFull')} 
            />
            <SidebarItem 
              active={activeTab === 'meals'} 
              onClick={() => { setActiveTab('meals'); setIsSidebarOpen(false); }} 
              icon="🍽️" 
              label={t('nav.mealsFull')} 
              color="orange"
            />
            <SidebarItem 
              active={activeTab === 'finance'} 
              onClick={() => { setActiveTab('finance'); setIsSidebarOpen(false); }} 
              icon="💰" 
              label={t('nav.financeFull')} 
              color="green"
            />
            {user?.globalRole === 'SUPER_ADMIN' && (
              <SidebarItem 
                active={activeTab === 'admin'} 
                onClick={() => { setActiveTab('admin'); setIsSidebarOpen(false); }} 
                icon="🛡️" 
                label="Quản trị" 
                color="red"
              />
            )}
            <div className="pt-4 mt-4 border-t border-border/40">
              <SidebarItem 
                active={activeTab === 'settings'} 
                onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }} 
                icon="⚙️" 
                label={t('nav.settings')} 
              />
            </div>
          </nav>

          {/* Sidebar Footer */}
          <div className="p-8 text-center opacity-40">
             <p className="text-[10px] font-black uppercase tracking-[0.2em]">Family v2.0</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SidebarItem({ 
  active, 
  onClick, 
  icon, 
  label, 
  color = 'indigo' 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: string; 
  label: string;
  color?: 'indigo' | 'orange' | 'green' | 'red';
}) {
  const colorClasses = {
    indigo: active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none translate-x-2' : 'hover:bg-card hover:translate-x-2',
    orange: active ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 dark:shadow-none translate-x-2' : 'hover:bg-card hover:translate-x-2',
    green: active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none translate-x-2' : 'hover:bg-card hover:translate-x-2',
    red: active ? 'bg-red-600 text-white shadow-lg shadow-red-200 dark:shadow-none translate-x-2' : 'hover:bg-card hover:translate-x-2',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-[1.25rem] font-black transition-all duration-300 group ${colorClasses[color]}`}
    >
      <span className="text-2xl group-active:scale-125 transition-transform">{icon}</span>
      <span className="text-sm tracking-tight">{label}</span>
    </button>
  );
}

