'use client';

import { useState, useEffect, useRef } from 'react';
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
import { FiPlus,FiHome, FiMenu, FiUser, FiCalendar, FiActivity, FiCoffee, FiTrendingUp, FiShield, FiChevronDown, FiCheck } from 'react-icons/fi';

type TabType = 'dashboard' | 'calendar' | 'chat' | 'family' | 'meals' | 'finance' | 'admin' | 'settings' | 'notifications' | 'profile';

export default function Home({ params }: { readonly params: { readonly slug?: readonly string[] } }) {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user, isAuthenticated, isLoading, currentFamilyId, setCurrentFamilyId } = useAuth();
  const { t, language } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFamilyDropdownOpen, setIsFamilyDropdownOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const familyDropdownRef = useRef<HTMLDivElement>(null);
  const stickyFamilyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideMain = familyDropdownRef.current?.contains(target);
      const insideSticky = stickyFamilyDropdownRef.current?.contains(target);

      if (!insideMain && !insideSticky) {
        setIsFamilyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const slugTab = params.slug?.[0] as TabType;
  const activeTab: TabType = slugTab || 'dashboard';

  const families = user?.families || [];
  const currentFamily = currentFamilyId === 'all'
    ? { id: 'all', name: language === 'vi' ? 'Tất cả gia đình' : 'All Families' }
    : (families.find(f => f.id === currentFamilyId) || user?.family);

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
        <div className="absolute top-3 left-2 md:top-8 md:left-8 z-50">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="w-10 h-10 md:w-13 md:h-13 glass rounded-xl md:rounded-2xl flex items-center justify-center text-lg md:text-2xl hover:bg-white/10 active:scale-90 transition-all shadow-xl shadow-primary/10 border-white/20"
          >
            <FiMenu />
          </button>
        </div>

        <header className="pt-16 md:pt-16 pb-4 md:pb-8 relative z-10 text-center">
          <div className="absolute top-3 right-3 md:top-8 md:right-8 flex items-center gap-2 md:gap-4">
             {/* Family Selection (Optional if multiple) */}
            {families.length > 1 && (
              <div ref={familyDropdownRef} className="relative">
                <button
                  onClick={() => setIsFamilyDropdownOpen(!isFamilyDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-2 glass border border-black/10 dark:border-white/10 rounded-xl text-xs font-black text-slate-700 dark:text-slate-200 hover:border-primary/40 hover:text-primary transition-all backdrop-blur-md shadow-sm"
                >
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>{currentFamily?.name || t('nav.family')}</span>
                  <FiChevronDown size={12} className={`transition-transform duration-200 ${isFamilyDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isFamilyDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-52 glass bg-white/95 dark:bg-slate-900/95 border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-xl">
                    <div className="p-2 space-y-0.5">
                      {/* All families option */}
                      <button
                        onClick={() => { setCurrentFamilyId('all'); setIsFamilyDropdownOpen(false); }}
                        className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black transition-all ${
                          currentFamilyId === 'all'
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-base">🏘️</span>
                          {language === 'vi' ? 'Tất cả gia đình' : 'All Families'}
                        </span>
                        {currentFamilyId === 'all' && <FiCheck size={12} />}
                      </button>
                      {/* Divider */}
                      <div className="h-px bg-black/5 dark:bg-white/5 my-1" />
                      {families.map(f => (
                        <button
                          key={f.id}
                          onClick={() => { setCurrentFamilyId(f.id); setIsFamilyDropdownOpen(false); }}
                          className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black transition-all ${
                            currentFamilyId === f.id
                              ? 'bg-primary/10 text-primary'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {f.name}
                          {currentFamilyId === f.id && <FiCheck size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <NotificationDropdown />
          </div>
          <div className="inline-block animate-soft-float mb-4 md:mb-6">
            <div className="w-16 h-16 md:w-32 md:h-32 rounded-3xl bg-gradient-to-br from-primary/20 to-blue-600/10 border border-primary/20 flex items-center justify-center text-4xl md:text-7xl text-primary mx-auto shadow-2xl shadow-primary/20">
              <FiHome />
            </div>
          </div>
          <h1 className="text-6xl md:text-9xl font-extrabold tracking-tighter leading-[1.2] pb-8">
            <span className="bg-clip-text text-transparent bg-gradient-to-br from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-200 dark:to-slate-400 py-4">Family</span>
            <span className="text-primary ml-2">Hub</span>
          </h1>
          {user && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <p className="text-muted-foreground font-bold text-lg">
                {t('nav.welcome')} {user.name}
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
              className="w-11 h-11 bg-card/60 backdrop-blur-md rounded-xl flex items-center justify-center text-xl hover:bg-card/90 active:scale-95 transition-all border border-border/40 shrink-0"
            >
              <FiMenu />
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
                <div className="w-8 h-8 bg-slate-200 dark:bg-slate-800 rounded-lg flex items-center justify-center border border-black/5 dark:border-white/5">
                  <FiHome className="text-primary" />
                </div>
                <div className="hidden sm:block text-left">
                  <h1 className="text-sm font-extrabold tracking-tighter text-slate-900 dark:text-slate-100">
                    Family <span className="text-primary">Hub</span>
                  </h1>
                </div>
              </div>
            </div>

            {/* Shortcut */}
            <div className="shrink-0 items-center flex gap-2 md:gap-4">
              {families.length > 1 && (
                <div ref={stickyFamilyDropdownRef} className="relative">
                  <button
                    onClick={() => setIsFamilyDropdownOpen(!isFamilyDropdownOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-black/5 dark:border-white/10 rounded-lg text-[10px] font-black text-slate-700 dark:text-slate-300 hover:border-primary/40 hover:text-primary transition-all"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>{currentFamily?.name || t('nav.family')}</span>
                    <FiChevronDown size={10} className={`transition-transform duration-200 ${isFamilyDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isFamilyDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-1.5 space-y-0.5">
                        {/* All families option */}
                        <button
                          onClick={() => { setCurrentFamilyId('all'); setIsFamilyDropdownOpen(false); }}
                          className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-black transition-all ${
                            currentFamilyId === 'all'
                              ? 'bg-primary/10 text-primary'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>🏘️</span>
                            {language === 'vi' ? 'Tất cả' : 'All'}
                          </span>
                          {currentFamilyId === 'all' && <FiCheck size={11} />}
                        </button>
                        <div className="h-px bg-black/5 dark:bg-white/5 my-1" />
                        {families.map(f => (
                          <button
                            key={f.id}
                            onClick={() => { setCurrentFamilyId(f.id); setIsFamilyDropdownOpen(false); }}
                            className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-black transition-all ${
                              currentFamilyId === f.id
                                ? 'bg-primary/10 text-primary'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {f.name}
                            {currentFamilyId === f.id && <FiCheck size={11} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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
          {(activeTab === 'settings' || activeTab === 'profile') && <Settings onNavigate={setActiveTab} />}
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

      {/* Floating Action Button (FAB) - Mobile/Desktop Quick Actions */}
      <div className="fixed bottom-6 right-6 z-[150] md:bottom-10 md:right-10 flex flex-col items-end gap-3">
        {/* Quick Menu Items */}
        {isFabOpen && (
          <div className="flex flex-col items-end gap-3 mb-2 animate-in slide-in-from-bottom-10 fade-in duration-300">
            <button
              onClick={() => { setActiveTab('finance'); setIsFabOpen(false); }}
              className="flex items-center gap-3 px-4 py-2.5 glass bg-white/90 dark:bg-slate-900/90 rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 hover:scale-105 transition-all text-emerald-600 dark:text-emerald-400 font-black text-xs uppercase tracking-widest"
            >
              <span>{language === 'vi' ? 'Sổ chi tiêu' : 'Finance'}</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <FiTrendingUp />
              </div>
            </button>
            <button
              onClick={() => { setActiveTab('meals'); setIsFabOpen(false); }}
              className="flex items-center gap-3 px-4 py-2.5 glass bg-white/90 dark:bg-slate-900/90 rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 hover:scale-105 transition-all text-amber-600 dark:text-amber-400 font-black text-xs uppercase tracking-widest"
            >
              <span>{language === 'vi' ? 'Bữa ăn' : 'Meal Plan'}</span>
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <FiCoffee />
              </div>
            </button>
            <button
              onClick={() => { setActiveTab('calendar'); setIsFabOpen(false); }}
              className="flex items-center gap-3 px-4 py-2.5 glass bg-white/90 dark:bg-slate-900/90 rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 hover:scale-105 transition-all text-primary font-black text-xs uppercase tracking-widest"
            >
              <span>{language === 'vi' ? 'Sự kiện' : 'New Event'}</span>
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <FiCalendar />
              </div>
            </button>
          </div>
        )}

        {/* Main Tigger Button */}
        <button
          onClick={() => setIsFabOpen(!isFabOpen)}
          className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl md:rounded-3xl flex items-center justify-center text-2xl md:text-3xl text-white shadow-2xl transition-all duration-500 active:scale-95 ${
            isFabOpen
              ? 'bg-slate-900 dark:bg-white dark:text-slate-950 rotate-[135deg] scale-110'
              : 'bg-primary hover:bg-primary/90 shadow-primary/40'
          }`}
        >
          <FiPlus />
        </button>
      </div>

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
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tighter italic uppercase">
              {language === 'vi' ? 'Trung tâm ' : 'Menu '}<span className="text-primary not-italic">{language === 'vi' ? 'Hệ thống' : 'Hub'}</span>
            </h3>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-sm transition-all border border-black/5 dark:border-white/5 text-slate-600 dark:text-slate-400"
            >
              ✕
            </button>
          </div>

          {/* User Profile Summary */}
          <div className="px-8 py-6 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:bg-primary transition-all group-hover:text-white">
                <FiHome size={16} />
              </div>
              <span className="font-extrabold text-lg md:text-xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">Family Hub</span>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 border border-black/5 dark:border-white/5 rounded-lg flex items-center justify-center text-xl text-primary shadow-lg">
                <FiUser />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-sm text-slate-900 dark:text-slate-100">{user?.name}</span>
                <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">{currentFamily?.name}</span>
              </div>
            </div>
          </div>

          {/* Navigation List */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
            <SidebarItem
              active={activeTab === 'dashboard'}
              onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
              icon={<FiMenu />}
              label={language === 'vi' ? 'Tổng quan' : 'Dashboard'}
            />
            <SidebarItem
              active={activeTab === 'calendar'}
              onClick={() => { setActiveTab('calendar'); setIsSidebarOpen(false); }}
              icon={<FiCalendar />}
              label={t('nav.calendarFull')}
            />
            <SidebarItem
              active={activeTab === 'chat'}
              onClick={() => { setActiveTab('chat'); setIsSidebarOpen(false); }}
              icon={<FiActivity />}
              label={t('nav.chatFull')}
            />
            <SidebarItem
              active={activeTab === 'family'}
              onClick={() => { setActiveTab('family'); setIsSidebarOpen(false); }}
              icon={<FiUser />}
              label={t('nav.familyFull')}
            />
            <SidebarItem
              active={activeTab === 'meals'}
              onClick={() => { setActiveTab('meals'); setIsSidebarOpen(false); }}
              icon={<FiCoffee />}
              label={t('nav.mealsFull')}
            />
            <SidebarItem
              active={activeTab === 'finance'}
              onClick={() => { setActiveTab('finance'); setIsSidebarOpen(false); }}
              icon={<FiTrendingUp />}
              label={t('nav.financeFull')}
            />
            {user?.globalRole === 'SUPER_ADMIN' && (
              <SidebarItem
                active={activeTab === 'admin'}
                onClick={() => { setActiveTab('admin'); setIsSidebarOpen(false); }}
                icon={<FiShield />}
                label={language === 'vi' ? 'Quản trị' : 'Admin Portal'}
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-xl font-black transition-all duration-300 group border ${
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 translate-x-2'
          : 'bg-slate-100/40 dark:bg-slate-900/40 text-slate-500 dark:text-slate-500 border-black/5 dark:border-white/5 hover:border-primary/20 hover:text-slate-900 dark:hover:text-slate-200 hover:translate-x-1'
      }`}
    >
      <span className="text-xl group-active:scale-125 transition-transform">{icon}</span>
      <span className="text-[11px] uppercase tracking-widest leading-none">{label}</span>
    </button>
  );
}

