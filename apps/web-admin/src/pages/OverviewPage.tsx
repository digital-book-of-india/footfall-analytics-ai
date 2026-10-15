import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { adminFetch } from '../api';
import { OverviewMetrics } from '../types';

export function OverviewPage() {
  const [data, setData] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const res = await adminFetch<OverviewMetrics>('/admin/overview');
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Platform Overview</h2>
          <p className="text-xs text-slate-400">Live operational snapshot across all shops & ingestion channels</p>
        </div>
        <button onClick={loadMetrics} className="p-2 border border-slate-800 rounded bg-slate-900 hover:bg-slate-800 text-slate-400">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {data && data.totalCameras > 0 && data.workerHealth.status === 'OFFLINE' && (
        <div className="p-4 bg-amber-950/40 border border-amber-800 rounded-lg flex items-center gap-3 text-amber-200 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span>Stream ingestion worker heartbeat is stale (&gt;90s). Real-time event capture is interrupted.</span>
        </div>
      )}

      {data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="text-xs text-slate-400 font-medium">Registered Shops</div>
            <div className="text-3xl font-bold mt-2">{data.totalShops}</div>
            <div className="text-xs text-emerald-400 mt-2 font-medium">{data.activeShops} Active • {data.suspendedShops} Suspended</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="text-xs text-slate-400 font-medium">Cameras Online</div>
            <div className="text-3xl font-bold mt-2 text-emerald-400">{data.onlineCameras}</div>
            <div className="text-xs text-slate-400 mt-2">Out of {data.totalCameras} Units</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="text-xs text-slate-400 font-medium">Degraded / Offline</div>
            <div className="text-3xl font-bold mt-2 text-red-400">{data.offlineCameras + data.degradedCameras}</div>
            <div className="text-xs text-amber-400 mt-2">{data.degradedCameras} Config/Degraded warnings</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="text-xs text-slate-400 font-medium">Worker Status</div>
            <div className="flex items-center gap-2 mt-3">
              <span className={`w-3 h-3 rounded-full ${data.workerHealth.status === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="font-bold text-lg">{data.workerHealth.status}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-2 truncate">
              Last Ping: {data.workerHealth.lastHeartbeatAt ? new Date(data.workerHealth.lastHeartbeatAt).toLocaleTimeString() : 'Never'}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(k => (
            <div key={k} className="h-28 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
