'use client';

import { useState, useEffect } from 'react';
import { usersAPI, mealsAPI } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { FiUsers, FiCpu, FiCheckCircle } from 'react-icons/fi';
import { Button } from "@/components/ui/button";
import { useAuth } from '@/hooks/useAuth';
import MealPreferenceModal from './MealPreferenceModal';
import { useTranslation } from '@/lib/i18n';
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
  const { t, language } = useTranslation();
  const { user, currentFamilyId } = useAuth();
  const familyId = currentFamilyId || '';

  useEffect(() => {
    if (familyId) fetchMembers();
  }, [familyId]);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const response = await usersAPI.getAll(familyId, user?.id);
      setMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      toast.error(t('family.toastError'));
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleGenerateMenu = async () => {
    setGeneratingMenu(true);
    try {
      const response = await mealsAPI.generateMenu(familyId, user?.id);
      setGeneratedMenu(response.data);
      toast.success(t('common.success'));
    } catch (error) {
      console.error('Failed to generate menu', error);
      toast.error(t('common.error'));
    } finally {
      setGeneratingMenu(false);
    }
  };

  if (!currentFamilyId && user?.globalRole !== 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-8 rounded-2xl border border-border bg-card shadow-sm">
        <div className="w-20 h-20 bg-muted border border-border rounded-2xl flex items-center justify-center text-4xl text-primary">
          <FiCpu />
        </div>
        <div className="space-y-4 max-w-sm">
          <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{t('meal.accessDenied')}</h3>
          <p className="text-slate-500 font-medium text-sm leading-relaxed">{t('meal.noFamilyFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-white/5 pb-10">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-md text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
            {t('meal.nutritionEngine')}
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight pb-3 leading-[1.2]">
            {t('meal.title')} <span className="text-primary">{t('meal.subtitle')}</span>
          </h2>
          <p className="text-slate-500 font-medium text-sm md:text-base">
            {t('meal.optimize')}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-10 items-start">

        {/* Members Grid */}
        <div className="lg:col-span-8">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-8 flex items-center gap-3">
             <FiUsers className="text-primary" /> {t('meal.activeNodes')}
          </h3>

          {loadingMembers ? (
            <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-border bg-card shadow-sm">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-600 font-semibold text-xs">Querying members...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-24 rounded-2xl border border-dashed border-border bg-card shadow-sm">
              <FiUsers className="text-5xl mb-6 mx-auto opacity-10 text-primary" />
              <p className="text-slate-400 font-semibold text-sm">No members found</p>
              <p className="text-slate-600 text-[10px] mt-3">Synchronize family data to proceed.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {members.map((member) => (
                  <div
                    key={member.id}
                    onClick={() => setSelectedMember(member)}
                    className="group relative p-8 bg-slate-100/40 dark:bg-slate-900/40 rounded-2xl border border-black/5 dark:border-white/5 hover:border-primary/30 transition-all cursor-pointer flex flex-col items-center text-center gap-6 overflow-hidden"
                  >
                    <div className="w-16 h-16 rounded-xl bg-muted border border-border text-primary flex items-center justify-center text-2xl font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors text-lg truncate w-full px-2">{member.name}</h4>
                      {member.role && (
                        <span className="text-xs font-semibold text-slate-500 mt-1 block">{member.role}</span>
                      )}
                    </div>
                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Menu Generator Block */}
        <div className="lg:col-span-4 lg:sticky lg:top-32 space-y-8">
          <div className="p-8 rounded-2xl border border-primary/30 bg-card relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-6 opacity-5">
               <FiCpu size={100} />
            </div>

            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-3 relative z-10">
              <FiCpu className="text-primary" /> {language === 'vi' ? 'Động cơ dinh dưỡng' : 'Nutrition Core'}
            </h3>
            <p className="text-slate-500 text-xs font-semibold mb-8 relative z-10">
              {t('meal.optimize')}
            </p>

            <Button
              onClick={handleGenerateMenu}
              disabled={generatingMenu || members.length === 0}
              className="w-full flex justify-center items-center gap-3 h-14 relative z-10"
            >
              {generatingMenu ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  {t('meal.synthesis')}
                </>
              ) : (
                <>
                  <FiCpu /> {t('meal.execute')}
                </>
              )}
            </Button>
          </div>

          {/* Generated Result Container */}
          {generatedMenu && (
            <div className="p-8 border border-border rounded-2xl animate-in slide-in-from-right-8 duration-300 flex flex-col gap-6 bg-card shadow-sm">
              <div className="flex items-center gap-2 text-primary font-bold text-sm mb-2">
                <FiCheckCircle /> {t('meal.syncedResult')}
              </div>

              <div className="space-y-4">
                {[
                  { label: t('meal.category.MAIN_COURSE'), name: generatedMenu.mainCourse?.name || t('meal.standardUnit'), icon: <FiCheckCircle />, color: 'primary' },
                  { label: t('meal.category.VEGETABLE'), name: generatedMenu.vegetable?.name || t('meal.standardUnit'), icon: <FiCheckCircle />, color: 'primary' },
                  { label: t('meal.category.SOUP'), name: generatedMenu.soup?.name || t('meal.standardUnit'), icon: <FiCheckCircle />, color: 'primary' }
                ].map((item, idx) => (
                  <div key={idx} className="p-5 bg-slate-50 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 rounded-xl flex items-center gap-4 group/item hover:border-primary/20 transition-all shadow-sm">
                    <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-black/5 dark:border-white/5 flex items-center justify-center text-primary text-xl shadow-sm">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500 mb-1 group-hover/item:text-primary transition-colors">{item.label}</div>
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">{item.name}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-center text-slate-500 font-semibold mt-4">
                {t('meal.allocationArchived')}
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
