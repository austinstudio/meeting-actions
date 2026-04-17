import React from 'react';
import { List, Focus, Columns3 } from 'lucide-react';

const MODES = [
  { key: 'queue', label: 'Queue', Icon: List },
  { key: 'focus', label: 'Focus', Icon: Focus },
  { key: 'board', label: 'Board', Icon: Columns3 }
];

export default function ViewSwitcher({ mode, onChange }) {
  return (
    <div className="inline-flex bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-md overflow-hidden text-sm">
      {MODES.map(({ key, label, Icon }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition ${
              active
                ? 'bg-indigo-600 text-white dark:bg-orange-500'
                : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        );
      })}
    </div>
  );
}
