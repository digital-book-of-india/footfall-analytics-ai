import React, { useEffect, useRef, useState } from 'react';
import { Camera, DiscoveredChannel } from '../types';
import { api } from '../services/apiClient';
import { XIcon, RefreshCwIcon, AlertTriangleIcon, CheckIcon, PlusIcon } from './icons';

const POLL_MS = 1500;
const MAX_POLLS = 50; // ~75s max — a full channel scan can take up to a minute.

const SCAN_ERROR_MESSAGE: Record<string, string> = {
  AUTH_FAILED: 'The camera rejected the login credentials.',
  NO_CHANNELS_FOUND: 'No channels answered with video on this recorder.',
  CONNECTION_TIMEOUT: 'The camera did not respond in time.',
  CONNECTION_REFUSED: 'The camera refused the connection.',
  SCAN_FAILED: 'The channel scan failed unexpectedly.',
  TIMEOUT: 'The scan took too long and was stopped.'
};

interface ChannelsDialogProps {
  camera: Camera;
  onClose: () => void;
  onAdded: () => void;
}

export const ChannelsDialog: React.FC<ChannelsDialogProps> = ({ camera, onClose, onAdded }) => {
  const [phase, setPhase] = useState<'scanning' | 'done' | 'error'>('scanning');
  const [channels, setChannels] = useState<DiscoveredChannel[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [addedPaths, setAddedPaths] = useState<Set<string>>(new Set());
  const [addingPath, setAddingPath] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let polls = 0;

    const poll = async (jobId: string) => {
      if (cancelledRef.current) return;
      polls += 1;
      try {
        const result = await api.getChannelScan(camera.id, jobId);
        if (cancelledRef.current) return;
        if (result.status === 'DONE') {
          const found = result.channels || [];
          setChannels(found);
          setScanError(result.error || null);
          setDebug(result.debug || null);
          const seeded: Record<string, string> = {};
          found.forEach((ch, idx) => {
            seeded[ch.path] = ch.label || `Channel ${idx + 1}`;
          });
          setNames(seeded);
          setPhase('done');
          return;
        }
        if (polls >= MAX_POLLS) {
          setScanError('TIMEOUT');
          setPhase('done');
          return;
        }
        setTimeout(() => poll(jobId), POLL_MS);
      } catch (err: any) {
        if (cancelledRef.current) return;
        setScanError(err.message || 'SCAN_FAILED');
        setPhase('error');
      }
    };

    (async () => {
      try {
        const { jobId } = await api.startChannelScan(camera.id);
        if (cancelledRef.current) return;
        setTimeout(() => poll(jobId), POLL_MS);
      } catch (err: any) {
        if (cancelledRef.current) return;
        setScanError(err.message || 'SCAN_FAILED');
        setPhase('error');
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [camera.id]);

  const handleAdd = async (channel: DiscoveredChannel) => {
    setAddingPath(channel.path);
    setMessage(null);
    try {
      await api.addChannel(camera.id, channel.path, names[channel.path] || channel.label);
      setAddedPaths(prev => new Set(prev).add(channel.path));
      setMessage(`Added "${names[channel.path] || channel.label}".`);
      onAdded();
    } catch (err: any) {
      setMessage(err.message || 'Failed to add this channel.');
    } finally {
      setAddingPath(null);
    }
  };

  const errorText = scanError ? SCAN_ERROR_MESSAGE[scanError] || 'Could not list the channels.' : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 border border-gray-200 my-auto flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900">Find Channels — {camera.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              The Connector scans the recorder and grabs a picture of every channel it finds.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg text-lg font-bold ml-2 transition"
            aria-label="Close dialog"
          >
            <XIcon size={18} />
          </button>
        </div>

        {phase === 'scanning' && (
          <div className="flex items-center gap-3 p-6 justify-center text-gray-500 text-sm">
            <RefreshCwIcon size={18} className="animate-spin" />
            Scanning for channels... this can take up to a minute.
          </div>
        )}

        {phase !== 'scanning' && errorText && channels.length === 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800">
            <div className="flex items-start gap-2">
              <AlertTriangleIcon size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold">{errorText}</p>
            </div>
            {debug && <p className="text-[10px] text-rose-500 mt-2 font-mono break-all">{debug}</p>}
          </div>
        )}

        {phase === 'done' && channels.length > 0 && (
          <div className="space-y-3">
            {message && <p className="text-xs text-emerald-700">{message}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {channels.map(channel => {
                const added = Boolean(channel.alreadyAdded) || addedPaths.has(channel.path);
                return (
                  <div key={channel.path} className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2">
                    <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
                      {channel.thumbnail ? (
                        <img src={channel.thumbnail} alt={channel.label} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-slate-500 text-[11px]">No preview</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={names[channel.path] ?? channel.label}
                      onChange={e => setNames(prev => ({ ...prev, [channel.path]: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      disabled={added || addingPath === channel.path}
                      onClick={() => handleAdd(channel)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-60 ${
                        added
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {added ? (
                        <>
                          <CheckIcon size={13} /> Added
                        </>
                      ) : addingPath === channel.path ? (
                        'Adding...'
                      ) : (
                        <>
                          <PlusIcon size={13} /> Add this channel
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {phase === 'done' && channels.length === 0 && !errorText && (
          <p className="text-xs text-gray-500">No channels were found.</p>
        )}
      </div>
    </div>
  );
};
