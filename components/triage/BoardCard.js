import React from 'react';
import { Clock, Paperclip } from 'lucide-react';
import { waitingDays, isSnoozed } from '../../lib/triage-utils';

export default function BoardCard({ email, onClick, onDragStart }) {
  const t = email.triage || {};
  const snoozed = isSnoozed(t);
  const days = waitingDays(email);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', email.outlook_id);
        onDragStart?.(email);
      }}
      onClick={() => onClick?.(email)}
      className={`bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded p-2.5 mb-2 cursor-grab active:cursor-grabbing ${snoozed ? 'opacity-60' : ''}`}
    >
      <div className="text-[11px] font-semibold text-slate-900 dark:text-white line-clamp-2">{email.subject || '(no subject)'}</div>
      <div className="text-[10px] text-slate-500 dark:text-neutral-400 mt-1 flex items-center gap-1.5 flex-wrap">
        <span>{email.sender_name || email.sender_email}</span>
        <span>·</span>
        <span className="flex items-center gap-0.5"><Clock size={9} />{days}d</span>
        {email.has_attachments && <span className="flex items-center gap-0.5"><Paperclip size={9} />{email.attachment_count}</span>}
        {snoozed && <span className="italic">snoozed</span>}
      </div>
    </div>
  );
}
