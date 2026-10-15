import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import {
  BuildingIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  SlidersIcon,
  ClockIcon,
  ShieldIcon
} from '../components/icons';

const TIMEZONE_OPTIONS = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC'
];

export const ShopProfilePage: React.FC = () => {
  const { selectedShop, updateShop, shops, selectShop } = useShop();

  const [name, setName] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('Asia/Kolkata');
  const [occupancyBaseline, setOccupancyBaseline] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedShop) {
      setName(selectedShop.name);
      setTimezone(selectedShop.timezone || 'Asia/Kolkata');
      setOccupancyBaseline(selectedShop.occupancyBaseline ?? 0);
    }
  }, [selectedShop]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop) return;
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await updateShop(selectedShop.id, {
        name,
        timezone,
        occupancyBaseline: Number(occupancyBaseline)
      });
      setSuccessMessage('Store profile and operating timezone updated successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update store settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedShop) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm">Please select a store to manage settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Store Profile & Operating Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure business metadata, baseline occupancy offsets, and operational timezone.
        </p>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 text-emerald-800 text-xs">
          <CheckCircleIcon size={18} className="text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-rose-800 text-xs">
          <AlertTriangleIcon size={18} className="text-rose-600 shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* Main Settings Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Store Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">Displayed on owner footfall dashboards and reports.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Operational Timezone
              </label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
              >
                {TIMEZONE_OPTIONS.map(tz => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Used to bucket hourly traffic and midnight reset cycles.</p>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Default Baseline Occupancy Offset
            </label>
            <div className="max-w-xs">
              <input
                type="number"
                min="0"
                value={occupancyBaseline}
                onChange={e => setOccupancyBaseline(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1 max-w-lg">
              Starting customer count when shop opens before IN/OUT cameras register new events.
            </p>
          </div>

          {/* Readonly Metadata info */}
          <div className="pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-gray-400 block">Store Internal ID</span>
              <span className="font-mono font-semibold text-gray-800">{selectedShop.id}</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-gray-400 block">Account Status</span>
              <span className="inline-block mt-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded border border-emerald-200">
                {selectedShop.status}
              </span>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-gray-400 block">Tenant Isolation</span>
              <span className="text-gray-800 font-semibold flex items-center gap-1 mt-0.5">
                <ShieldIcon size={14} className="text-emerald-600" />
                Owner Encrypted
              </span>
            </div>
          </div>

          <div className="flex justify-end items-center gap-3 pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Other Owned Stores List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
          All Stores In Your Organization ({shops.length})
        </h3>
        <div className="divide-y divide-gray-100">
          {shops.map(shop => (
            <div
              key={shop.id}
              className="py-3 flex items-center justify-between hover:bg-gray-50/50 px-2 rounded-xl transition"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    selectedShop.id === shop.id
                      ? 'bg-blue-100 text-blue-700 font-bold'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <BuildingIcon size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{shop.name}</h4>
                  <p className="text-xs text-gray-400">{shop.timezone} • Baseline: {shop.occupancyBaseline}</p>
                </div>
              </div>

              {selectedShop.id === shop.id ? (
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs border border-blue-200">
                  Active Store
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => selectShop(shop.id)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold"
                >
                  Switch To This Store
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
