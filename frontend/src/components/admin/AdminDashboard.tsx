import React, { useState } from 'react';
import FamilyManager from './FamilyManager';
import UserManager from './UserManager';
import AiDashboard from './AiDashboard';

type AdminTab = 'families' | 'users' | 'ai-monitor';

export default function AdminDashboard() {
  const [adminTab, setAdminTab] = useState<AdminTab>('families');

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'families', label: 'Gia đình' },
    { id: 'users', label: 'Người dùng' },
    { id: 'ai-monitor', label: '🤖 AI Monitor' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Hệ thống <span className="text-red-600">Quản trị</span></h2>
          <p className="text-slate-500 font-medium">Quản lý toàn bộ families và người dùng trong hệ thống.</p>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl self-start gap-1 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setAdminTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                adminTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-red-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {adminTab === 'families' && <FamilyManager onTabChange={(t) => setAdminTab(t as AdminTab)} />}
        {adminTab === 'users' && <UserManager />}
        {adminTab === 'ai-monitor' && <AiDashboard />}
      </div>
    </div>
  );
}
