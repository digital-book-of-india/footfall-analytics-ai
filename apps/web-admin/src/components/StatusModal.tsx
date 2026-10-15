import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { ShopItem } from '../types';

interface StatusModalProps {
  shop: ShopItem;
  targetStatus: 'ACTIVE' | 'SUSPENDED';
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

export function StatusModal({ shop, targetStatus, onClose, onSubmit }: StatusModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (reason.trim().length < 5) {
      setError('Reason must be at least 5 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onSubmit(reason.trim());
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-md w-full space-y-4 shadow-2xl">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          Confirm Shop {targetStatus}
        </h3>
        <p className="text-xs text-slate-400">
          Updating status for <strong>{shop.name}</strong> to <span className="text-white font-medium">{targetStatus}</span> requires a mandatory audit trail.
        </p>
        {error && (
          <div className="p-2.5 bg-red-950/70 border border-red-800 text-red-300 rounded text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-300 mb-1 font-medium">Audit Reason (min 5 characters)</label>
          <textarea 
            value={reason} 
            onChange={(e) => setReason(e.target.value)} 
            className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white outline-none focus:border-amber-500 h-20"
            placeholder="e.g. KYC verification pending or merchant requested hold"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} disabled={loading} className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white">
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading} 
            className="px-4 py-1.5 rounded text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium transition disabled:opacity-50"
          >
            {loading ? 'Recording Audit...' : 'Confirm & Log'}
          </button>
        </div>
      </div>
    </div>
  );
}
