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
import AiMemorySettings from '@/components/AiMemorySettings';
import FamilyNotes from '@/components/FamilyNotes';
import VisionDrafts from '@/components/VisionDrafts';
import WeatherBadge from '@/components/WeatherBadge';
import DailyTasks from '@/components/DailyTasks';
import MascotAvatar from '@/components/MascotAvatar';
import WelcomeOverlay from '@/components/WelcomeOverlay';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import Login from '@/components/Login';
import { PENDING_CHAT_PROMPT_KEY } from '@/lib/storage-keys';
import { FiHome, FiMenu, FiUser, FiCalendar, FiActivity, FiCoffee, FiTrendingUp, FiShield, FiChevronDown, FiCheck, FiBookOpen, FiImage, FiCheckCircle } from 'react-icons/fi';

type TabType = 'dashboard' | 'calendar' | 'chat' | 'family' | 'meals' | 'finance' | 'notes' | 'vision-drafts' | 'admin' | 'settings' | 'notifications' | 'profile' | 'ai-memory' | 'daily-tasks';


export default function Home({ params }: { readonly params: { readonly slug?: readonly string[] } }) {
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user, isAuthenticated, isLoading, currentFamilyId, setCurrentFamilyId } = useAuth();
  const { t, language } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFamilyDropdownOpen, setIsFamilyDropdownOpen] = useState(false);
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
      <WelcomeOverlay userName={user?.name} onNavigateToChat={() => setActiveTab('chat')} />
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}

      {/* Main static header area */}
      <div className="hidden">
        <div className="hidden md:block absolute top-3 left-2 md:top-8 md:left-8 z-50">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="w-10 h-10 md:w-13 md:h-13 glass rounded-xl md:rounded-2xl flex items-center justify-center text-lg md:text-2xl hover:bg-white/10 active:scale-90 transition-all shadow-xl shadow-primary/10 border-white/20"
          >
            <FiMenu />
          </button>
        </div>

        <header className="pt-16 md:pt-16 pb-3 md:pb-4 relative z-10 text-center">
          <div className="hidden md:flex absolute top-3 right-3 md:top-8 md:right-8 items-center gap-2 md:gap-4">
            <WeatherBadge variant="full" />
             {/* Family Selection (Optional if multiple) */}
            {families.length > 1 && (
              <div ref={familyDropdownRef} className="relative">
                <button
                  onClick={() => setIsFamilyDropdownOpen(!isFamilyDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/40 hover:text-primary transition-all shadow-sm"
                >
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span>{currentFamily?.name || t('nav.family')}</span>
                  <FiChevronDown size={12} className={`transition-transform duration-200 ${isFamilyDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isFamilyDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-52 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-2 space-y-0.5">
                      {/* All families option */}
                      <button
                        onClick={() => { setCurrentFamilyId('all'); setIsFamilyDropdownOpen(false); }}
                        className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
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
                          className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
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
          <div className="hidden md:inline-flex items-center gap-3 rounded-2xl border border-border/50 bg-card/50 px-4 py-2 shadow-sm backdrop-blur-md">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
              <FiHome />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Family<span className="text-primary">Hub</span>
              </h1>
              {user && (
                <p className="text-xs font-semibold text-slate-500">
                  {t('nav.welcome')} {user.name}
                  {currentFamily ? ` · ${currentFamily.name}` : ''}
                </p>
              )}
            </div>
          </div>
          {user && (
            <div className="mt-2 flex flex-col items-center gap-1 md:hidden">
              <p className="text-muted-foreground font-bold text-lg">
                {t('nav.welcome')} {user.name}
              </p>
              {currentFamily && (
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold text-xs">
                   {currentFamily.name}
                </span>
              )}
            </div>
          )}
        </header>
      </div>

      {/* Sticky Bar */}
      <div className="fixed top-0 left-0 right-0 z-[100] translate-y-0 opacity-100 transition-all duration-300 border-b border-border/70">
        <header className="bg-background/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-3 md:px-8 py-2 flex justify-between items-center gap-2 md:gap-4 min-h-14">
            {/* Menu Left (Sticky) */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="w-10 h-10 bg-card rounded-xl flex items-center justify-center text-xl hover:bg-muted active:scale-95 transition-all border border-border shrink-0"
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
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                  <FiHome className="text-primary text-lg" />
                </div>
                <div className="hidden sm:block text-left">
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    Family <span className="text-primary">Hub</span>
                  </h1>
                </div>
              </div>
            </div>

            {/* Shortcut */}
            <div className="shrink-0 items-center flex gap-2 md:gap-4">
              <WeatherBadge />
              {families.length > 1 && (
                <div ref={stickyFamilyDropdownRef} className="relative">
                  <button
                    onClick={() => setIsFamilyDropdownOpen(!isFamilyDropdownOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-primary/40 hover:text-primary transition-all"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>{currentFamily?.name || t('nav.family')}</span>
                    <FiChevronDown size={10} className={`transition-transform duration-200 ${isFamilyDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isFamilyDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-border rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-1.5 space-y-0.5">
                        {/* All families option */}
                        <button
                          onClick={() => { setCurrentFamilyId('all'); setIsFamilyDropdownOpen(false); }}
                          className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
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
                          className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
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
               <NotificationDropdown onOpenAiChat={(prompt) => {
                 if (prompt) sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, prompt);
                 setActiveTab('chat');
               }} />

            </div>
          </div>
        </header>
      </div>

      {/* Content Area */}
      <main className={`${activeTab === 'chat' ? 'max-w-[1800px] px-2 md:px-6 xl:px-10' : 'max-w-6xl px-3 md:px-8'} mx-auto pt-16 pb-3 md:pb-4 min-h-[calc(100dvh-56px)]`}>
        <NewMonthModal />
        <div className={`bg-card border border-border/70 shadow-md ${activeTab === 'chat' ? 'rounded-2xl p-2 md:p-4 xl:p-6' : 'rounded-2xl p-4 md:p-8'} min-h-[calc(100dvh-84px)] md:min-h-[calc(100dvh-96px)]`}>
          {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'calendar' && <Calendar />}
          {activeTab === 'chat' && <Chatbot />}
          {activeTab === 'family' && <FamilyMembers />}
          {activeTab === 'meals' && <MealPlanner />}
          {activeTab === 'finance' && <Finance />}
          {activeTab === 'notes' && <FamilyNotes />}
          {activeTab === 'vision-drafts' && <VisionDrafts />}
          {activeTab === 'daily-tasks' && <DailyTasks />}
          {activeTab === 'admin' && <AdminDashboard />}
          {(activeTab === 'settings' || activeTab === 'profile') && <Settings onNavigate={setActiveTab} />}
          {activeTab === 'notifications' && <NotificationSettings onBack={() => setActiveTab('settings')} />}
          {activeTab === 'ai-memory' && <AiMemorySettings onBack={() => setActiveTab('settings')} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="hidden">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-muted-foreground font-semibold text-xs md:text-sm">
            © Family Calendar. Made with ❤️ for your home.
          </p>
        </div>
      </footer>

      {/* Floating AI Mascot Assistant Button (Bottom Right Corner) */}
      <div className="fixed bottom-6 right-6 z-[150] md:bottom-8 md:right-8 flex items-center justify-center">
        <MascotAvatar
          size="md"
          isWaving={true}
          showBubble={activeTab !== 'chat'}
          hoverOnlyBubble={true}
          bubbleText={language === 'vi' ? 'Trò chuyện với AI ✨' : 'Chat with AI ✨'}
          bubblePosition="left"
          onClick={() => setActiveTab('chat')}
        />
      </div>

      {/* Premium Sidebar Overlay */}
      <div className={`fixed inset-0 z-[200] transition-all duration-500 ${isSidebarOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-slate-950/20 backdrop-blur-sm transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsSidebarOpen(false)}
        />

        {/* Sidebar Panel */}
        <aside
          className={`absolute top-0 left-0 h-full w-72 md:w-80 bg-background/95 backdrop-blur-md border-r border-border shadow-xl transition-transform duration-300 ease-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {/* Sidebar Header */}
          <div className="p-6 pb-4 flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
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
          <div className="px-6 py-5 border-b border-border">
            <div className="flex items-center gap-3 mt-4">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 border border-black/5 dark:border-white/5 rounded-lg flex items-center justify-center text-xl text-primary shadow-lg">
                <FiUser />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{user?.name}</span>
                <span className="text-xs text-slate-500 font-semibold">{currentFamily?.name}</span>
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
            <SidebarItem
              active={activeTab === 'notes'}
              onClick={() => { setActiveTab('notes'); setIsSidebarOpen(false); }}
              icon={<FiBookOpen />}
              label={language === 'vi' ? 'Sổ tay gia đình' : 'Family Notes'}
            />
            <SidebarItem
              active={activeTab === 'vision-drafts'}
              onClick={() => { setActiveTab('vision-drafts'); setIsSidebarOpen(false); }}
              icon={<FiImage />}
              label={language === 'vi' ? 'Draft ảnh AI' : 'Vision Drafts'}
            />
            <SidebarItem
              active={activeTab === 'daily-tasks'}
              onClick={() => { setActiveTab('daily-tasks'); setIsSidebarOpen(false); }}
              icon={<FiCheckCircle />}
              label={language === 'vi' ? 'Việc trong ngày' : 'Daily Tasks'}
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
          <div className="p-6 text-center opacity-50">
             <p className="text-xs font-semibold">Family v2.0</p>
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
      className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl font-semibold transition-all duration-200 group border ${
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/15'
          : 'bg-card text-slate-500 dark:text-slate-500 border-border hover:border-primary/20 hover:text-slate-900 dark:hover:text-slate-200'
      }`}
    >
      <span className="text-xl group-active:scale-125 transition-transform">{icon}</span>
      <span className="text-sm leading-none">{label}</span>
    </button>
  );
}
