import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminFetch } from '../api';
import { AuditLogItem, PaginatedResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export function AuditLogsPage() {
  const [data, setData] = useState<PaginatedResult<AuditLogItem>>({ items: [], total: 0, page: 1, limit: 20 });
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: page.toString(), limit: '50' });
      const res: any = await adminFetch(`/admin/audit-logs?${q.toString()}`);
      const raw = Array.isArray(res) ? res : (res?.items || res?.logs || []);
      const total = typeof res?.total === 'number' ? res.total : raw.length;
      setData({ items: raw, total, page, limit: 20 });
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  }, []);

  useEffect(() => {
    loadLogs(1);
  }, [loadLogs]);

  const list = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Platform Audit Logs</h2>
          <p className="text-xs text-slate-400">Immutable trace of administrative actions</p>
        </div>
        <button 
          onClick={() => loadLogs(data.page)} 
          disabled={loading}
          title="Refresh Audit Logs"
          className="p-2 border border-slate-800 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[700px]">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="p-3">Timestamp (UTC / Local)</th>
              <th className="p-3">Request ID</th>
              <th className="p-3">Actor Email</th>
              <th className="p-3">Action</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 font-mono">
            {list.map((l: any) => (
              <tr key={l.id || l._id} className="hover:bg-slate-800/40">
                <td className="p-3 text-slate-400 text-[11px]">
                  <div>{l.createdAt ? new Date(l.createdAt).toISOString() : 'N/A'}</div>
                  <div className="text-[10px] text-slate-600">{l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}</div>
                </td>
                <td className="p-3 text-slate-400 text-[10px] truncate max-w-[120px]">{l.requestId || 'N/A'}</td>
                <td className="p-3 text-slate-200 font-sans">{l.actorEmail || l.actor?.email || 'admin@dbi.ai'}</td>
                <td className="p-3 font-semibold text-amber-400">{l.action}</td>
                <td className="p-3 text-slate-300 font-sans max-w-xs">{l.reason}</td>
                <td className="p-3"><StatusBadge status={l.status || 'SUCCESS'} /></td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500 font-sans">{loading ? 'Loading...' : 'No audit records'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
