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
    <header className="bg-white border-b border-gray-200/80 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-1.5 sm:gap-3">
          {/* Left section: Brand & Store Selector */}
          <div className="flex items-center gap-1.5 sm:gap-3 lg:gap-4 shrink-0">
            {/* Brand Logo & Name */}
            <div
              className="flex items-center gap-2 cursor-pointer select-none group"
              onClick={() => setCurrentTab('dashboard')}
              title="DBI Footfall Analytics Home"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/25 group-hover:scale-105 transition-transform duration-200 shrink-0">
                <ActivityIcon size={18} className="animate-pulse" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="hidden sm:inline text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-blue-600 leading-none">
                  DBI Intelligence
                </span>
                <span className="text-xs sm:text-base font-extrabold text-gray-900 tracking-tight leading-snug whitespace-nowrap">
                  <span className="sm:hidden">DBI </span>Footfall
                </span>
              </div>
            </div>

            {/* Subtle Divider */}
            <div className="hidden sm:block h-6 w-px bg-gray-200 mx-0.5" />

            {/* Store Switcher Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShopDropdownOpen(!shopDropdownOpen)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] sm:text-xs font-semibold text-gray-800 transition whitespace-nowrap shadow-xs"
              >
                <StorefrontIcon size={13} className="text-blue-600 shrink-0" />
                <span className="max-w-[70px] sm:max-w-[150px] truncate font-medium">
                  {selectedShop ? selectedShop.name : 'Select Store'}
                </span>
                <ChevronDownIcon size={11} className="text-gray-400 shrink-0" />
              </button>

              {shopDropdownOpen && (
                <div
                  className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 z-50 animate-fadeIn"
                  onMouseLeave={() => setShopDropdownOpen(false)}
                >
                  <div className="px-3.5 py-2 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                    <span>Retail Stores</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 text-[10px] font-mono">{shops.length}</span>
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
                        className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-gray-50 transition ${
                          selectedShop?.id === shop.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <StorefrontIcon size={13} className={selectedShop?.id === shop.id ? 'text-blue-600' : 'text-gray-400'} />
                          <span className="truncate">{shop.name}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 ml-2 font-mono shrink-0">{shop.timezone.split('/')[1] || shop.timezone}</span>
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
                      className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-xl flex items-center gap-1.5 font-bold transition"
                    >
                      <PlusIcon size={14} />
                      Add New Store Location
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center: Navigation Tabs (Single-line pills, no wrapping!) */}
          <nav className="hidden lg:flex items-center space-x-1 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentTab('dashboard')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
                currentTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <DashboardIcon size={15} />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('cameras')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
                currentTab === 'cameras'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <CctvCameraIcon size={15} />
              <span>Cameras & Lines</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('reports')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
                currentTab === 'reports'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <ReportChartIcon size={15} />
              <span>Reports & CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('settings')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
                currentTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <GearSettingsIcon size={15} />
              <span>Store Settings</span>
            </button>
          </nav>

          {/* Right section: Stream Status & User Avatar */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Live / Mock Mode Status Pill (single line, no wrapping) */}
            <button
              type="button"
              onClick={handleToggleMock}
              title="Click to toggle Mock adapter vs Live API mode"
              className={`text-[11px] sm:text-xs px-2 sm:px-3 py-1.5 rounded-xl font-semibold border flex items-center gap-1.5 transition shadow-xs whitespace-nowrap ${
                isMock
                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100/80'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/80'
              }`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isMock ? 'bg-amber-400' : 'bg-emerald-400'
                }`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  isMock ? 'bg-amber-500' : 'bg-emerald-500'
                }`} />
              </span>
              <span className="font-semibold text-[10px] sm:text-xs">
                {isMock ? 'Mock' : 'Backend'}<span className="hidden sm:inline"> {isMock ? 'Mode' : 'API'}</span>
              </span>
            </button>

            {/* Subtle Divider */}
            <div className="hidden sm:block h-6 w-px bg-gray-200" />

            {/* User Profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-gray-900 focus:outline-none p-1 sm:pr-2 rounded-xl hover:bg-gray-50 transition"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase border border-blue-200 shrink-0">
                  {user?.name?.slice(0, 2) || 'SO'}
                </div>
                <span className="hidden md:inline-block max-w-[100px] truncate text-gray-800 whitespace-nowrap">
                  {user?.name || 'Owner'}
                </span>
                <ChevronDownIcon size={12} className="text-gray-400 shrink-0" />
              </button>

              {userDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 z-50 animate-fadeIn"
                  onMouseLeave={() => setUserDropdownOpen(false)}
                >
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Signed in as</p>
                    <p className="text-xs font-bold text-gray-800 truncate mt-0.5">{user?.email}</p>
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
                      className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 font-semibold transition"
                    >
                      <LogOutIcon size={14} />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Medium screen navigation row (tablets / medium viewports) */}
        <div className="hidden md:flex lg:hidden border-t border-gray-100 py-2 justify-center space-x-2">
          <button
            type="button"
            onClick={() => setCurrentTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              currentTab === 'dashboard' ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <DashboardIcon size={14} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('cameras')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              currentTab === 'cameras' ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <CctvCameraIcon size={14} />
            Cameras & Lines
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('reports')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              currentTab === 'reports' ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ReportChartIcon size={14} />
            Reports & CSV
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              currentTab === 'settings' ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <GearSettingsIcon size={14} />
            Settings
          </button>
        </div>

        {/* Mobile bottom-style bar */}
        <div className="flex md:hidden border-t border-gray-100 py-2 justify-around">
          <button
            type="button"
            onClick={() => setCurrentTab('dashboard')}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5 transition ${
              currentTab === 'dashboard' ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <DashboardIcon size={16} />
            <span>Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('cameras')}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5 transition ${
              currentTab === 'cameras' ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <CctvCameraIcon size={16} />
            <span>Cameras</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('reports')}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5 transition ${
              currentTab === 'reports' ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <ReportChartIcon size={16} />
            <span>Reports</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('settings')}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5 transition ${
              currentTab === 'settings' ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <GearSettingsIcon size={16} />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
