import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminFetch } from '../api';
import { AuditLogItem, PaginatedResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export function AuditLogsPage() {
  const [data, setData] = useState<PaginatedResult<AuditLogItem>>({ items: [], total: 0, page: 1, limit: 20 });
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: page.toString(), limit: data.limit.toString() });
      const res = await adminFetch<PaginatedResult<AuditLogItem>>(`/admin/audit-logs?${q.toString()}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [data.limit]);

  useEffect(() => {
    loadLogs(1);
  }, [loadLogs]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Platform Audit Logs</h2>
          <p className="text-xs text-slate-400">Immutable trace of administrative actions</p>
        </div>
        <button onClick={() => loadLogs(data.page)} className="p-2 border border-slate-800 rounded bg-slate-900 hover:bg-slate-800 text-slate-400">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
            {data.items.map(l => (
              <tr key={l.id} className="hover:bg-slate-800/40">
                <td className="p-3 text-slate-400 text-[11px]">
                  <div>{new Date(l.createdAt).toISOString()}</div>
                  <div className="text-[10px] text-slate-600">{new Date(l.createdAt).toLocaleString()}</div>
                </td>
                <td className="p-3 text-slate-400 text-[10px] truncate max-w-[120px]">{l.requestId}</td>
                <td className="p-3 text-slate-200">{l.actorEmail}</td>
                <td className="p-3 font-semibold text-amber-400">{l.action}</td>
                <td className="p-3 text-slate-300 font-sans max-w-xs">{l.reason}</td>
                <td className="p-3"><StatusBadge status={l.status} /></td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500 font-sans">{loading ? 'Loading...' : 'No audit records'}</td></tr>
            )}
          </tbody>
        </table>

        <div className="p-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>Showing {data.items.length} of {data.total} records</span>
          <div className="flex gap-2">
            <button 
              disabled={data.page <= 1} 
              onClick={() => loadLogs(data.page - 1)}
              className="p-1 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-1 bg-slate-950 border border-slate-800 rounded font-mono">{data.page}</span>
            <button 
              disabled={data.page * data.limit >= data.total} 
              onClick={() => loadLogs(data.page + 1)}
              className="p-1 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
