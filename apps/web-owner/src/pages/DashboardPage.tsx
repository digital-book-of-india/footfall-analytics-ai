import React, { useState, useEffect, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { FootfallSummary, FootfallTimeseriesPoint, Camera } from '../types';
import { api } from '../services/apiClient';
import { DataSourceBadge, QualityBadge } from '../components/StatusBadges';
import {
  UsersIcon,
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  SlidersIcon,
  CheckCircleIcon,
  CalendarIcon,
  ActivityIcon,
  VideoIcon,
  PlusIcon
} from '../components/icons';

interface DashboardPageProps {
  onNavigateToCameras: () => void;
  onNavigateToReports: () => void;
  onOpenNewShopModal?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateToCameras,
  onNavigateToReports,
  onOpenNewShopModal
}) => {
  const { selectedShop, isLoading: shopLoading } = useShop();
  const [summary, setSummary] = useState<FootfallSummary | null>(null);
  const [timeseries, setTimeseries] = useState<FootfallTimeseriesPoint[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Calibration / Reset Modal state
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetValue, setResetValue] = useState<number>(0);
  const [resetReason, setResetReason] = useState<string>('Routine manual count calibration');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!selectedShop) {
      setIsLoading(false);
      return;
    }

    setError(null);
    try {
      const [sumData, timeData, camData] = await Promise.all([
        api.getFootfallSummary(selectedShop.id),
        api.getFootfallTimeseries(selectedShop.id),
        api.getCameras(selectedShop.id)
      ]);
      setSummary(sumData);
      setTimeseries(timeData);
      setCameras(camData);
      setResetValue(sumData.estimatedOccupancy);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch footfall metrics');
    } finally {
      setIsLoading(false);
    }
  }, [selectedShop]);

  useEffect(() => {
    setIsLoading(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Polling / Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !selectedShop) return;
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [autoRefresh, selectedShop, fetchDashboardData]);

  const handleResetOccupancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop) return;
    setIsResetting(true);
    setResetFeedback(null);
    try {
      await api.resetOccupancy(selectedShop.id, {
        newOccupancy: Number(resetValue),
        reason: resetReason
      });
      setResetFeedback('Occupancy count calibrated successfully');
      setTimeout(() => {
        setShowResetModal(false);
        setResetFeedback(null);
        fetchDashboardData();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Failed to recalibrate occupancy');
    } finally {
      setIsResetting(false);
    }
  };

  // Find max value in timeseries for dynamic chart scaling
  const maxTraffic = Math.max(
    ...timeseries.map(t => Math.max(t.entries, t.exits)),
    20
  );

  if (shopLoading && !selectedShop) {
    return (
      <div className="text-center py-20 px-4 animate-pulse">
        <RefreshCwIcon size={32} className="animate-spin text-blue-600 mx-auto mb-3" />
        <p className="text-gray-500 text-sm font-medium">Loading store dashboard...</p>
      </div>
    );
  }

  if (!selectedShop) {
    return (
      <div className="text-center py-20 px-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
          <ActivityIcon size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to DBI Footfall Analytics</h2>
        <p className="text-gray-500 max-w-md mx-auto mb-6">
          Get started by selecting or creating your shop store to monitor real-time footfall and AI occupancy.
        </p>
        {onOpenNewShopModal && (
          <button
            type="button"
            onClick={onOpenNewShopModal}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-2 shadow-md hover:shadow-lg transition"
          >
            <PlusIcon size={18} />
            Create Your Store Location
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Status, Title, Refresh controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{selectedShop.name}</h1>
            {summary && <DataSourceBadge source={summary.dataSource} />}
            {summary && <QualityBadge quality={summary.quality} />}
            {cameras.length > 0 ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  cameras.some(c => c.status === 'ONLINE')
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : cameras.some(c => c.status === 'DEGRADED')
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title="Camera network and AI stream health"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    cameras.some(c => c.status === 'ONLINE')
                      ? 'bg-emerald-500'
                      : cameras.some(c => c.status === 'DEGRADED')
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                {cameras.filter(c => c.status === 'ONLINE' || c.status === 'DEGRADED').length}/{cameras.length} Cameras Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                No Cameras Configured
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1.5 flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span>Timezone: {selectedShop.timezone}</span>
            <span>•</span>
            <span>Baseline Offset: {summary?.occupancyBaseline ?? selectedShop.occupancyBaseline}</span>
            <span>•</span>
            <span>Updated: {lastRefreshed.toLocaleTimeString()}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            />
            <span>Auto-Refresh</span>
          </label>

          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-200 transition disabled:opacity-50"
            title="Refresh footfall data"
          >
            <RefreshCwIcon size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold flex items-center gap-2 border border-indigo-200 transition"
          >
            <SlidersIcon size={15} />
            Calibrate Occupancy
          </button>
        </div>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start justify-between gap-3 text-rose-800">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Failed to sync footfall data</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchDashboardData}
            className="px-3 py-1 bg-white border border-rose-300 text-xs font-semibold rounded-lg hover:bg-rose-50 text-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Accuracy & Drift Notice mandated by spec */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 sm:p-4 text-xs text-blue-900 flex items-start gap-3">
        <ActivityIcon size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <span className="font-bold">MVP Footfall Tracking Formula:</span> Estimated Occupancy = Baseline + Entries − Exits.
          Note that occupancy counters can drift over time due to camera angles, group entries, or brief occlusions. Use the <strong>Calibrate Occupancy</strong> button anytime to re-align with ground truth.
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Entries Card */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Today&apos;s Entries</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1.5 sm:mt-2">
                {isLoading ? (
                  <span className="inline-block w-16 h-8 bg-gray-200 animate-pulse rounded"></span>
                ) : (
                  summary?.entries.toLocaleString() ?? '0'
                )}
              </h3>
            </div>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <ArrowDownRightIcon size={22} />
            </div>
          </div>
          <p className="text-xs text-emerald-600 font-medium mt-3 flex items-center gap-1">
            <span>IN flow across configured entrance lines</span>
          </p>
        </div>

        {/* Exits Card */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Today&apos;s Exits</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1.5 sm:mt-2">
                {isLoading ? (
                  <span className="inline-block w-16 h-8 bg-gray-200 animate-pulse rounded"></span>
                ) : (
                  summary?.exits.toLocaleString() ?? '0'
                )}
              </h3>
            </div>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <ArrowUpRightIcon size={22} />
            </div>
          </div>
          <p className="text-xs text-rose-600 font-medium mt-3 flex items-center gap-1">
            <span>OUT flow across configured entrance lines</span>
          </p>
        </div>

        {/* Estimated Occupancy Card */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-blue-200 shadow-sm hover:shadow-md transition relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Current Occupancy</p>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-900 mt-1.5 sm:mt-2">
                {isLoading ? (
                  <span className="inline-block w-16 h-8 bg-gray-200 animate-pulse rounded"></span>
                ) : (
                  summary?.estimatedOccupancy.toLocaleString() ?? '0'
                )}
              </h3>
            </div>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <UsersIcon size={22} />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 flex items-center justify-between">
            <span>Estimated in-store customers</span>
            <button
              onClick={() => setShowResetModal(true)}
              className="text-blue-600 hover:underline font-semibold"
            >
              Adjust
            </button>
          </p>
        </div>

        {/* Entrance Camera Health Card */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Entrance Camera Health</p>
              <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1.5 sm:mt-2">
                {isLoading ? (
                  <span className="inline-block w-16 h-8 bg-gray-200 animate-pulse rounded"></span>
                ) : cameras.length > 0 ? (
                  `${cameras.filter(c => c.status === 'ONLINE' || c.status === 'DEGRADED').length}/${cameras.length} Active`
                ) : (
                  'Needs Setup'
                )}
              </h3>
            </div>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <VideoIcon size={22} />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 flex items-center justify-between">
            <span className="truncate max-w-[150px]">
              {cameras.length > 0
                ? cameras.some(c => c.connectionType === 'MOCK_STREAM') ? 'DEMO Clip stream' : 'Live RTSP Stream'
                : 'No camera stream'}
            </span>
            <button
              onClick={onNavigateToCameras}
              className="text-blue-600 hover:underline font-semibold shrink-0"
            >
              Manage →
            </button>
          </p>
        </div>
      </div>

      {/* Hourly Footfall Chart */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900">Today&apos;s Hourly Traffic Trend</h3>
            <p className="text-xs text-gray-500 mt-0.5">Entries and Exits distribution by hour</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
              <span className="text-gray-600">Entries (IN)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-400"></span>
              <span className="text-gray-600">Exits (OUT)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-600"></span>
              <span className="text-gray-600">Est. Occupancy</span>
            </div>
          </div>
        </div>

        {/* Visual Chart */}
        {isLoading ? (
          <div className="h-56 sm:h-64 flex items-center justify-center bg-gray-50 rounded-xl">
            <RefreshCwIcon size={24} className="animate-spin text-gray-400" />
          </div>
        ) : timeseries.length === 0 ? (
          <div className="h-56 sm:h-64 flex flex-col items-center justify-center bg-gray-50 rounded-xl text-center p-4 sm:p-6">
            <CalendarIcon size={32} className="text-gray-400 mb-2" />
            <p className="text-sm font-semibold text-gray-700">No footfall traffic recorded yet for today</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              Make sure your entrance camera is online and the virtual counting line is calibrated.
            </p>
            <button
              onClick={onNavigateToCameras}
              className="mt-4 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
            >
              Configure Entrance Camera
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="overflow-x-auto pb-2 -mx-2 sm:mx-0 px-2 sm:px-0">
              <div className="h-56 sm:h-64 min-w-[560px] sm:min-w-0 w-full flex items-end gap-2 sm:gap-4 pt-6 pb-2 px-2 border-b border-gray-200">
                {timeseries.map((pt, idx) => {
                  const hourLabel = pt.bucketStartUtc.includes('T')
                    ? pt.bucketStartUtc.split('T')[1].slice(0, 5)
                    : `${idx}:00`;
                  const inHeight = Math.round((pt.entries / maxTraffic) * 100);
                  const outHeight = Math.round((pt.exits / maxTraffic) * 100);

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[11px] rounded-lg py-1 px-2 pointer-events-none whitespace-nowrap z-20 shadow-lg">
                        <p className="font-bold">{hourLabel}</p>
                        <p className="text-emerald-400">IN: {pt.entries}</p>
                        <p className="text-rose-400">OUT: {pt.exits}</p>
                        {pt.estimatedOccupancy !== undefined && (
                          <p className="text-blue-300">Occupancy: {pt.estimatedOccupancy}</p>
                        )}
                      </div>

                      {/* Bars pair */}
                      <div className="w-full flex items-end justify-center gap-1 h-full">
                        {/* IN bar */}
                        <div
                          style={{ height: `${Math.max(inHeight, 4)}%` }}
                          className="w-1/2 max-w-[20px] bg-emerald-500 rounded-t-sm hover:bg-emerald-600 transition-all duration-300"
                        />
                        {/* OUT bar */}
                        <div
                          style={{ height: `${Math.max(outHeight, 4)}%` }}
                          className="w-1/2 max-w-[20px] bg-rose-400 rounded-t-sm hover:bg-rose-500 transition-all duration-300"
                        />
                      </div>
                      {/* X-axis label */}
                      <span className="text-[10px] text-gray-500 mt-2 font-mono">{hourLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center text-xs text-gray-400 pt-1 gap-1">
              <span>08:00 Store Opening</span>
              <button
                type="button"
                onClick={onNavigateToReports}
                className="text-blue-600 hover:underline font-semibold text-left sm:text-right"
              >
                View Detailed Hourly Table & Export CSV →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Setup Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100">
          <h4 className="font-bold text-gray-900 flex items-center gap-2">
            <CheckCircleIcon size={18} className="text-blue-600" />
            Camera & Counting Line Setup
          </h4>
          <p className="text-xs text-gray-600 mt-1">
            Ensure your store entrance camera is configured with credentials and an active virtual line to track customer flow.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={onNavigateToCameras}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
            >
              Manage Cameras
            </button>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-6 rounded-2xl border border-emerald-100">
          <h4 className="font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon size={18} className="text-emerald-600" />
            Footfall Reports & Export
          </h4>
          <p className="text-xs text-gray-600 mt-1">
            Review detailed historical hourly trends, daily entries/exits, and download audited CSV reports for store operations.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={onNavigateToReports}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-sm transition"
            >
              View Reports & CSV
            </button>
          </div>
        </div>
      </div>

      {/* Recalibration / Reset Occupancy Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-gray-200 my-auto flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                  <SlidersIcon size={20} className="text-indigo-600 shrink-0" />
                  <span>Calibrate Estimated Occupancy</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Reset current customer count to reconcile with manual in-store count.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg text-lg font-bold ml-2 transition"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {resetFeedback && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shrink-0">
                <CheckCircleIcon size={16} />
                <span>{resetFeedback}</span>
              </div>
            )}

            <form onSubmit={handleResetOccupancy} className="space-y-4 flex-1">
              <div>
                <label htmlFor="calibrate-occupancy-input" className="block text-xs font-semibold text-gray-700 mb-1">
                  Current Actual In-Store Occupancy
                </label>
                <input
                  id="calibrate-occupancy-input"
                  type="number"
                  min="0"
                  required
                  value={resetValue}
                  onChange={e => setResetValue(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-base font-bold text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  This will adjust the estimated occupancy baseline for {selectedShop.name}.
                </p>
              </div>

              <div>
                <label htmlFor="calibrate-reason-input" className="block text-xs font-semibold text-gray-700 mb-1">
                  Calibration Reason / Note
                </label>
                <input
                  id="calibrate-reason-input"
                  type="text"
                  value={resetReason}
                  onChange={e => setResetReason(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-xs focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. End of shift physical headcount"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition text-center"
                >
                  {isResetting ? 'Saving Calibration...' : 'Confirm Calibration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
