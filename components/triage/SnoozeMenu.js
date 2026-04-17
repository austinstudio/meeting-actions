import React, { useState } from 'react';
import { X } from 'lucide-react';

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export default function SnoozeMenu({ email, onPick, onClose }) {
  const [custom, setCustom] = useState('');
  const pick = (date) => onPick(email, date.toISOString());
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl w-full md:max-w-sm p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 dark:text-white">Snooze until</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => pick(addDays(new Date(), 1))} className="text-left text-sm px-3 py-2 bg-slate-50 dark:bg-neutral-800 rounded">Tomorrow</button>
          <button onClick={() => pick(addDays(new Date(), 3))} className="text-left text-sm px-3 py-2 bg-slate-50 dark:bg-neutral-800 rounded">In 3 days</button>
          <button onClick={() => pick(addDays(new Date(), 7))} className="text-left text-sm px-3 py-2 bg-slate-50 dark:bg-neutral-800 rounded">Next week</button>
          <div className="flex gap-2 mt-1">
            <input type="date" value={custom} onChange={e => setCustom(e.target.value)} className="flex-1 text-sm bg-slate-50 dark:bg-neutral-800 rounded px-2 py-1.5" />
            <button
              disabled={!custom}
              onClick={() => pick(new Date(custom + 'T23:59:59'))}
              className="text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded px-3 py-1.5 disabled:opacity-50"
            >Pick</button>
          </div>
        </div>
      </div>
    </div>
  );
}
