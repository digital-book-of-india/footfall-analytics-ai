import React, { useState } from 'react';
import { 
  Building2, 
  Camera, 
  FileText, 
  LayoutDashboard, 
  LogOut, 
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

  const navItems: { key: TabKey; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'shops', label: 'Shops', icon: Building2 },
    { key: 'owners', label: 'Shop Owners', icon: Users },
    { key: 'cameras', label: 'Camera Health', icon: Camera },
    { key: 'audit-logs', label: 'Audit Logs', icon: FileText },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Light Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shadow-sm flex-shrink-0">
        <div>
          {/* Logo & Brand Header */}
          <div className="p-4 border-b border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <img 
                src="/L1.png" 
                alt="Digital Book of India" 
                className="h-9 w-auto max-w-[150px] object-contain mix-blend-multiply" 
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.endsWith('/logo.jpeg')) {
                    target.src = '/logo.jpeg';
                  }
                }}
              />
              <span className="text-[9px] uppercase font-bold tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                SUPER ADMIN
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition text-left ${
                    isActive
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Admin Bar */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="truncate pr-2">
            <div className="text-xs font-semibold text-slate-800 truncate">{user?.email || 'admin@dbi.ai'}</div>
            <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">{user?.role || 'SUPER_ADMIN'}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Light Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          {tab === 'overview' && <OverviewPage />}
          {tab === 'shops' && <ShopsPage />}
          {tab === 'owners' && <OwnersPage />}
          {tab === 'cameras' && <CamerasPage />}
          {tab === 'audit-logs' && <AuditLogsPage />}
        </div>
      </main>
    </div>
  );
}
