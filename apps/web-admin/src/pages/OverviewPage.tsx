import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { adminFetch } from '../api';
import { OverviewMetrics } from '../types';

export function OverviewPage() {
  const [data, setData] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await adminFetch('/admin/overview');
      setData(res);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const workerStatus = data?.workerHealth?.status || 'NEEDS_SETUP';
  const workerLastHb = data?.workerHealth?.lastHeartbeatAt;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Overview</h2>
          <p className="text-xs text-slate-500 mt-0.5">Live operational snapshot across all shops & ingestion channels</p>
        </div>
        <button 
          onClick={loadMetrics} 
          disabled={loading}
          title="Refresh Overview"
          className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      {data && (data.totalCameras ?? 0) > 0 && workerStatus === 'OFFLINE' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-900 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <span>Stream ingestion worker heartbeat is stale (&gt;90s). Real-time event capture is interrupted.</span>
        </div>
      )}

      {data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Registered Shops</div>
            <div className="text-3xl font-extrabold text-slate-900 mt-2">{data.totalShops ?? 0}</div>
            <div className="text-xs text-emerald-600 mt-2 font-medium">
              {data.activeShops ?? 0} Active • {data.suspendedShops ?? 0} Suspended
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Cameras Online</div>
            <div className="text-3xl font-extrabold text-emerald-600 mt-2">{data.onlineCameras ?? 0}</div>
            <div className="text-xs text-slate-500 mt-2">Out of {data.totalCameras ?? 0} Units</div>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Degraded / Offline</div>
            <div className="text-3xl font-extrabold text-red-600 mt-2">
              {(data.offlineCameras ?? 0) + (data.degradedCameras ?? 0)}
            </div>
            <div className="text-xs text-amber-600 mt-2 font-medium">
              {data.degradedCameras ?? 0} Config/Degraded warnings
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Worker Status</div>
            <div className="flex items-center gap-2 mt-3">
              <span className={`w-3 h-3 rounded-full ${workerStatus === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="font-bold text-lg text-slate-900">{workerStatus}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-2 truncate">
              Last Ping: {workerLastHb ? new Date(workerLastHb).toLocaleTimeString() : 'Never'}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map(k => (
            <div key={k} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
