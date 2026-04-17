import React, { useState } from 'react';
import BoardCard from './BoardCard';

const TITLES = {
  needs_reply: { label: 'Needs Reply', color: 'text-red-600 dark:text-red-400' },
  waiting_on:  { label: 'Waiting On',  color: 'text-amber-600 dark:text-amber-400' },
  fyi_only:    { label: 'FYI Only',    color: 'text-slate-600 dark:text-neutral-400' },
  done:        { label: 'Done',        color: 'text-emerald-600 dark:text-emerald-400' }
};

export default function BoardColumn({ state, emails, onDrop, onCardClick }) {
  const [dragOver, setDragOver] = useState(false);
  const title = TITLES[state];
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const outlookId = e.dataTransfer.getData('text/plain');
        if (outlookId) onDrop(outlookId, state);
      }}
      className={`flex-1 min-w-0 rounded-md p-2 transition ${dragOver ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'bg-slate-50 dark:bg-neutral-950'}`}
    >
      <div className={`text-[11px] font-bold mb-2 ${title.color}`}>
        {title.label.toUpperCase()} · {emails.length}
      </div>
      {emails.map(e => (
        <BoardCard key={e.outlook_id} email={e} onClick={onCardClick} />
      ))}
      {emails.length === 0 && (
        <div className="text-[11px] text-slate-400 dark:text-neutral-600 italic py-4 text-center">
          Drop here
        </div>
      )}
    </div>
  );
}
