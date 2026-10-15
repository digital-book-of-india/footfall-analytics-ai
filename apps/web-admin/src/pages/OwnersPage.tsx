import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminFetch } from '../api';
import { OwnerItem, PaginatedResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { useDebounce } from '../hooks/useDebounce';

export function OwnersPage() {
  const [data, setData] = useState<PaginatedResult<OwnerItem>>({ items: [], total: 0, page: 1, limit: 10 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const debouncedSearch = useDebounce(search, 400);

  const loadOwners = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: page.toString(),
        limit: data.limit.toString(),
        search: debouncedSearch
      });
      const res = await adminFetch<PaginatedResult<OwnerItem>>(`/admin/owners?${q.toString()}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [data.limit, debouncedSearch]);

  useEffect(() => {
    loadOwners(1);
  }, [debouncedSearch, loadOwners]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Shop Owners</h2>
          <p className="text-xs text-slate-400">Total: {data.total} registered merchants</p>
        </div>
        <div className="relative w-56 sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchant name or email..." 
            className="w-full bg-slate-900 border border-slate-800 rounded pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-amber-500" 
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[600px]">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="p-3">Merchant</th>
              <th className="p-3">Email</th>
              <th className="p-3">Associated Shops</th>
              <th className="p-3">Status</th>
              <th className="p-3">Registered On</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data.items.map(o => (
              <tr key={o._id} className="hover:bg-slate-800/40">
                <td className="p-3 font-semibold text-slate-200">{o.name}</td>
                <td className="p-3 text-slate-400 font-mono">{o.email}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-slate-300">
                    {o.shopsCount} Shops
                  </span>
                </td>
                <td className="p-3"><StatusBadge status={o.status} /></td>
                <td className="p-3 text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">{loading ? 'Loading...' : 'No merchants found'}</td></tr>
            )}
          </tbody>
        </table>

        <div className="p-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>Showing {data.items.length} of {data.total} merchants</span>
          <div className="flex gap-2">
            <button 
              disabled={data.page <= 1} 
              onClick={() => loadOwners(data.page - 1)}
              className="p-1 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-1 bg-slate-950 border border-slate-800 rounded font-mono">{data.page}</span>
            <button 
              disabled={data.page * data.limit >= data.total} 
              onClick={() => loadOwners(data.page + 1)}
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
