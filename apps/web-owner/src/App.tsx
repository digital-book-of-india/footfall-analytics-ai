import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ShopProvider, useShop } from './context/ShopContext';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { CameraManagementPage } from './pages/CameraManagementPage';
import { LiveViewPage } from './pages/LiveViewPage';
import { AlertsPage } from './pages/AlertsPage';
import { ReportsPage } from './pages/ReportsPage';
import { ShopProfilePage } from './pages/ShopProfilePage';
import { AuthPage } from './pages/AuthPage';
import { NewShopModal } from './components/NewShopModal';
import { RefreshCwIcon } from './components/icons';
import { DbiLogo } from './components/DbiLogo';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isLoading: shopLoading } = useShop();

  const [currentTab, setCurrentTab] = useState<'dashboard' | 'cameras' | 'live' | 'alerts' | 'reports' | 'settings'>('dashboard');
  const [showNewShopModal, setShowNewShopModal] = useState<boolean>(false);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-gray-50 to-blue-50/40 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Subtle ambient light dot pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
        
        <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-xl shadow-slate-200/80 border border-gray-200/90 flex flex-col items-center max-w-[340px] sm:max-w-sm w-full relative z-10">
          <DbiLogo size="md" />
          <div className="mt-5 flex items-center gap-2.5 text-blue-600">
            <RefreshCwIcon size={18} className="animate-spin text-blue-600" />
            <p className="text-xs font-bold tracking-wider uppercase text-gray-700">
              Loading Owner Portal...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenNewShopModal={() => setShowNewShopModal(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
        {currentTab === 'dashboard' && (
          <DashboardPage
            onNavigateToCameras={() => setCurrentTab('cameras')}
            onNavigateToReports={() => setCurrentTab('reports')}
            onOpenNewShopModal={() => setShowNewShopModal(true)}
          />
        )}
        {currentTab === 'cameras' && (
          <CameraManagementPage
            onOpenNewShopModal={() => setShowNewShopModal(true)}
            onNavigateToLive={() => setCurrentTab('live')}
          />
        )}
        {currentTab === 'live' && <LiveViewPage />}
        {currentTab === 'alerts' && (
          <AlertsPage onOpenNewShopModal={() => setShowNewShopModal(true)} />
        )}
        {currentTab === 'reports' && (
          <ReportsPage onOpenNewShopModal={() => setShowNewShopModal(true)} />
        )}
        {currentTab === 'settings' && (
          <ShopProfilePage onOpenNewShopModal={() => setShowNewShopModal(true)} />
        )}
      </main>

      <NewShopModal
        isOpen={showNewShopModal}
        onClose={() => setShowNewShopModal(false)}
      />

      {/* Footer with Compliance & Scope Lock notes */}
      <footer className="hidden md:block bg-white border-t border-gray-200 py-6 text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-bold text-gray-700">DBI Intelligence • AI Footfall Analytics MVP</span>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Footfall counting, plus optional security zone watching (e.g. a shutter) you can enable per camera.
              No face recognition or customer identity profiling.
            </p>
          </div>
          <div className="text-right text-[11px] text-gray-400">
            Tenant Isolated • Encrypted Stream Access • Version 1.0-mvp
          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ShopProvider>
        <AppContent />
      </ShopProvider>
    </AuthProvider>
  );
};

export default App;
