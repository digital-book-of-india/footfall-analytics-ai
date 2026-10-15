import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ShopProvider, useShop } from './context/ShopContext';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { CameraManagementPage } from './pages/CameraManagementPage';
import { ReportsPage } from './pages/ReportsPage';
import { ShopProfilePage } from './pages/ShopProfilePage';
import { AuthPage } from './pages/AuthPage';
import { NewShopModal } from './components/NewShopModal';
import { RefreshCwIcon } from './components/icons';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isLoading: shopLoading } = useShop();

  const [currentTab, setCurrentTab] = useState<'dashboard' | 'cameras' | 'reports' | 'settings'>('dashboard');
  const [showNewShopModal, setShowNewShopModal] = useState<boolean>(false);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <RefreshCwIcon size={32} className="animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-semibold tracking-wider uppercase text-blue-200">
          Loading Owner Portal...
        </p>
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'dashboard' && (
          <DashboardPage
            onNavigateToCameras={() => setCurrentTab('cameras')}
            onNavigateToReports={() => setCurrentTab('reports')}
          />
        )}
        {currentTab === 'cameras' && <CameraManagementPage />}
        {currentTab === 'reports' && <ReportsPage />}
        {currentTab === 'settings' && <ShopProfilePage />}
      </main>

      <NewShopModal
        isOpen={showNewShopModal}
        onClose={() => setShowNewShopModal(false)}
      />

      {/* Footer with Compliance & Scope Lock notes */}
      <footer className="bg-white border-t border-gray-200 py-6 text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-bold text-gray-700">DBI Intelligence • AI Footfall Analytics MVP</span>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Normal footfall analytics only. No theft detection, rack tracking, face recognition, or customer identity profiling.
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
