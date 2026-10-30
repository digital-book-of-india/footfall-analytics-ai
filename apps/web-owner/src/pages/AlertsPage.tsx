import React, { useCallback, useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { api } from '../services/apiClient';
import { SecurityEvent, ReviewStatus } from '../types';
import { EvidenceViewer } from '../components/EvidenceViewer';
import {
  ShieldIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  ClockIcon,
  XIcon
} from '../components/icons';

const EVENT_TYPE_LABELS: Record<string, string> = {
  PERSON_IN_ZONE: 'Person in zone',
  POSSIBLE_SHUTTER_INTERACTION: 'Possible shutter interaction',
  POSSIBLE_TAMPERING: 'Possible tampering',
  CAMERA_OFFLINE: 'Camera offline',
  AI_OFFLINE: 'AI worker offline'
};

const REVIEW_TABS: Array<{ value: ReviewStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'FALSE_ALARM', label: 'False alarm' },
  { value: 'CONFIRMED', label: 'Confirmed' }
];

const ReviewStatusBadge: React.FC<{ status: ReviewStatus }> = ({ status }) => {
  const styles: Record<ReviewStatus, string> = {
    NEW: 'bg-blue-50 text-blue-700 border-blue-200',
    REVIEWED: 'bg-slate-100 text-slate-700 border-slate-200',
    FALSE_ALARM: 'bg-amber-50 text-amber-700 border-amber-200',
    CONFIRMED: 'bg-rose-50 text-rose-700 border-rose-200'
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${styles[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

interface AlertsPageProps {
  onOpenNewShopModal?: () => void;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({ onOpenNewShopModal }) => {
  const { selectedShop, isLoading: shopLoading } = useShop();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewStatus | 'ALL'>('ALL');

  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<SecurityEvent | null>(null);
  const [loadingActive, setLoadingActive] = useState<boolean>(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchEvents = useCallback(async (reset: boolean) => {
    if (!selectedShop) {
      setIsLoading(false);
      return;
    }
    setError(null);
    if (reset) setIsLoading(true);
    else setIsLoadingMore(true);
    try {
      const res = await api.listEvents(selectedShop.id, {
        cursor: reset ? undefined : nextCursor || undefined,
        limit: 20
      });
      setEvents(prev => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load alerts');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShop]);

  useEffect(() => {
    fetchEvents(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShop]);

  const loadActiveEvent = useCallback(async (eventId: string) => {
    setLoadingActive(true);
    try {
      const event = await api.getEvent(eventId);
      setActiveEvent(event);
    } catch (err: any) {
      setError(err.message || 'Failed to load alert details');
    } finally {
      setLoadingActive(false);
    }
  }, []);

  useEffect(() => {
    if (activeEventId) loadActiveEvent(activeEventId);
  }, [activeEventId, loadActiveEvent]);

  const handleReview = async (eventId: string, reviewStatus: Exclude<ReviewStatus, 'NEW'>) => {
    setReviewingId(eventId);
    try {
      const updated = await api.reviewEvent(eventId, reviewStatus);
      setEvents(prev => prev.map(e => (e.eventId === eventId ? updated : e)));
      if (activeEvent?.eventId === eventId) setActiveEvent(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to update alert');
    } finally {
      setReviewingId(null);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!window.confirm('Delete this alert and its evidence picture? This cannot be undone.')) return;
    try {
      await api.deleteEvent(eventId);
      setEvents(prev => prev.filter(e => e.eventId !== eventId));
      setTotal(t => Math.max(0, t - 1));
      if (activeEventId === eventId) {
        setActiveEventId(null);
        setActiveEvent(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete alert');
    }
  };

  const filteredEvents = filter === 'ALL' ? events : events.filter(e => e.reviewStatus === filter);

  if (shopLoading && !selectedShop) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm font-medium animate-pulse">Loading alerts...</p>
      </div>
    );
  }

  if (!selectedShop) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm mb-4">Please select or create a store to view security zone alerts.</p>
        {onOpenNewShopModal && (
          <button
            type="button"
            onClick={onOpenNewShopModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition"
          >
            Create Store Location
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShieldIcon size={22} className="text-indigo-600" />
            Security Zone Alerts
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Alerts raised when the AI detects a person lingering in a watched zone for {selectedShop.name}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchEvents(true)}
          disabled={isLoading}
          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-200 transition"
          title="Refresh alerts"
        >
          <RefreshCwIcon size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start justify-between gap-3 text-rose-800">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-600">{error}</p>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 text-xs font-bold">✕</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {REVIEW_TABS.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              filter === tab.value
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="text-[11px] text-gray-400 ml-auto">{total} total</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(n => (
            <div key={n} className="bg-white p-4 rounded-2xl border border-gray-200 animate-pulse h-16" />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <ShieldIcon size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No Alerts Yet</h3>
          <p className="text-gray-500 text-xs max-w-sm mx-auto">
            Draw a security zone on a camera (Cameras & Lines tab) to start watching it. Alerts will show up here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
          {filteredEvents.map(event => (
            <button
              key={event.eventId}
              type="button"
              onClick={() => setActiveEventId(event.eventId)}
              className="w-full text-left px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  event.eventType === 'POSSIBLE_SHUTTER_INTERACTION' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  <AlertTriangleIcon size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                  </p>
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                    <ClockIcon size={11} />
                    {new Date(event.startedAt).toLocaleString()} • {Math.round(event.confidence * 100)}% confidence
                  </p>
                </div>
              </div>
              <ReviewStatusBadge status={event.reviewStatus} />
            </button>
          ))}
        </div>
      )}

      {nextCursor && !isLoading && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => fetchEvents(false)}
            disabled={isLoadingMore}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold disabled:opacity-50 transition"
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Alert Detail Modal */}
      {activeEventId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-gray-50 rounded-2xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 border border-gray-200 my-auto flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900">
                  {activeEvent ? EVENT_TYPE_LABELS[activeEvent.eventType] || activeEvent.eventType : 'Alert details'}
                </h3>
                {activeEvent && (
                  <p className="text-xs text-gray-500 mt-0.5">{new Date(activeEvent.startedAt).toLocaleString()}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveEventId(null);
                  setActiveEvent(null);
                }}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                aria-label="Close"
              >
                <XIcon size={18} />
              </button>
            </div>

            {loadingActive || !activeEvent ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <RefreshCwIcon size={20} className="animate-spin text-blue-600" />
                <span className="text-sm text-gray-600">Loading...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <EvidenceViewer event={activeEvent} onReload={() => loadActiveEvent(activeEvent.eventId)} />

                <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Status:</span>
                    <ReviewStatusBadge status={activeEvent.reviewStatus} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={reviewingId === activeEvent.eventId}
                      onClick={() => handleReview(activeEvent.eventId, 'REVIEWED')}
                      className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                    >
                      Mark Reviewed
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === activeEvent.eventId}
                      onClick={() => handleReview(activeEvent.eventId, 'FALSE_ALARM')}
                      className="px-3 py-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                    >
                      False Alarm
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === activeEvent.eventId}
                      onClick={() => handleReview(activeEvent.eventId, 'CONFIRMED')}
                      className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <CheckCircleIcon size={14} />
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(activeEvent.eventId)}
                      className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 px-1">
                  Marking a detection <strong>False Alarm</strong> teaches the AI to skip that spot on this camera.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
