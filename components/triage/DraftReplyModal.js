import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, Copy, Check, RefreshCw } from 'lucide-react';

export default function DraftReplyModal({ email, onClose }) {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setDraft('');
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`/api/triage/${email.outlook_id}/draft-reply`, {
        method: 'POST',
        signal: abortRef.current.signal
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
      const { draft: text } = await res.json();
      setDraft(text);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generate();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.outlook_id]);

  const copy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl w-full md:max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Draft reply</h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400">To: {email.sender_name || email.sender_email}</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 text-slate-500 dark:text-neutral-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Generating draft…
            </div>
          )}
          {error && (
            <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 rounded p-3">
              {error} <button onClick={generate} className="underline ml-2">Retry</button>
            </div>
          )}
          {!loading && !error && (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="w-full min-h-[240px] bg-slate-50 dark:bg-neutral-800 rounded p-3 text-sm text-slate-900 dark:text-neutral-100 font-mono"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-neutral-800">
          <button
            onClick={generate}
            disabled={loading}
            className="text-sm bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={13} /> Regenerate
          </button>
          <button
            onClick={copy}
            disabled={!draft || loading}
            className="text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          >
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy to clipboard</>}
          </button>
        </div>
      </div>
    </div>
  );
}
