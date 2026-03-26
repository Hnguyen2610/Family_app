import React, { useState } from 'react';
import FamilyManager from './FamilyManager';
import UserManager from './UserManager';

export default function AdminDashboard() {
  const [adminTab, setAdminTab] = useState<'families' | 'users'>('families');

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Hệ thống <span className="text-red-600">Quản trị</span></h2>
          <p className="text-slate-500 font-medium">Quản lý toàn bộ families và người dùng trong hệ thống.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => setAdminTab('families')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              adminTab === 'families' 
                ? 'bg-white text-red-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Gia đình
          </button>
          <button
            onClick={() => setAdminTab('users')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              adminTab === 'users' 
                ? 'bg-white text-red-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Người dùng
          </button>
        </div>
      </div>

      <div className="mt-8">
        {adminTab === 'families' ? <FamilyManager /> : <UserManager />}
      </div>
    </div>
  );
}
