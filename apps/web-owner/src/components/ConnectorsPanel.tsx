import React, { useCallback, useEffect, useState } from 'react';
import { Connector, ConnectorWithPairingCode } from '../types';
import { api } from '../services/apiClient';
import {
  PlusIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  RadioIcon,
  DownloadIcon,
  XIcon
} from './icons';

interface ConnectorsPanelProps {
  shopId: string;
}

function ConnectorStatusDot({ connector }: { connector: Connector }) {
  const color = connector.online
    ? 'bg-emerald-500'
    : connector.status === 'PENDING'
    ? 'bg-amber-400'
    : connector.status === 'REVOKED'
    ? 'bg-gray-300'
    : 'bg-rose-400';
  const label = connector.online
    ? 'Online'
    : connector.status === 'PENDING'
    ? 'Awaiting pairing'
    : connector.status === 'REVOKED'
    ? 'Revoked'
    : 'Offline';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

/**
 * Manages on-site Connector agents for a shop: pair a new Windows PC to bridge LAN
 * cameras the cloud AI worker can't directly reach, and view/revoke existing ones.
 */
export const ConnectorsPanel: React.FC<ConnectorsPanelProps> = ({ shopId }) => {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [pairingReveal, setPairingReveal] = useState<ConnectorWithPairingCode | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchConnectors = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getConnectors(shopId);
      setConnectors(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load connectors');
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    setIsLoading(true);
    fetchConnectors();
  }, [fetchConnectors]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const created = await api.createConnector(shopId, { name: newName.trim() });
      setPairingReveal(created);
      setNewName('');
      fetchConnectors();
    } catch (err: any) {
      setError(err.message || 'Failed to create connector');
    } finally {
      setIsCreating(false);
    }
  };

  const handleReissue = async (connectorId: string) => {
    setActioningId(connectorId);
    setError(null);
    try {
      const updated = await api.reissuePairingCode(connectorId);
      setPairingReveal(updated);
      fetchConnectors();
    } catch (err: any) {
      setError(err.message || 'Failed to issue a new pairing code');
    } finally {
      setActioningId(null);
    }
  };

  const handleRevoke = async (connectorId: string) => {
    if (!window.confirm('Revoke this connector? The paired PC will immediately lose access and need to re-pair.')) {
      return;
    }
    setActioningId(connectorId);
    setError(null);
    try {
      await api.revokeConnector(connectorId);
      fetchConnectors();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke connector');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <RadioIcon size={16} className="text-blue-600" />
            On-site Connectors
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pair a PC on this shop's own network for cameras the cloud AI worker can't reach directly (NAT/firewall).
          </p>
        </div>
        <a
          href="https://github.com/digital-book-of-india/footfall-analytics-ai/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition shrink-0"
        >
          <DownloadIcon size={14} />
          Download Connector
        </a>
      </div>

      {error && (
        <div className="mx-4 sm:mx-5 mt-4 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2 text-rose-800">
          <AlertTriangleIcon size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      <div className="p-4 sm:p-5 space-y-3">
        {isLoading ? (
          <div className="text-xs text-gray-400 animate-pulse">Loading connectors...</div>
        ) : connectors.length === 0 ? (
          <p className="text-xs text-gray-500">No connectors paired yet for this shop.</p>
        ) : (
          connectors.map((c) => (
            <div
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-900 truncate">{c.name}</span>
                  <ConnectorStatusDot connector={c} />
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {c.activeCameraCount} camera{c.activeCameraCount === 1 ? '' : 's'} ·{' '}
                  {c.lastHeartbeatAt ? `Last seen ${new Date(c.lastHeartbeatAt).toLocaleString()}` : 'Never connected'}
                  {c.lastSeenVersion ? ` · v${c.lastSeenVersion}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.status !== 'REVOKED' && (
                  <button
                    type="button"
                    disabled={actioningId === c.id}
                    onClick={() => handleReissue(c.id)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
                  >
                    {c.status === 'PENDING' ? 'View code' : 'Re-pair'}
                  </button>
                )}
                {c.status !== 'REVOKED' && (
                  <button
                    type="button"
                    disabled={actioningId === c.id}
                    onClick={() => handleRevoke(c.id)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        <form onSubmit={handleCreate} className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Back office PC"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isCreating || !newName.trim()}
            className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition"
          >
            <PlusIcon size={14} />
            New Connector
          </button>
          <button
            type="button"
            onClick={fetchConnectors}
            className="shrink-0 p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-200 transition"
            title="Refresh"
          >
            <RefreshCwIcon size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </form>
      </div>

      {/* Pairing code reveal modal */}
      {pairingReveal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-200">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-sm font-bold text-gray-900">Pairing code for "{pairingReveal.name}"</h3>
              <button
                type="button"
                onClick={() => setPairingReveal(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <XIcon size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Install the DBI Footfall Connector on the shop's PC, open it, and paste this code. It expires at{' '}
              {new Date(pairingReveal.pairingCodeExpiresAt).toLocaleTimeString()}.
            </p>
            <div className="bg-gray-900 text-white rounded-xl py-4 text-center font-mono text-2xl tracking-widest select-all">
              {pairingReveal.pairingCode}
            </div>
            <button
              type="button"
              onClick={() => setPairingReveal(null)}
              className="w-full mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
