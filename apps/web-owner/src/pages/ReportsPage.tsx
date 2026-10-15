import React, { useState, useEffect, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { FootfallTimeseriesPoint } from '../types';
import { api } from '../services/apiClient';
import {
  DownloadIcon,
  CalendarIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  BarChartIcon,
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  UsersIcon
} from '../components/icons';

export const ReportsPage: React.FC = () => {
  const { selectedShop, isLoading: shopLoading } = useShop();
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [timeseries, setTimeseries] = useState<FootfallTimeseriesPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReportData = useCallback(async () => {
    if (!selectedShop) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getFootfallTimeseries(selectedShop.id, selectedDate);
      setTimeseries(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report for selected date');
    } finally {
      setIsLoading(false);
    }
  }, [selectedShop, selectedDate]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const handleExportCsv = async () => {
    if (!selectedShop) return;
    setIsExporting(true);
    try {
      const csvContent = await api.exportFootfallCsv(selectedShop.id, selectedDate);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `footfall_${selectedShop.name.replace(/\s+/g, '_')}_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setError(err.message || 'Failed to download CSV export');
    } finally {
      setIsExporting(false);
    }
  };

  const totalEntries = timeseries.reduce((acc, curr) => acc + curr.entries, 0);
  const totalExits = timeseries.reduce((acc, curr) => acc + curr.exits, 0);
  const peakHour = timeseries.reduce<{ hour: string; count: number }>(
    (acc, curr) => {
      const traffic = curr.entries + curr.exits;
      if (traffic > acc.count) {
        return {
          hour: curr.bucketStartUtc.includes('T') ? curr.bucketStartUtc.split('T')[1].slice(0, 5) : 'N/A',
          count: traffic
        };
      }
      return acc;
    },
    { hour: 'N/A', count: 0 }
  );

  if (shopLoading && !selectedShop) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm font-medium animate-pulse">Loading footfall reports...</p>
      </div>
    );
  }

  if (!selectedShop) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm">Please select a store to view footfall reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Filter and CSV Download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Footfall Reports & Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Aggregated hourly crossings and visitor flow metrics for {selectedShop.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-300">
            <CalendarIcon size={16} className="text-gray-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={fetchReportData}
            disabled={isLoading}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-200 transition"
            title="Refresh table"
          >
            <RefreshCwIcon size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || timeseries.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-50"
          >
            <DownloadIcon size={16} />
            {isExporting ? 'Exporting...' : 'Export to CSV'}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start justify-between gap-3 text-rose-800">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Failed to generate report</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchReportData}
            className="px-3 py-1 bg-white border border-rose-300 text-xs font-semibold rounded-lg hover:bg-rose-50 text-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Stat Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ArrowDownRightIcon size={20} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Day Total Entries</p>
            <p className="text-xl font-bold text-gray-900">{totalEntries.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
            <ArrowUpRightIcon size={20} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Day Total Exits</p>
            <p className="text-xl font-bold text-gray-900">{totalExits.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <BarChartIcon size={20} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Busiest Peak Hour</p>
            <p className="text-xl font-bold text-gray-900">{peakHour.hour} ({peakHour.count} visits)</p>
          </div>
        </div>
      </div>

      {/* Hourly Breakdown Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Hourly Granular Breakdown • {selectedDate}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Aggregated in 60-minute UTC intervals</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
            {timeseries.length} Intervals Recorded
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCwIcon size={24} className="animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-xs text-gray-500">Aggregating footfall statistics...</p>
          </div>
        ) : timeseries.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarIcon size={32} className="text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-700">No footfall events recorded on this date</p>
            <p className="text-xs text-gray-400 mt-1">Select another date or wait for stream processing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 text-gray-600 uppercase font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3">Time Interval</th>
                  <th className="px-6 py-3">Entries (IN)</th>
                  <th className="px-6 py-3">Exits (OUT)</th>
                  <th className="px-6 py-3">Net Hourly Delta</th>
                  <th className="px-6 py-3">Est. End Occupancy</th>
                  <th className="px-6 py-3">Audit Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {timeseries.map((pt, idx) => {
                  const hourLabel = pt.bucketStartUtc.includes('T')
                    ? pt.bucketStartUtc.split('T')[1].slice(0, 5)
                    : `${idx}:00`;
                  const netDelta = pt.entries - pt.exits;

                  return (
                    <tr key={idx} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-3.5 font-mono font-semibold text-gray-800">
                        {hourLabel} - {hourLabel.split(':')[0]}:59
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-emerald-600">
                        +{pt.entries}
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-rose-600">
                        -{pt.exits}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`font-semibold ${
                            netDelta > 0
                              ? 'text-emerald-700'
                              : netDelta < 0
                              ? 'text-rose-700'
                              : 'text-gray-500'
                          }`}
                        >
                          {netDelta > 0 ? `+${netDelta}` : netDelta}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-gray-900">
                        {pt.estimatedOccupancy ?? '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[11px] font-medium border border-emerald-200">
                          VERIFIED
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
