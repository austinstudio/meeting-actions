import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, CheckCircle2 } from 'lucide-react';

export default function FilterDropdown({ label, icon: Icon, options, value, onChange, multiple = false, badge }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasValue = multiple ? value.length > 0 : value !== null && value !== 'all';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
          hasValue
            ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium'
            : 'bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:border-slate-300 dark:hover:border-neutral-600'
        }`}
      >
        {Icon && <Icon size={14} />}
        {label}
        {badge && <span className="text-xs opacity-70">({badge})</span>}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
          {options.map(option => {
            const isSelected = multiple
              ? value.includes(option.id)
              : value === option.id;

            return (
              <button
                key={option.id}
                onClick={() => {
                  if (multiple) {
                    onChange(isSelected
                      ? value.filter(v => v !== option.id)
                      : [...value, option.id]
                    );
                  } else {
                    onChange(isSelected ? (option.id === 'all' ? 'all' : null) : option.id);
                    setIsOpen(false);
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-orange-500/10 text-indigo-700 dark:text-orange-500'
                    : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700'
                }`}
              >
                {multiple && (
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                    isSelected
                      ? 'bg-indigo-600 dark:bg-orange-500 border-indigo-600 dark:border-orange-500'
                      : 'border-slate-300 dark:border-neutral-600'
                  }`}>
                    {isSelected && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                )}
                {option.icon && <option.icon size={14} className={option.color || ''} />}
                <span className="flex-1">{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs text-slate-400 dark:text-neutral-500">{option.count}</span>
                )}
              </button>
            );
          })}

          {multiple && value.length > 0 && (
            <>
              <div className="h-px bg-slate-200 dark:bg-neutral-700 my-1" />
              <button
                onClick={() => {
                  onChange([]);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-sm text-left text-slate-500 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-700"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
