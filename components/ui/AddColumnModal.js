import React, { useState } from 'react';
import { X } from 'lucide-react';
import { COLUMN_COLORS } from '../constants';

export default function AddColumnModal({ isOpen, onClose, onSubmit }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('slate');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (label.trim()) {
      onSubmit({ label: label.trim(), color });
      setLabel('');
      setColor('slate');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-md border border-transparent dark:border-neutral-600">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Add New Column</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Column Name
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Review, Blocked, Next Week"
              className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(COLUMN_COLORS).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full ${COLUMN_COLORS[c].bg} border-2 ${color === c ? 'border-indigo-500' : 'border-transparent'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!label.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Column
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
