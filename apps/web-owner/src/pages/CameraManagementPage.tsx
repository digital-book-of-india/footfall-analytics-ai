import React, { useState, useEffect, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { Camera, CameraTestResult, CountingLine, Zone, ConnectionType, Connector } from '../types';
import { api } from '../services/apiClient';
import { CameraStatusBadge } from '../components/StatusBadges';
import { CountingLineCanvas } from '../components/CountingLineCanvas';
import { ZoneEditorModal } from '../components/ZoneEditorModal';
import { ConnectorsPanel } from '../components/ConnectorsPanel';
import { ChannelsDialog } from '../components/ChannelsDialog';
import { maskRtspUrl, cameraErrorMessage } from '../utils/security';
import {
  VideoIcon,
  PlusIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  SlidersIcon,
  ShieldIcon,
  RadioIcon,
  ActivityIcon
} from '../components/icons';

interface CameraManagementPageProps {
  onOpenNewShopModal?: () => void;
  onNavigateToLive?: () => void;
}

export const CameraManagementPage: React.FC<CameraManagementPageProps> = ({ onOpenNewShopModal, onNavigateToLive }) => {
  const { selectedShop, isLoading: shopLoading } = useShop();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Add Camera Modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newCameraName, setNewCameraName] = useState<string>('');
  const [newConnectionType, setNewConnectionType] = useState<ConnectionType>('RTSP');
  const [newRtspUrl, setNewRtspUrl] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newConnectorId, setNewConnectorId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Edit Camera Modal
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [editCameraName, setEditCameraName] = useState<string>('');
  const [editConnectionType, setEditConnectionType] = useState<ConnectionType>('RTSP');
  const [editRtspUrl, setEditRtspUrl] = useState<string>('');
  const [editConnectorId, setEditConnectorId] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Test Camera State
  const [testingCameraId, setTestingCameraId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, CameraTestResult>>({});

  // Counting Line Modal State
  const [activeLineCamera, setActiveLineCamera] = useState<Camera | null>(null);
  const [activeLine, setActiveLine] = useState<CountingLine | null>(null);
  const [loadingLine, setLoadingLine] = useState<boolean>(false);

  // Security Zone Modal State
  const [activeZoneCamera, setActiveZoneCamera] = useState<Camera | null>(null);
  const [activeZone, setActiveZone] = useState<Zone | null>(null);
  const [loadingZone, setLoadingZone] = useState<boolean>(false);

  // Find Channels Dialog State
  const [channelsCamera, setChannelsCamera] = useState<Camera | null>(null);

  // Use Light Streams State
  const [isSwitchingStreams, setIsSwitchingStreams] = useState<boolean>(false);
  const [substreamMessage, setSubstreamMessage] = useState<string | null>(null);

  const handleOpenEditCamera = (camera: Camera) => {
    setEditingCamera(camera);
    setEditCameraName(camera.name);
    setEditConnectionType(camera.connectionType);
    setEditRtspUrl(camera.rtspUrlMasked || '');
    setEditConnectorId(camera.connectorId || '');
  };

  const handleSaveEditCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop || !editingCamera) return;
    setIsSavingEdit(true);
    setError(null);
    try {
      await api.updateCamera(selectedShop.id, editingCamera.id, {
        name: editCameraName,
        connectionType: editConnectionType,
        rtspUrl: editRtspUrl,
        connectorId: editConnectorId || null
      });
      setEditingCamera(null);
      fetchCameras();
    } catch (err: any) {
      setError(err.message || 'Failed to update camera feed');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const fetchCameras = useCallback(async () => {
    if (!selectedShop) {
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const [cameraData, connectorData] = await Promise.all([
        api.getCameras(selectedShop.id),
        api.getConnectors(selectedShop.id).catch(() => [])
      ]);
      setCameras(cameraData);
      setConnectors(connectorData.filter((c) => c.status !== 'REVOKED'));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch camera feeds');
    } finally {
      setIsLoading(false);
    }
  }, [selectedShop]);

  useEffect(() => {
    setIsLoading(true);
    fetchCameras();
  }, [fetchCameras]);

  const handleAddCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Send raw RTSP or composite URL to backend, but never log it directly
      let finalUrl = newRtspUrl.trim();
      if (!finalUrl && newConnectionType === 'MOCK_STREAM') {
        finalUrl = 'rtsp://demo-stream/test-clip.mp4';
      }
      if (newUsername && newPassword && finalUrl.startsWith('rtsp://')) {
        const withoutScheme = finalUrl.replace('rtsp://', '');
        finalUrl = `rtsp://${encodeURIComponent(newUsername)}:${encodeURIComponent(newPassword)}@${withoutScheme}`;
      }

      await api.createCamera(selectedShop.id, {
        name: newCameraName,
        connectionType: newConnectionType,
        rtspUrl: finalUrl,
        connectorId: newConnectorId || null
      });

      setShowAddModal(false);
      setNewCameraName('');
      setNewConnectorId('');
      setNewRtspUrl('');
      setNewUsername('');
      setNewPassword('');
      fetchCameras();
    } catch (err: any) {
      setError(err.message || 'Failed to register camera stream');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestCamera = async (cameraId: string) => {
    setTestingCameraId(cameraId);
    try {
      const result = await api.testCamera(cameraId);
      setTestResults(prev => ({ ...prev, [cameraId]: result }));
      // Refresh camera status in list
      setCameras(prev =>
        prev.map(c => (c.id === cameraId ? { ...c, status: result.status, safeErrorCode: result.safeErrorCode } : c))
      );
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [cameraId]: {
          cameraId,
          status: 'CONFIG_ERROR',
          isReachable: false,
          safeErrorCode: 'CONNECTION_FAILED',
          message: err.message || 'Network timeout contacting RTSP stream',
          testedAt: new Date().toISOString()
        }
      }));
    } finally {
      setTestingCameraId(null);
    }
  };

  const handleDeleteCamera = async (camera: Camera) => {
    if (!window.confirm(`Remove "${camera.name}"? Its counting line will be deleted; past footfall history is kept.`)) {
      return;
    }
    setError(null);
    try {
      await api.deleteCamera(camera.id);
      fetchCameras();
    } catch (err: any) {
      setError(err.message || 'Failed to remove camera');
    }
  };

  const handleOpenCountingLine = async (camera: Camera) => {
    setActiveLineCamera(camera);
    setLoadingLine(true);
    try {
      const line = await api.getCountingLine(camera.id);
      setActiveLine(line);
    } catch {
      setActiveLine(null);
    } finally {
      setLoadingLine(false);
    }
  };

  const handleUseLightStreams = async () => {
    if (!selectedShop) return;
    setIsSwitchingStreams(true);
    setSubstreamMessage(null);
    setError(null);
    try {
      const result = await api.useSubstreams(selectedShop.id);
      const skippedNote = result.skipped ? ` (${result.skipped} skipped)` : '';
      setSubstreamMessage(
        `${result.changed} of ${result.total} camera${result.total === 1 ? '' : 's'} now use the light stream${skippedNote}.`
      );
      fetchCameras();
    } catch (err: any) {
      setError(err.message || 'Failed to switch cameras to their light stream');
    } finally {
      setIsSwitchingStreams(false);
    }
  };

  const handleSaveCountingLine = async (lineData: any) => {
    if (!activeLineCamera) return;
    try {
      await api.updateCountingLine(activeLineCamera.id, lineData);
      setActiveLineCamera(null);
      setActiveLine(null);
      fetchCameras();
    } catch (err: any) {
      setError(err.message || 'Failed to save virtual line coordinates');
    }
  };

  const handleOpenZone = async (camera: Camera) => {
    setActiveZoneCamera(camera);
    setLoadingZone(true);
    try {
      const zone = await api.getZone(camera.id);
      setActiveZone(zone);
    } catch {
      setActiveZone(null);
    } finally {
      setLoadingZone(false);
    }
  };

  const handleSaveZone = async (zoneData: any) => {
    if (!activeZoneCamera) return;
    await api.saveZone(activeZoneCamera.id, zoneData);
    setActiveZoneCamera(null);
    setActiveZone(null);
    fetchCameras();
  };

  if (shopLoading && !selectedShop) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm font-medium animate-pulse">Loading camera configurations...</p>
      </div>
    );
  }

  if (!selectedShop) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm mb-4">Please select or create a store to manage entrance cameras.</p>
        {onOpenNewShopModal && (
          <button
            type="button"
            onClick={onOpenNewShopModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition"
          >
            <PlusIcon size={16} />
            Create Store Location
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Entrance Cameras & AI Counting Lines</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Configure entrance video streams and calibrate virtual crossing lines for {selectedShop.name}.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={fetchCameras}
            disabled={isLoading}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-200 transition"
            title="Refresh camera list"
          >
            <RefreshCwIcon size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>

          {onNavigateToLive && (
            <button
              type="button"
              onClick={onNavigateToLive}
              className="px-3.5 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <VideoIcon size={14} />
              Live View
            </button>
          )}

          {cameras.length > 1 && (
            <button
              type="button"
              onClick={handleUseLightStreams}
              disabled={isSwitchingStreams}
              title="Switch Hikvision cameras to their lighter sub-stream"
              className="px-3.5 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <ActivityIcon size={14} className={isSwitchingStreams ? 'animate-pulse' : ''} />
              {isSwitchingStreams ? 'Switching...' : 'Use light streams'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition"
          >
            <PlusIcon size={16} />
            Add Camera
          </button>
        </div>
      </div>

      {substreamMessage && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-xs text-blue-800">
          {substreamMessage}
        </div>
      )}

      {/* Secret Handling Notice */}
      <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <RadioIcon size={16} />
          </div>
          <div>
            <span className="font-semibold text-white">Stream Security Active:</span> RTSP passwords and credential headers are never stored in plain text or reflected back in responses.
          </div>
        </div>
        <div className="hidden sm:block text-slate-400 font-mono text-[11px]">
          Target: AI Worker Headless Pipeline
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start justify-between gap-3 text-rose-800">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Camera Operation Error</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* On-site Connectors */}
      <ConnectorsPanel shopId={selectedShop.id} />

      {/* Cameras List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(n => (
            <div key={n} className="bg-white p-6 rounded-2xl border border-gray-200 animate-pulse space-y-4">
              <div className="h-5 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-100 rounded w-2/3"></div>
              <div className="h-10 bg-gray-100 rounded"></div>
            </div>
          ))}
        </div>
      ) : cameras.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <VideoIcon size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No Cameras Configured</h3>
          <p className="text-gray-500 text-xs max-w-sm mx-auto mb-6">
            Connect an entrance RTSP camera or test stream clip to begin counting footfall traffic.
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 shadow-sm"
          >
            <PlusIcon size={16} />
            Configure First Camera
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {cameras.map(camera => {
            const testResult = testResults[camera.id];
            const isTesting = testingCameraId === camera.id;

            return (
              <div
                key={camera.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col justify-between hover:border-gray-300 transition"
              >
                <div className="p-6">
                  {/* Title & Status */}
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <VideoIcon size={18} className="text-gray-700" />
                        <h3 className="text-base font-bold text-gray-900">{camera.name}</h3>
                        {camera.connectionType === 'MOCK_STREAM' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            DEMO STREAM
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-mono mt-1">ID: {camera.id}</p>
                    </div>
                    <CameraStatusBadge status={camera.status} />
                  </div>

                  {/* Camera Details */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">Connection Protocol</span>
                      <span className="font-semibold text-gray-800">{camera.connectionType}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">Stream Address</span>
                      <span className="font-mono text-gray-700 truncate max-w-[220px]" title={camera.rtspUrlMasked}>
                        {maskRtspUrl(camera.rtspUrlMasked)}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">On-site Connector</span>
                      <span className="font-semibold text-gray-800">
                        {camera.connectorId
                          ? connectors.find(c => c.id === camera.connectorId)?.name || 'Linked connector'
                          : 'None (direct)'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-500">Last Heartbeat</span>
                      <span className="text-gray-700">
                        {camera.lastHeartbeatAt ? new Date(camera.lastHeartbeatAt).toLocaleTimeString() : 'Never'}
                      </span>
                    </div>

                    {camera.safeErrorCode && (
                      <div className="p-2.5 bg-rose-50 rounded-xl text-rose-700 border border-rose-200 flex items-center gap-2">
                        <AlertTriangleIcon size={14} />
                        <span>{cameraErrorMessage(camera.safeErrorCode)}</span>
                      </div>
                    )}

                    {/* Test result display */}
                    {testResult && (
                      <div
                        className={`p-3 rounded-xl border mt-2 flex items-start gap-2 ${
                          testResult.isReachable
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {testResult.isReachable ? (
                          <CheckCircleIcon size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                        ) : (
                          <AlertTriangleIcon size={16} className="text-rose-600 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <p className="font-semibold text-[11px]">{testResult.message}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Tested at {new Date(testResult.testedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="p-3.5 sm:p-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteCamera(camera)}
                    className="w-full sm:w-auto justify-center px-3.5 py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition sm:mr-auto"
                  >
                    Remove
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestCamera(camera.id)}
                    disabled={isTesting}
                    className="w-full sm:w-auto justify-center px-3.5 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCwIcon size={14} className={isTesting ? 'animate-spin' : ''} />
                    {isTesting ? 'Testing Stream...' : 'Test Connection'}
                  </button>

                  {camera.connectorId && (
                    <button
                      type="button"
                      onClick={() => setChannelsCamera(camera)}
                      className="w-full sm:w-auto justify-center px-3.5 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <RadioIcon size={14} />
                      Find channels
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenEditCamera(camera)}
                    className="w-full sm:w-auto justify-center px-3.5 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <SlidersIcon size={14} />
                    Edit Stream
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenCountingLine(camera)}
                    className="w-full sm:w-auto justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <SlidersIcon size={14} />
                    Configure Counting Line
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenZone(camera)}
                    className="w-full sm:w-auto justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <ShieldIcon size={14} />
                    Configure Security Zone
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Camera Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-4 sm:p-6 border border-gray-200 my-auto flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                  <VideoIcon size={20} className="text-blue-600 shrink-0" />
                  <span>Register Entrance Camera</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Connect a camera stream located at the entrance doorway.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg text-lg font-bold ml-2 transition"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCamera} className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Camera Label / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Entrance North"
                  value={newCameraName}
                  onChange={e => setNewCameraName(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Connection Protocol</label>
                <select
                  value={newConnectionType}
                  onChange={e => {
                    const val = e.target.value as any;
                    setNewConnectionType(val);
                    if (val === 'MOCK_STREAM' && !newRtspUrl) {
                      setNewRtspUrl('rtsp://demo-stream/test-clip.mp4');
                    }
                  }}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="RTSP">RTSP (Standard IP Camera Stream)</option>
                  <option value="MOCK_STREAM">Mock Clip Pipeline (DEMO Mode)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">On-site Connector (Optional)</label>
                <select
                  value={newConnectorId}
                  onChange={e => setNewConnectorId(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">None — cloud AI worker connects directly</option>
                  {connectors.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.online ? '(online)' : c.status === 'PENDING' ? '(not paired yet)' : '(offline)'}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Pick a connector if this camera is only reachable from the shop's own network.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">RTSP Stream URI</label>
                <input
                  type="text"
                  required
                  placeholder="rtsp://192.168.1.120:554/h264Preview_01_main"
                  value={newRtspUrl}
                  onChange={e => setNewRtspUrl(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Private or VPN network RTSP streams only. Ports should not be exposed publicly.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Username (Optional)</label>
                  <input
                    type="text"
                    placeholder="admin"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Password (Optional)</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-600 border border-gray-200 flex items-center gap-2">
                <ShieldIcon size={16} className="text-emerald-600 shrink-0" />
                <span>Credentials will be encrypted with server-side managed keys and never returned in UI.</span>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition text-center"
                >
                  {isSubmitting ? 'Registering...' : 'Add Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Camera Modal */}
      {editingCamera && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-4 sm:p-6 border border-gray-200 my-auto flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                  <VideoIcon size={20} className="text-blue-600 shrink-0" />
                  <span>Edit Camera Configuration</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Update stream metadata for {editingCamera.name} (ID: {editingCamera.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCamera(null)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg text-lg font-bold ml-2 transition"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditCamera} className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Camera Label / Name</label>
                <input
                  type="text"
                  required
                  value={editCameraName}
                  onChange={e => setEditCameraName(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Connection Protocol</label>
                <select
                  value={editConnectionType}
                  onChange={e => setEditConnectionType(e.target.value as any)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="RTSP">RTSP (Standard IP Camera Stream)</option>
                  <option value="MOCK_STREAM">Mock Clip Pipeline (DEMO Mode)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">On-site Connector (Optional)</label>
                <select
                  value={editConnectorId}
                  onChange={e => setEditConnectorId(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">None — cloud AI worker connects directly</option>
                  {connectors.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.online ? '(online)' : c.status === 'PENDING' ? '(not paired yet)' : '(offline)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">RTSP Stream Address / URL</label>
                <input
                  type="text"
                  required
                  value={editRtspUrl}
                  onChange={e => setEditRtspUrl(e.target.value)}
                  className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCamera(null)}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition text-center"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Counting Line Modal Canvas */}
      {activeLineCamera && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-fadeIn overflow-y-auto">
          {loadingLine ? (
            <div className="bg-white p-8 rounded-2xl flex items-center gap-3">
              <RefreshCwIcon size={20} className="animate-spin text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Loading virtual line configuration...</span>
            </div>
          ) : (
            <CountingLineCanvas
              cameraName={activeLineCamera.name}
              fetchFrame={() => api.fetchLiveFrame(activeLineCamera.id)}
              requestLive={() => api.requestLive(activeLineCamera.id)}
              initialCoordinates={activeLine?.coordinates}
              initialInDirection={activeLine?.inDirection}
              initialOutDirection={activeLine?.outDirection}
              initialEnabled={activeLine?.enabled}
              onSave={handleSaveCountingLine}
              onCancel={() => {
                setActiveLineCamera(null);
                setActiveLine(null);
              }}
            />
          )}
        </div>
      )}

      {/* Security Zone Modal */}
      {activeZoneCamera && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-fadeIn overflow-y-auto">
          {loadingZone ? (
            <div className="bg-white p-8 rounded-2xl flex items-center gap-3">
              <RefreshCwIcon size={20} className="animate-spin text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Loading zone configuration...</span>
            </div>
          ) : (
            <ZoneEditorModal
              cameraName={activeZoneCamera.name}
              fetchFrame={() => api.fetchLiveFrame(activeZoneCamera.id)}
              requestLive={() => api.requestLive(activeZoneCamera.id)}
              initialPolygon={activeZone?.polygon}
              initialZoneType={activeZone?.zoneType}
              initialSensitivity={activeZone?.sensitivity}
              initialEnabled={activeZone?.enabled}
              onSave={handleSaveZone}
              onCancel={() => {
                setActiveZoneCamera(null);
                setActiveZone(null);
              }}
            />
          )}
        </div>
      )}

      {/* Find Channels Dialog */}
      {channelsCamera && (
        <ChannelsDialog
          camera={channelsCamera}
          onClose={() => setChannelsCamera(null)}
          onAdded={() => fetchCameras()}
        />
      )}
    </div>
  );
};
