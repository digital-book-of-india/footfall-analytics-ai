import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { BuildingIcon, PlusIcon } from './icons';

interface NewShopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewShopModal: React.FC<NewShopModalProps> = ({ isOpen, onClose }) => {
  const { createShop } = useShop();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [occupancyBaseline, setOccupancyBaseline] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await createShop({
        name,
        timezone,
        occupancyBaseline: Number(occupancyBaseline)
      });
      setName('');
      setOccupancyBaseline(0);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create shop');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-gray-200 my-auto flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <BuildingIcon size={20} className="text-blue-600 shrink-0" />
              <span>Onboard New Store Location</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Set up a retail location for footfall video monitoring.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg text-lg font-bold ml-2 transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl shrink-0">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Store / Branch Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Phoenix Mall Flagship"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Local Timezone</label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT +8:00)</option>
              <option value="UTC">UTC Universal Time</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Starting Baseline Occupancy</label>
            <input
              type="number"
              min="0"
              value={occupancyBaseline}
              onChange={e => setOccupancyBaseline(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-sm font-semibold focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">Initial count offset for this branch (default 0).</p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 transition text-center"
            >
              <PlusIcon size={14} />
              {isSubmitting ? 'Creating...' : 'Create Store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
