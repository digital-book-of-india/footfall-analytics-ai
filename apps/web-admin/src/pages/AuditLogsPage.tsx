import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminFetch } from '../api';
import { AuditLogItem, PaginatedResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export function AuditLogsPage() {
  const [data, setData] = useState<PaginatedResult<AuditLogItem>>({ items: [], total: 0, page: 1, limit: 15 });
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: page.toString(), limit: '15' });
      const res: any = await adminFetch(`/admin/audit-logs?${q.toString()}`);
      const raw = Array.isArray(res) ? res : (res?.items || res?.logs || []);
      const total = typeof res?.total === 'number' ? res.total : raw.length;
      setData({ items: raw, total, page, limit: 15 });
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setTimeout(() => setLoading(false), 200);
    }
  }, []);

  useEffect(() => {
    loadLogs(1);
  }, [loadLogs]);

  const list = data?.items || [];
  const totalPages = Math.ceil(data.total / data.limit) || 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Audit Logs</h2>
          <p className="text-xs text-slate-500 mt-0.5">Immutable trace of administrative actions</p>
        </div>
        <button 
          onClick={() => loadLogs(data.page)} 
          disabled={loading}
          title="Refresh Audit Logs"
          className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs min-w-[700px]">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3.5">Timestamp (UTC / Local)</th>
              <th className="p-3.5">Request ID</th>
              <th className="p-3.5">Actor Email</th>
              <th className="p-3.5">Action</th>
              <th className="p-3.5">Reason</th>
              <th className="p-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {list.map((l: any) => (
              <tr key={l.id || l._id} className="hover:bg-slate-50/80 transition">
                <td className="p-3.5 text-slate-500 text-[11px]">
                  <div className="font-semibold text-slate-700">{l.createdAt ? new Date(l.createdAt).toISOString() : 'N/A'}</div>
                  <div className="text-[10px] text-slate-400">{l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}</div>
                </td>
                <td className="p-3.5 text-slate-500 text-[10px] truncate max-w-[120px]">{l.requestId || 'N/A'}</td>
                <td className="p-3.5 text-slate-800 font-sans font-medium">{l.actorEmail || l.actor?.email || 'admin@dbi.ai'}</td>
                <td className="p-3.5 font-bold text-amber-600">{l.action}</td>
                <td className="p-3.5 text-slate-600 font-sans max-w-xs">{l.reason}</td>
                <td className="p-3.5"><StatusBadge status={l.status || 'SUCCESS'} /></td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-sans">{loading ? 'Loading...' : 'No audit records'}</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500 font-sans">
          <div>Page {data.page} of {totalPages} ({data.total} total)</div>
          <div className="flex gap-2">
            <button 
              onClick={() => loadLogs(data.page - 1)} 
              disabled={data.page <= 1 || loading}
              className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 shadow-sm font-sans"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button 
              onClick={() => loadLogs(data.page + 1)} 
              disabled={data.page >= totalPages || loading}
              className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 shadow-sm font-sans"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
