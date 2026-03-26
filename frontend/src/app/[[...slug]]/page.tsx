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

import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import Login from '@/components/Login';

type TabType = 'calendar' | 'chat' | 'family' | 'meals' | 'admin' | 'settings' | 'notifications';

export default function Home({ params }: { readonly params: { readonly slug?: readonly string[] } }) {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation();

  const slugTab = params.slug?.[0] as TabType;
  const activeTab: TabType = slugTab || 'calendar';

  const setActiveTab = (tab: TabType) => {
    router.push('/' + (tab === 'calendar' ? '' : tab));
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
      
      {/* Background Decorative Elements */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100/30 dark:bg-indigo-900/10 rounded-full blur-[120px] -z-10" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/30 dark:bg-blue-900/10 rounded-full blur-[120px] -z-10" />

      {/* Main static header area */}
      <div className={`transition-opacity duration-300 min-h-[280px] md:min-h-[350px] ${isScrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <header className="pt-8 md:pt-16 pb-4 md:pb-8 relative z-10 text-center">
          <div className="absolute top-4 right-4 md:top-8 md:right-8">
            <NotificationDropdown />
          </div>
          <div className="inline-block animate-float mb-4 md:mb-6">
            <span className="text-6xl md:text-9xl">👨‍👩‍👧‍👦</span>
          </div>
          <h1 className="text-4xl md:text-8xl font-black tracking-tight leading-tight">
            Family <span className="gradient-text">Calendar</span>
          </h1>
          {user && (
            <p className="mt-4 text-muted-foreground font-bold text-lg">
              {t('nav.welcome')} {user.name} 👋
            </p>
          )}
        </header>

        {/* Regular nav bar */}
        <nav className="mt-4 mb-8 z-40 relative px-4">
          <div className="max-w-fit mx-auto">
            <div className="glass p-1 md:p-1.5 rounded-2xl flex gap-1 shadow-indigo-100/10 dark:shadow-none overflow-x-auto no-scrollbar max-w-[92vw]">
              <TabButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon="📅" label={t('nav.calendar')} fullLabel={t('nav.calendarFull')} />
              <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon="🤖" label={t('nav.chat')} fullLabel={t('nav.chatFull')} />
              <TabButton active={activeTab === 'family'} onClick={() => setActiveTab('family')} icon="👪" label={t('nav.family')} fullLabel={t('nav.familyFull')} />
              <TabButton active={activeTab === 'meals'} onClick={() => setActiveTab('meals')} icon="🍽️" label={t('nav.meals')} fullLabel={t('nav.mealsFull')} color="orange" />
              {user?.globalRole === 'SUPER_ADMIN' && (
                <TabButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon="🛡️" label={t('nav.admin')} fullLabel={t('nav.admin')} color="red" />
              )}
              <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon="⚙️" label={t('nav.settings')} fullLabel={t('nav.settings')} />
            </div>
          </div>
        </nav>
      </div>

      {/* Sticky Bar */}
      <div className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 border-b border-border/60 ${isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <header className="bg-background/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-2 md:px-8 py-2 md:py-2.5 flex justify-between items-center gap-2 md:gap-4">
            {/* Logo Left */}
            <div 
              className="flex items-center gap-2 md:gap-3 group cursor-pointer transition-transform active:scale-95 shrink-0" 
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setActiveTab('calendar');
              }}
            >
              <div className="w-8 h-8 md:w-10 md:h-10 bg-card rounded-xl flex items-center justify-center shadow-sm border border-border/40">
                <span className="text-lg md:text-xl">👨‍👩‍👧‍👦</span>
              </div>
              <div className="hidden lg:block">
                <h1 className="text-sm md:text-base font-black tracking-tighter leading-tight">
                  Family <span className="gradient-text">Calendar</span>
                </h1>
              </div>
            </div>

            {/* Navigation Tabs (Centered) */}
            <nav className="flex-1 flex justify-center overflow-x-auto no-scrollbar px-1">
              <div className="bg-muted/50 p-0.5 rounded-xl flex gap-0.5 shadow-inner min-w-max">
                <TabButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon="📅" label={t('nav.calendar')} fullLabel={t('nav.calendarFull')} isCompact />
                <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon="🤖" label={t('nav.chat')} fullLabel={t('nav.chatFull')} isCompact />
                <TabButton active={activeTab === 'family'} onClick={() => setActiveTab('family')} icon="👪" label={t('nav.family')} fullLabel={t('nav.familyFull')} isCompact />
                <TabButton active={activeTab === 'meals'} onClick={() => setActiveTab('meals')} icon="🍽️" label={t('nav.meals')} fullLabel={t('nav.mealsFull')} color="orange" isCompact />
                {user?.globalRole === 'SUPER_ADMIN' && (
                  <TabButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon="🛡️" label={t('nav.admin')} fullLabel={t('nav.admin')} color="red" isCompact />
                )}
                <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon="⚙️" label={t('nav.settings')} fullLabel={t('nav.settings')} isCompact />
              </div>
            </nav>

            {/* Shortcut */}
            <div className="shrink-0 items-center flex gap-2">
               <NotificationDropdown />
            </div>
          </div>
        </header>
      </div>


      {/* Content Area */}
      <main className="max-w-6xl mx-auto px-3 md:px-8 pb-20 md:pb-32 min-h-[60vh] animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <NewMonthModal />
        <div className="glass rounded-[2.5rem] p-4 md:p-12 min-h-[500px] border-white/40 dark:border-slate-800/40 shadow-2xl">
          {activeTab === 'calendar' && <Calendar />}
          {activeTab === 'chat' && <Chatbot />}
          {activeTab === 'family' && <FamilyMembers />}
          {activeTab === 'meals' && <MealPlanner />}
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
    </div>
  );
}

function TabButton({ 
  active, 
  onClick, 
  icon, 
  label, 
  fullLabel, 
  color = 'indigo',
  isCompact = false
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: string;
  readonly label: string;
  readonly fullLabel: string;
  readonly color?: 'indigo' | 'orange' | 'red';
  readonly isCompact?: boolean;
}) {
  const colorClasses = {
    indigo: active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 hover:bg-card hover:text-indigo-600',
    orange: active ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 dark:shadow-none' : 'text-slate-500 hover:bg-card hover:text-orange-500',
    red: active ? 'bg-red-600 text-white shadow-lg shadow-red-200 dark:shadow-none' : 'text-slate-500 hover:bg-card hover:text-red-600',
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1 md:gap-2 rounded-xl font-black transition-all duration-300 shrink-0 ${
        isCompact ? 'px-2 md:px-5 py-1.5 md:py-2 text-[10px] md:text-xs' : 'px-3 md:px-8 py-1.5 md:py-3 text-xs md:text-sm'
      } ${colorClasses[color]}`}
    >
      <span className="text-base md:text-lg">{icon}</span>
      <span className="hidden sm:inline-block">{fullLabel}</span>
      <span className="sm:hidden inline-block">{label}</span>
    </button>
  );
}
