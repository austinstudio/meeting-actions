import React, { useEffect, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';

// Transcripts live outside the meetings payload (lib/meeting-store.js) and are
// fetched here on demand. Legacy meetings may still carry `transcript` inline.
export default function TranscriptModal({ isOpen, meeting, onClose }) {
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !meeting) return;
    if (meeting.transcript) {
      setTranscript(meeting.transcript);
      return;
    }
    if (!meeting.hasTranscript) {
      setTranscript(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/meetings/${meeting.id}/transcript`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => { if (!cancelled) setTranscript(data.transcript || null); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, meeting?.id]);

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
          {loading ? (
            <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
              <Loader2 size={28} className="mx-auto mb-2 animate-spin" />
              <p>Loading transcript…</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p>Couldn&apos;t load transcript ({error})</p>
            </div>
          ) : transcript ? (
            <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-neutral-300 font-mono leading-relaxed">
              {transcript}
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
              if (transcript) {
                navigator.clipboard.writeText(transcript);
              }
            }}
            disabled={!transcript}
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
