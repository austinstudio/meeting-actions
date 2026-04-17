import React from 'react';

export default function AnalyzeProgressBar({ result, onDismiss }) {
  if (!result) return null;
  const { analyzed, skipped, errors } = result;
  const hasErrors = errors > 0;
  return (
    <div className={`px-4 py-2 text-xs flex items-center justify-between ${
      hasErrors
        ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
        : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
    }`}>
      <span>
        Analyzed <strong>{analyzed}</strong>, skipped {skipped}
        {hasErrors ? `, ${errors} errors (see logs)` : ''}
      </span>
      <button onClick={onDismiss} className="underline">dismiss</button>
    </div>
  );
}
