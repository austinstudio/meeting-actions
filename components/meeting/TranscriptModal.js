import React from 'react';
import { X, FileText } from 'lucide-react';

export default function TranscriptModal({ isOpen, meeting, onClose }) {
  if (!isOpen || !meeting) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-3xl h-[90vh] md:h-auto md:max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              Transcript
            </h3>
            <p className="text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
              {meeting.sourceFileName || meeting.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {meeting.transcript ? (
            <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-neutral-300 font-mono leading-relaxed">
              {meeting.transcript}
            </pre>
          ) : (
            <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p>No transcript available</p>
              <p className="text-xs mt-1">This meeting was created before transcript storage was enabled</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-neutral-800">
          <button
            onClick={() => {
              if (meeting.transcript) {
                navigator.clipboard.writeText(meeting.transcript);
              }
            }}
            disabled={!meeting.transcript}
            className="px-4 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Copy to clipboard
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
