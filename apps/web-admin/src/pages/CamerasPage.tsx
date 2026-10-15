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
          <h2 className="text-xl font-bold">Camera Fleet & Stream Monitor</h2>
          <p className="text-xs text-slate-400">Status rule: Stale heartbeat (&gt;90s) triggers OFFLINE</p>
        </div>
        <button 
          onClick={loadCameras} 
          disabled={loading}
          title="Refresh Camera Health"
          className="p-2 border border-slate-800 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[600px]">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="p-3">Camera Name</th>
              <th className="p-3">Shop</th>
              <th className="p-3">Protocol</th>
              <th className="p-3">Evaluated Status</th>
              <th className="p-3">Error Code</th>
              <th className="p-3">Last Ping</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {cameras.map((c: any) => (
              <tr key={c.id || c._id} className="hover:bg-slate-800/40">
                <td className="p-3 font-semibold text-slate-200">{c.name}</td>
                <td className="p-3 text-slate-400">{c.shopName || c.shop?.name || 'Unknown Shop'}</td>
                <td className="p-3 text-slate-400 font-mono">{c.connectionType || 'RTSP'}</td>
                <td className="p-3"><StatusBadge status={c.status || 'NEEDS_SETUP'} /></td>
                <td className="p-3 font-mono text-slate-400">
                  {c.safeErrorCode ? (
                    <span className="text-red-400 bg-red-950/30 px-1.5 py-0.5 rounded border border-red-800">{c.safeErrorCode}</span>
                  ) : 'None'}
                </td>
                <td className="p-3 text-slate-400 text-[11px]">
                  {c.lastHeartbeatAt ? new Date(c.lastHeartbeatAt).toLocaleTimeString() : 'Never'}
                </td>
              </tr>
            ))}
            {cameras.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">No registered cameras</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
