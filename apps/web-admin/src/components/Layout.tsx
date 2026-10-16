import React from 'react';
import { 
  LayoutDashboard, 
  Store, 
  Users, 
  Video, 
  ShieldCheck, 
  LogOut 
} from 'lucide-react';

const NavLink: React.FC<{
  to: string;
  end?: boolean;
  className?: (props: { isActive: boolean }) => string;
  children: React.ReactNode;
}> = ({ to, className, children }) => {
  const isActive = window.location.pathname === to;
  const classes = typeof className === 'function' ? className({ isActive }) : className;
  return (
    <a href={to} className={classes}>
      {children}
    </a>
  );
};

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/shops', label: 'Shops', icon: Store },
    { to: '/owners', label: 'Shop Owners', icon: Users },
    { to: '/cameras', label: 'Camera Health', icon: Video },
    { to: '/audit-logs', label: 'Audit Logs', icon: ShieldCheck },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shadow-sm">
        <div>
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            <img 
              src="/L1.png" 
              alt="DBI Intelligence Logo" 
              className="w-10 h-10 object-contain rounded-md"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.endsWith('/logo.jpeg')) {
                  target.src = '/logo.jpeg';
                }
              }} 
            />
            <div>
              <h1 className="font-bold text-sm tracking-wide text-slate-900 leading-tight">DBI INTELLIGENCE</h1>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 inline-block mt-0.5">
                SUPER ADMIN
              </span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition ${
                      isActive
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="truncate pr-2">
            <div className="text-xs font-semibold text-slate-800 truncate">admin@dbi.ai</div>
            <div className="text-[10px] text-emerald-600 font-medium">SUPER_ADMIN</div>
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

      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
