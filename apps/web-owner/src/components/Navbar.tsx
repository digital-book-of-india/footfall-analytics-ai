import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { BuildingIcon, VideoIcon, BarChartIcon, SettingsIcon, LogOutIcon, PlusIcon, ChevronDownIcon, ActivityIcon } from './icons';
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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand & App Title */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentTab('dashboard')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <ActivityIcon size={22} className="animate-pulse" />
              </div>
              <div>
                <span className="text-xs uppercase tracking-wider font-bold text-blue-600 block leading-tight">DBI Intelligence</span>
                <span className="text-lg font-bold text-gray-900 tracking-tight">Footfall Analytics</span>
              </div>
            </div>

            {/* Shop Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShopDropdownOpen(!shopDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-800 transition"
              >
                <BuildingIcon size={16} className="text-gray-500" />
                <span className="max-w-[140px] sm:max-w-[180px] truncate">
                  {selectedShop ? selectedShop.name : 'No Shop Selected'}
                </span>
                <ChevronDownIcon size={14} className="text-gray-400" />
              </button>

              {shopDropdownOpen && (
                <div
                  className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 animate-fadeIn"
                  onMouseLeave={() => setShopDropdownOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Your Stores ({shops.length})
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {shops.map(shop => (
                      <button
                        key={shop.id}
                        type="button"
                        onClick={() => {
                          selectShop(shop.id);
                          setShopDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                          selectedShop?.id === shop.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                        }`}
                      >
                        <span className="truncate">{shop.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{shop.timezone.split('/')[1] || shop.timezone}</span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShopDropdownOpen(false);
                        onOpenNewShopModal();
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-2 font-medium"
                    >
                      <PlusIcon size={16} />
                      Add New Store
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setCurrentTab('dashboard')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                currentTab === 'dashboard'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <ActivityIcon size={16} />
              Dashboard
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('cameras')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                currentTab === 'cameras'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <VideoIcon size={16} />
              Cameras & Lines
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('reports')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                currentTab === 'reports'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <BarChartIcon size={16} />
              Reports & CSV
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('settings')}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                currentTab === 'settings'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <SettingsIcon size={16} />
              Store Settings
            </button>
          </nav>

          {/* User & Mode Controls */}
          <div className="flex items-center gap-3">
            {/* Mode switch helper for dev/demo */}
            <button
              type="button"
              onClick={handleToggleMock}
              title="Toggle Mock adapter vs Live API calls"
              className={`text-xs px-2.5 py-1 rounded-md font-medium border ${
                isMock
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}
            >
              {isMock ? 'Mock API Active' : 'Live API Mode'}
            </button>

            {/* User Profile */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase border border-blue-200">
                  {user?.name?.slice(0, 2) || 'SO'}
                </div>
                <span className="hidden sm:inline-block max-w-[120px] truncate font-medium">
                  {user?.name || 'Owner'}
                </span>
                <ChevronDownIcon size={14} className="text-gray-400" />
              </button>

              {userDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 animate-fadeIn"
                  onMouseLeave={() => setUserDropdownOpen(false)}
                >
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-xs text-gray-400 font-medium">Signed in as</p>
                    <p className="text-sm font-semibold text-gray-800 truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 rounded border border-blue-200 uppercase tracking-wide">
                      {user?.role || 'SHOP_OWNER'}
                    </span>
                  </div>
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"
                    >
                      <LogOutIcon size={16} />
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
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 ${
              currentTab === 'dashboard' ? 'text-blue-600 font-bold' : 'text-gray-500'
            }`}
          >
            <ActivityIcon size={18} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('cameras')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 ${
              currentTab === 'cameras' ? 'text-blue-600 font-bold' : 'text-gray-500'
            }`}
          >
            <VideoIcon size={18} />
            Cameras
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('reports')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 ${
              currentTab === 'reports' ? 'text-blue-600 font-bold' : 'text-gray-500'
            }`}
          >
            <BarChartIcon size={18} />
            Reports
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 ${
              currentTab === 'settings' ? 'text-blue-600 font-bold' : 'text-gray-500'
            }`}
          >
            <SettingsIcon size={18} />
            Settings
          </button>
        </div>
      </div>
    </header>
  );
};
