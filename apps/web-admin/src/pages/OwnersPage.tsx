import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search } from 'lucide-react';
import { adminFetch } from '../api';
import { OwnerItem, PaginatedResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { useDebounce } from '../hooks/useDebounce';

export function OwnersPage() {
  const [data, setData] = useState<PaginatedResult<OwnerItem>>({ items: [], total: 0, page: 1, limit: 10 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const debouncedSearch = useDebounce(search, 200);

  const loadOwners = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: page.toString(),
        limit: '100',
        search: debouncedSearch,
        q: debouncedSearch
      });
      const res: any = await adminFetch(`/admin/owners?${q.toString()}`);
      const rawItems = Array.isArray(res) ? res : (res?.items || res?.owners || []);
      const total = typeof res?.total === 'number' ? res.total : rawItems.length;
      setData({ items: rawItems, total, page, limit: 10 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadOwners(1);
  }, [debouncedSearch, loadOwners]);

  // Instant Smart Filter on Frontend
  const filteredList = useMemo(() => {
    const list = data?.items || [];
    if (!debouncedSearch.trim()) return list;
    const term = debouncedSearch.toLowerCase().trim();
    return list.filter((o: any) => {
      const name = (o.name || '').toLowerCase();
      const email = (o.email || '').toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [data?.items, debouncedSearch]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Shop Owners</h2>
          <p className="text-xs text-slate-400">Total: {filteredList.length} registered merchants</p>
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
            {filteredList.map((o: any) => (
              <tr key={o._id || o.id} className="hover:bg-slate-800/40">
                <td className="p-3 font-semibold text-slate-200">{o.name}</td>
                <td className="p-3 text-slate-400 font-mono">{o.email}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-slate-300">
                    {o.shopCount ?? o.shopsCount ?? (Array.isArray(o.shops) ? o.shops.length : 1)} Shops
                  </span>
                </td>
                <td className="p-3"><StatusBadge status={o.status || 'ACTIVE'} /></td>
                <td className="p-3 text-slate-400">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}</td>
              </tr>
            ))}
            {filteredList.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">{loading ? 'Loading...' : 'No merchants found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
