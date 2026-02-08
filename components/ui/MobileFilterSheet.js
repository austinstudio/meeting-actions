import React from 'react';
import { X } from 'lucide-react';
import { PREDEFINED_TAGS, TAG_COLORS } from '../constants';

export default function MobileFilterSheet({ isOpen, onClose, view, setView, dueDateFilter, setDueDateFilter, tagFilter, setTagFilter, stats }) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50 md:hidden"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-neutral-900 rounded-t-2xl shadow-xl md:hidden max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <h3 className="font-semibold text-slate-800 dark:text-white">Filters</h3>
          <button onClick={onClose} className="p-1 text-slate-400 dark:text-neutral-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-6">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">View</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'all', label: 'All Items' },
                { id: 'mine', label: 'My Tasks', count: stats?.mine },
                { id: 'actions', label: 'Actions' },
                { id: 'follow-ups', label: 'Follow-ups' },
              ].map(option => (
                <button
                  key={option.id}
                  onClick={() => setView(option.id)}
                  className={`px-3 py-2 rounded-lg text-sm text-left ${
                    view === option.id
                      ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium'
                      : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {option.label}
                  {option.count !== undefined && <span className="ml-1 opacity-70">({option.count})</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">Due Date</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: null, label: 'Any time' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'today', label: 'Due Today' },
                { id: 'this-week', label: 'This Week' },
                { id: 'upcoming', label: 'Upcoming' },
              ].map(option => (
                <button
                  key={option.id || 'any'}
                  onClick={() => setDueDateFilter(option.id)}
                  className={`px-3 py-2 rounded-lg text-sm text-left ${
                    dueDateFilter === option.id
                      ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium'
                      : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">Tags</label>
            <div className="flex flex-wrap gap-2">
              {PREDEFINED_TAGS.map(tag => {
                const isSelected = tagFilter.includes(tag);
                const colors = TAG_COLORS[tag] || TAG_COLORS.default;
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      if (isSelected) {
                        setTagFilter(tagFilter.filter(t => t !== tag));
                      } else {
                        setTagFilter([...tagFilter, tag]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm ${
                      isSelected
                        ? `${colors.bg} ${colors.text} ${colors.border} border`
                        : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-neutral-800 flex gap-3">
          <button
            onClick={() => {
              setView('all');
              setDueDateFilter(null);
              setTagFilter([]);
            }}
            className="flex-1 px-4 py-2.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg"
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg font-medium"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
