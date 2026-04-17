import React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

export default function FilterBar({ filters, onChange, onAnalyze, analyzing }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800">
      <select
        value={filters.priority}
        onChange={e => set({ priority: e.target.value })}
        className="text-xs bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded px-2 py-1"
      >
        <option value="all">All priorities</option>
        <option value="high">High only</option>
        <option value="medium">Medium only</option>
        <option value="low">Low only</option>
      </select>
      <input
        value={filters.sender}
        onChange={e => set({ sender: e.target.value })}
        placeholder="Filter by sender"
        className="text-xs bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded px-2 py-1 w-40"
      />
      <select
        value={filters.minWaitDays}
        onChange={e => set({ minWaitDays: Number(e.target.value) })}
        className="text-xs bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded px-2 py-1"
      >
        <option value={0}>Any wait time</option>
        <option value={1}>Waiting 1+ days</option>
        <option value={3}>Waiting 3+ days</option>
        <option value={7}>Waiting 7+ days</option>
      </select>
      <div className="flex-1" />
      <button
        onClick={onAnalyze}
        disabled={analyzing}
        className="text-xs bg-indigo-600 dark:bg-orange-500 text-white rounded px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-60"
      >
        {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {analyzing ? 'Analyzing…' : 'Re-analyze'}
      </button>
    </div>
  );
}
