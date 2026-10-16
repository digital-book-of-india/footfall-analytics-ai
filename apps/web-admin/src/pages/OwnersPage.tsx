import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminFetch } from '../api';
import { OwnerItem, PaginatedResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export function OwnersPage() {
  const [data, setData] = useState<PaginatedResult<OwnerItem>>({ items: [], total: 0, page: 1, limit: 10 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadOwners = useCallback(async (page: number = 1, searchQuery: string = search) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: page.toString(), limit: '10' });
      if (searchQuery.trim()) q.set('search', searchQuery.trim());
      const res: any = await adminFetch(`/admin/owners?${q.toString()}`);
      const raw = Array.isArray(res) ? res : (res?.items || res?.owners || []);
      const total = typeof res?.total === 'number' ? res.total : raw.length;
      setData({ items: raw, total, page, limit: 10 });
    } catch (err) {
      console.error('Failed to load owners:', err);
    } finally {
      setTimeout(() => setLoading(false), 200);
    }
  }, [search]);

  useEffect(() => {
    loadOwners(1);
  }, [loadOwners]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadOwners(1, search);
  };

  const totalPages = Math.ceil(data.total / data.limit) || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Shop Owners</h2>
          <p className="text-xs text-slate-500 mt-0.5">Total: {data.total} registered merchants</p>
        </div>
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Search merchant name or email..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="bg-white border border-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 w-60 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-sm"
            />
          </form>
          <button 
            onClick={() => loadOwners(data.page)} 
            disabled={loading}
            className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs min-w-[700px]">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3.5">Merchant</th>
              <th className="p-3.5">Email</th>
              <th className="p-3.5">Associated Shops</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">Registered On</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((o: OwnerItem) => (
              <tr key={o.id || o._id} className="hover:bg-slate-50/80 transition">
                <td className="p-3.5 font-semibold text-slate-900">{o.name}</td>
                <td className="p-3.5 text-slate-600 font-mono">{o.email}</td>
                <td className="p-3.5">
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold border border-slate-200">
                    {o.shopCount ?? o.shopsCount ?? 0} Shops
                  </span>
                </td>
                <td className="p-3.5"><StatusBadge status={o.status} /></td>
                <td className="p-3.5 text-slate-500">
                  {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-slate-400">{loading ? 'Loading...' : 'No owners found'}</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <div>Page {data.page} of {totalPages} ({data.total} total)</div>
          <div className="flex gap-2">
            <button 
              onClick={() => loadOwners(data.page - 1)} 
              disabled={data.page <= 1 || loading}
              className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 shadow-sm"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button 
              onClick={() => loadOwners(data.page + 1)} 
              disabled={data.page >= totalPages || loading}
              className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 shadow-sm"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
