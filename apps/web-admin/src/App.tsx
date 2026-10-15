import React, { useState } from 'react';
import { 
  Building2, 
  Camera, 
  FileText, 
  LayoutDashboard, 
  LogOut, 
  ShieldAlert, 
  Users 
} from 'lucide-react';
import { TabKey } from './types';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ShopsPage } from './pages/ShopsPage';
import { OwnersPage } from './pages/OwnersPage';
import { CamerasPage } from './pages/CamerasPage';
import { AuditLogsPage } from './pages/AuditLogsPage';

export default function App() {
  const [user, setUser] = useState<any>(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [tab, setTab] = useState<TabKey>('overview');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (!user) {
    return <LoginPage onLoginSuccess={(loggedUser) => setUser(loggedUser)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 flex-shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <ShieldAlert className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <div>
              <span className="font-bold tracking-wide text-sm block">DBI INTELLIGENCE</span>
              <span className="text-[10px] text-amber-500 font-semibold tracking-wider uppercase">Super Admin</span>
            </div>
          </div>
          <nav className="space-y-1">
            <button onClick={() => setTab('overview')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition ${tab === 'overview' ? 'bg-amber-600 text-white font-medium' : 'hover:bg-slate-800 text-slate-400'}`}>
              <LayoutDashboard className="w-4 h-4" /> Overview
            </button>
            <button onClick={() => setTab('shops')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition ${tab === 'shops' ? 'bg-amber-600 text-white font-medium' : 'hover:bg-slate-800 text-slate-400'}`}>
              <Building2 className="w-4 h-4" /> Shops
            </button>
            <button onClick={() => setTab('owners')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition ${tab === 'owners' ? 'bg-amber-600 text-white font-medium' : 'hover:bg-slate-800 text-slate-400'}`}>
              <Users className="w-4 h-4" /> Shop Owners
            </button>
            <button onClick={() => setTab('cameras')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition ${tab === 'cameras' ? 'bg-amber-600 text-white font-medium' : 'hover:bg-slate-800 text-slate-400'}`}>
              <Camera className="w-4 h-4" /> Camera Health
            </button>
            <button onClick={() => setTab('audit')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition ${tab === 'audit' ? 'bg-amber-600 text-white font-medium' : 'hover:bg-slate-800 text-slate-400'}`}>
              <FileText className="w-4 h-4" /> Audit Logs
            </button>
          </nav>
        </div>
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between px-2 mt-4 md:mt-0">
          <div className="truncate max-w-[140px]">
            <p className="text-xs font-medium text-slate-200">{user.email}</p>
            <p className="text-[10px] text-emerald-400">SUPER_ADMIN</p>
          </div>
          <button onClick={handleLogout} title="Logout" className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {tab === 'overview' && <OverviewPage />}
        {tab === 'shops' && <ShopsPage />}
        {tab === 'owners' && <OwnersPage />}
        {tab === 'cameras' && <CamerasPage />}
        {tab === 'audit' && <AuditLogsPage />}
      </main>
    </div>
  );
}
