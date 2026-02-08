import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel = "Delete", danger = true, subMessage }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-md overflow-hidden border border-transparent dark:border-neutral-600">
        <div className="p-6">
          <div className="flex items-start gap-4">
            {danger && (
              <div className="flex-shrink-0 w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{title}</h2>
              <p className="text-slate-600 dark:text-neutral-300 mt-1">{message}</p>
              {subMessage && (
                <p className="text-sm text-slate-500 dark:text-neutral-400 mt-2 bg-slate-50 dark:bg-neutral-950 rounded-lg px-3 py-2">
                  {subMessage}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-neutral-950 border-t border-slate-100 dark:border-neutral-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              danger
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
