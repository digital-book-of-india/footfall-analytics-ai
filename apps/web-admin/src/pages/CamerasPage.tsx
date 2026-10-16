import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminFetch } from '../api';
import { CameraHealthItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export function CamerasPage() {
  const [cameras, setCameras] = useState<CameraHealthItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCameras = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await adminFetch('/admin/cameras/health');
      const items = Array.isArray(res) ? res : (res?.items || res?.cameras || []);
      setCameras(items);
    } catch (err) {
      console.error('Failed to load camera health:', err);
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  }, []);

  useEffect(() => {
    loadCameras();
    const interval = setInterval(loadCameras, 30000);
    return () => clearInterval(interval);
  }, [loadCameras]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Camera Fleet & Stream Monitor</h2>
          <p className="text-xs text-slate-500 mt-0.5">Status rule: Stale heartbeat (&gt;90s) triggers OFFLINE</p>
        </div>
        <button 
          onClick={loadCameras} 
          disabled={loading}
          title="Refresh Camera Health"
          className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs min-w-[700px]">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3.5">Camera Name</th>
              <th className="p-3.5">Shop</th>
              <th className="p-3.5">Protocol</th>
              <th className="p-3.5">Evaluated Status</th>
              <th className="p-3.5">Error Code</th>
              <th className="p-3.5">Last Ping</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cameras.map((c: any) => (
              <tr key={c.id || c._id} className="hover:bg-slate-50/80 transition">
                <td className="p-3.5 font-semibold text-slate-900">{c.name}</td>
                <td className="p-3.5 text-slate-600 font-medium">{c.shopName || c.shop?.name || 'Unknown Shop'}</td>
                <td className="p-3.5 text-slate-500 font-mono">{c.connectionType || 'RTSP'}</td>
                <td className="p-3.5"><StatusBadge status={c.status || 'NEEDS_SETUP'} /></td>
                <td className="p-3.5 font-mono text-slate-500">
                  {c.safeErrorCode ? (
                    <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 font-semibold">{c.safeErrorCode}</span>
                  ) : 'None'}
                </td>
                <td className="p-3.5 text-slate-500 text-[11px]">
                  {c.lastHeartbeatAt ? new Date(c.lastHeartbeatAt).toLocaleTimeString() : 'Never'}
                </td>
              </tr>
            ))}
            {cameras.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">{loading ? 'Loading...' : 'No registered cameras'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
