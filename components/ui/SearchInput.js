import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

export default function SearchInput({ value, onChange, resultCount }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onChange('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChange]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={value ? `${resultCount} results` : "Search tasks... (\u2318K)"}
        className="pl-9 pr-8 py-1.5 w-full md:w-64 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
