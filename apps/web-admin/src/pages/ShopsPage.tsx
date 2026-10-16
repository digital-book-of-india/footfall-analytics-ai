import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminFetch } from '../api';
import { ShopItem, PaginatedResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export function ShopsPage() {
  const [data, setData] = useState<PaginatedResult<ShopItem>>({ items: [], total: 0, page: 1, limit: 10 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [loading, setLoading] = useState(false);
  const [selectedShop, setSelectedShop] = useState<ShopItem | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadShops = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: page.toString(), limit: '10' });
      const res: any = await adminFetch(`/admin/shops?${q.toString()}`);
      const raw = Array.isArray(res) ? res : (res?.items || res?.shops || []);
      const total = typeof res?.total === 'number' ? res.total : raw.length;
      setData({ items: raw, total, page, limit: 10 });
    } catch (err) {
      console.error('Failed to load shops:', err);
    } finally {
      setTimeout(() => setLoading(false), 200);
    }
  }, []);

  useEffect(() => {
    loadShops(1);
  }, [loadShops]);

  const filteredShops = useMemo(() => {
    const list = data?.items || [];
    return list.filter((s: ShopItem) => {
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      const q = search.toLowerCase().trim();
      const matchesSearch = !q || 
        s.name.toLowerCase().includes(q) || 
        (s.ownerName && s.ownerName.toLowerCase().includes(q)) ||
        (s.ownerEmail && s.ownerEmail.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [data?.items, statusFilter, search]);

  const handleStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop) return;
    if (reason.trim().length < 5) {
      setActionError('An audited reason (minimum 5 characters) is required.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const targetStatus = selectedShop.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      await adminFetch(`/admin/shops/${selectedShop.id || selectedShop._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus, reason: reason.trim() }),
      });
      setSelectedShop(null);
      setReason('');
      loadShops(data.page);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update shop status');
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(data.total / data.limit) || 1;

  return (
    <div className="space-y-4">
      {/* Title & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Shops Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">Total: {data.total} registered retail stores</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status Tabs */}
          <div className="flex bg-slate-200/70 p-1 rounded-lg text-xs font-semibold">
            {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map(t => (
              <button
                key={t}
                onClick={() => setStatusFilter(t)}
                className={`px-3 py-1 rounded-md transition ${
                  statusFilter === t 
                    ? 'bg-amber-500 text-white shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Search shop or owner..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="bg-white border border-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 w-56 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-sm"
            />
          </div>

          {/* Refresh */}
          <button 
            onClick={() => loadShops(data.page)} 
            disabled={loading}
            className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs min-w-[700px]">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-3.5">Shop Name</th>
              <th className="p-3.5">Owner Contact</th>
              <th className="p-3.5">Cameras</th>
              <th className="p-3.5">Timezone</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredShops.map((s: ShopItem) => (
              <tr key={s.id || s._id} className="hover:bg-slate-50/80 transition">
                <td className="p-3.5 font-semibold text-slate-900">{s.name}</td>
                <td className="p-3.5 text-slate-600">
                  <div className="font-medium text-slate-800">{s.ownerName || s.owner?.name || 'Unknown'}</div>
                  <div className="text-[11px] text-slate-400">{s.ownerEmail || s.owner?.email || ''}</div>
                </td>
                <td className="p-3.5 font-medium text-slate-700">{s.cameraCount ?? 0}</td>
                <td className="p-3.5 text-slate-500">{s.timezone || 'UTC'}</td>
                <td className="p-3.5"><StatusBadge status={s.status} /></td>
                <td className="p-3.5 text-right">
                  <button 
                    onClick={() => { setSelectedShop(s); setReason(''); setActionError(''); }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition shadow-sm ${
                      s.status === 'ACTIVE' 
                        ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200' 
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {s.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {filteredShops.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">{loading ? 'Loading...' : 'No shops found'}</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <div>Page {data.page} of {totalPages} ({data.total} total)</div>
          <div className="flex gap-2">
            <button 
              onClick={() => loadShops(data.page - 1)} 
              disabled={data.page <= 1 || loading}
              className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 shadow-sm"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button 
              onClick={() => loadShops(data.page + 1)} 
              disabled={data.page >= totalPages || loading}
              className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 shadow-sm"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedShop && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleStatusChange} className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-900">
              {selectedShop.status === 'ACTIVE' ? 'Suspend Shop' : 'Activate Shop'}: {selectedShop.name}
            </h3>
            <p className="text-xs text-slate-500">
              Please enter an audited reason for changing this store status. Mandatory compliance rule requires minimum 5 characters.
            </p>
            {actionError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg">{actionError}</div>}
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500"
              rows={3}
              placeholder="e.g. Temporary regulatory inspection..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setSelectedShop(null)} 
                className="px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg shadow-sm disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
