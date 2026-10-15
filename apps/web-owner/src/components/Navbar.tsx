import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import {
  ActivityIcon,
  StorefrontIcon,
  DashboardIcon,
  CctvCameraIcon,
  ReportChartIcon,
  GearSettingsIcon,
  SignalRadarIcon,
  LogOutIcon,
  PlusIcon,
  ChevronDownIcon
} from './icons';
import { api } from '../services/apiClient';

interface NavbarProps {
  currentTab: 'dashboard' | 'cameras' | 'reports' | 'settings';
  setCurrentTab: (tab: 'dashboard' | 'cameras' | 'reports' | 'settings') => void;
  onOpenNewShopModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, onOpenNewShopModal }) => {
  const { user, logout } = useAuth();
  const { shops, selectedShop, selectShop } = useShop();
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const isMock = api.isForceMock();

  const handleToggleMock = () => {
    api.setForceMock(!isMock);
    window.location.reload();
  };

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-gray-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand & App Title */}
          <div className="flex items-center gap-5">
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setCurrentTab('dashboard')}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-all">
                <ActivityIcon size={22} className="animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-blue-600 block leading-tight">
                  DBI Intelligence
                </span>
                <span className="text-lg font-bold text-gray-900 tracking-tight block">
                  Footfall Analytics
                </span>
              </div>
            </div>

            {/* Shop Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShopDropdownOpen(!shopDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50/80 hover:bg-gray-100 text-sm font-semibold text-gray-800 transition shadow-xs"
              >
                <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <StorefrontIcon size={14} />
                </div>
                <span className="max-w-[130px] sm:max-w-[170px] truncate">
                  {selectedShop ? selectedShop.name : 'No Shop Selected'}
                </span>
                <ChevronDownIcon size={13} className="text-gray-400" />
              </button>

              {shopDropdownOpen && (
                <div
                  className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 z-50 animate-fadeIn"
                  onMouseLeave={() => setShopDropdownOpen(false)}
                >
                  <div className="px-3.5 py-2 border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                    <span>Retail Stores</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px]">{shops.length}</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {shops.map(shop => (
                      <button
                        key={shop.id}
                        type="button"
                        onClick={() => {
                          selectShop(shop.id);
                          setShopDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between hover:bg-gray-50 transition ${
                          selectedShop?.id === shop.id ? 'bg-blue-50/70 text-blue-700 font-bold' : 'text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <StorefrontIcon size={14} className={selectedShop?.id === shop.id ? 'text-blue-600' : 'text-gray-400'} />
                          <span className="truncate">{shop.name}</span>
                        </div>
                        <span className="text-[11px] text-gray-400 ml-2 font-mono">{shop.timezone.split('/')[1] || shop.timezone}</span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShopDropdownOpen(false);
                        onOpenNewShopModal();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 rounded-xl flex items-center gap-2 font-bold transition"
                    >
                      <PlusIcon size={15} />
                      Add New Store Location
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => setCurrentTab('dashboard')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                currentTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
              }`}
            >
              <DashboardIcon size={16} />
              Dashboard
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('cameras')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                currentTab === 'cameras'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
              }`}
            >
              <CctvCameraIcon size={16} />
              Cameras & Lines
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('reports')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                currentTab === 'reports'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
              }`}
            >
              <ReportChartIcon size={16} />
              Reports & CSV
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('settings')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                currentTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
              }`}
            >
              <GearSettingsIcon size={16} />
              Store Settings
            </button>
          </nav>

          {/* User & Mode Controls */}
          <div className="flex items-center gap-3">
            {/* Mode switch helper with radar icon */}
            <button
              type="button"
              onClick={handleToggleMock}
              title="Toggle Mock adapter vs Live API calls"
              className={`text-xs px-3 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 shadow-xs transition hover:scale-102 ${
                isMock
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}
            >
              <SignalRadarIcon size={14} className={isMock ? 'text-amber-600' : 'text-emerald-600'} />
              <span className="hidden sm:inline">{isMock ? 'Mock API Active' : 'Live Stream Mode'}</span>
              <span className="sm:hidden">{isMock ? 'Mock' : 'Live'}</span>
            </button>

            {/* User Profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase border border-blue-200/80 shadow-xs">
                  {user?.name?.slice(0, 2) || 'SO'}
                </div>
                <span className="hidden sm:inline-block max-w-[120px] truncate font-bold text-xs text-gray-800">
                  {user?.name || 'Owner'}
                </span>
                <ChevronDownIcon size={12} className="text-gray-400" />
              </button>

              {userDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 z-50 animate-fadeIn"
                  onMouseLeave={() => setUserDropdownOpen(false)}
                >
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="text-[11px] text-gray-400 font-medium">Signed in as</p>
                    <p className="text-xs font-bold text-gray-800 truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[9px] font-extrabold bg-blue-50 text-blue-700 rounded-md border border-blue-200 uppercase tracking-wider">
                      {user?.role || 'SHOP_OWNER'}
                    </span>
                  </div>
                  <div className="p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 font-bold transition"
                    >
                      <LogOutIcon size={15} />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden border-t border-gray-100 py-2 justify-around">
          <button
            type="button"
            onClick={() => setCurrentTab('dashboard')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition ${
              currentTab === 'dashboard' ? 'text-blue-600 font-extrabold' : 'text-gray-500'
            }`}
          >
            <DashboardIcon size={18} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('cameras')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition ${
              currentTab === 'cameras' ? 'text-blue-600 font-extrabold' : 'text-gray-500'
            }`}
          >
            <CctvCameraIcon size={18} />
            Cameras
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('reports')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition ${
              currentTab === 'reports' ? 'text-blue-600 font-extrabold' : 'text-gray-500'
            }`}
          >
            <ReportChartIcon size={18} />
            Reports
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('settings')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition ${
              currentTab === 'settings' ? 'text-blue-600 font-extrabold' : 'text-gray-500'
            }`}
          >
            <GearSettingsIcon size={18} />
            Settings
          </button>
        </div>
      </div>
    </header>
  );
};
