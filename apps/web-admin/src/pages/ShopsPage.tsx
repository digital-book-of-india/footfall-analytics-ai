import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminFetch } from '../api';
import { ShopItem, PaginatedResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { StatusModal } from '../components/StatusModal';
import { useDebounce } from '../hooks/useDebounce';

export function ShopsPage() {
  const [data, setData] = useState<PaginatedResult<ShopItem>>({ items: [], total: 0, page: 1, limit: 10 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [loading, setLoading] = useState(false);
  const [modalShop, setModalShop] = useState<{ shop: any; target: 'ACTIVE' | 'SUSPENDED' } | null>(null);

  const debouncedSearch = useDebounce(search, 200);

  const loadShops = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: page.toString(),
        limit: '100',
        status: statusFilter,
        search: debouncedSearch,
        q: debouncedSearch
      });
      const res: any = await adminFetch(`/admin/shops?${q.toString()}`);
      const rawItems = Array.isArray(res) ? res : (res?.items || res?.shops || []);
      const total = typeof res?.total === 'number' ? res.total : rawItems.length;
      setData({ items: rawItems, total, page, limit: 10 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    loadShops(1);
  }, [statusFilter, debouncedSearch, loadShops]);

  const handleModalSubmit = async (reason: string) => {
    if (!modalShop) return;
    const targetId = modalShop.shop._id || modalShop.shop.id;
    await adminFetch(`/admin/shops/${targetId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: modalShop.target, reason })
    });
    setModalShop(null);
    loadShops(data.page);
  };

  // Instant Smart Filter on Frontend
  const filteredList = useMemo(() => {
    let list = data?.items || [];
    if (statusFilter !== 'ALL') {
      list = list.filter((s: any) => (s.status || 'ACTIVE').toUpperCase() === statusFilter);
    }
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase().trim();
      list = list.filter((s: any) => {
        const name = (s.name || '').toLowerCase();
        const ownerName = (s.ownerName || s.owner?.name || s.ownerUserId?.name || '').toLowerCase();
        const ownerEmail = (s.ownerEmail || s.owner?.email || s.ownerUserId?.email || '').toLowerCase();
        return name.includes(term) || ownerName.includes(term) || ownerEmail.includes(term);
      });
    }
    return list;
  }, [data?.items, statusFilter, debouncedSearch]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Shops Directory</h2>
          <p className="text-xs text-slate-400">Total: {filteredList.length} shops matched</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-1 border border-slate-800 rounded flex gap-1">
            {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map(p => (
              <button
                key={p}
                onClick={() => setStatusFilter(p)}
                className={`px-3 py-1 text-xs rounded transition ${statusFilter === p ? 'bg-amber-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="relative w-56 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shop or owner..." 
              className="w-full bg-slate-900 border border-slate-800 rounded pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-amber-500" 
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[600px]">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="p-3">Shop Name</th>
              <th className="p-3">Owner Contact</th>
              <th className="p-3">Cameras</th>
              <th className="p-3">Timezone</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredList.map((s: any) => (
              <tr key={s._id || s.id} className="hover:bg-slate-800/40">
                <td className="p-3 font-semibold text-slate-200">{s.name}</td>
                <td className="p-3 text-slate-400">
                  <div>{s.ownerName || s.owner?.name || s.ownerUserId?.name || 'N/A'}</div>
                  <div className="text-[10px] text-slate-500">{s.ownerEmail || s.owner?.email || s.ownerUserId?.email || (typeof s.ownerUserId === 'string' ? s.ownerUserId : 'N/A')}</div>
                </td>
                <td className="p-3 text-slate-300 font-mono">{s.cameraCount ?? s.camerasCount ?? 0}</td>
                <td className="p-3 text-slate-400">{s.timezone || 'Asia/Kolkata'}</td>
                <td className="p-3"><StatusBadge status={s.status || 'ACTIVE'} /></td>
                <td className="p-3 text-right">
                  {s.status === 'ACTIVE' ? (
                    <button 
                      onClick={() => setModalShop({ shop: s, target: 'SUSPENDED' })}
                      className="bg-red-950/50 border border-red-700 hover:bg-red-900 text-red-300 px-3 py-1 rounded text-xs transition"
                    >
                      Suspend
                    </button>
                  ) : (
                    <button 
                      onClick={() => setModalShop({ shop: s, target: 'ACTIVE' })}
                      className="bg-emerald-950/50 border border-emerald-700 hover:bg-emerald-900 text-emerald-300 px-3 py-1 rounded text-xs transition"
                    >
                      Activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredList.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-500">
                  {loading ? 'Fetching shops...' : 'No matching shops found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalShop && (
        <StatusModal 
          shop={modalShop.shop} 
          targetStatus={modalShop.target} 
          onClose={() => setModalShop(null)} 
          onSubmit={handleModalSubmit} 
        />
      )}
    </div>
  );
}
