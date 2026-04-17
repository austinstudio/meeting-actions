import React from 'react';
import { Sparkles, Paperclip, Clock, CheckCircle2, Archive, X, ListPlus } from 'lucide-react';
import { bodySnippet, waitingDays } from '../../lib/triage-utils';

const PRIORITY_STYLES = {
  high:   { border: 'border-l-red-600',    badge: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  medium: { border: 'border-l-orange-500', badge: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  low:    { border: 'border-l-slate-400',  badge: 'bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300' }
};

export default function TriageCard({ email, onDraftReply, onSnooze, onCreateTask, onDismiss, onMarkDone }) {
  const t = email.triage || {};
  const style = PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.low;
  const days = waitingDays(email);
  const recips = [
    ...(email.to || []).slice(0, 2),
    ...(email.cc || []).slice(0, 1)
  ];
  const extraCount = (email.to?.length || 0) + (email.cc?.length || 0) - recips.length;

  return (
    <div className={`bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 border-l-4 ${style.border} rounded-md p-4 mb-3`}>
      <div className="flex justify-between items-start mb-1 gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${style.badge}`}>
            {(t.priority || 'low').toUpperCase()}
            {t.deadlineDetected ? ` · DEADLINE ${new Date(t.deadlineDetected).toLocaleDateString()}` : ''}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-neutral-400 flex items-center gap-1">
            <Clock size={10} /> Waiting {days}d · {new Date(email.sent_at).toLocaleDateString()}
          </span>
        </div>
        {email.has_attachments && (
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Paperclip size={11} /> {email.attachment_count}
          </span>
        )}
      </div>

      <div className="text-[13px] font-bold text-slate-900 dark:text-white">{email.subject || '(no subject)'}</div>
      <div className="text-[11px] text-slate-600 dark:text-neutral-400 mt-0.5">
        <strong>{email.sender_name || email.sender_email}</strong>{' '}
        <span className="text-slate-400">&lt;{email.sender_email}&gt;</span>
        {recips.length > 0 && <> → {recips.join(', ')}{extraCount > 0 ? `, +${extraCount}` : ''}</>}
      </div>

      <div className="text-[11px] text-slate-700 dark:text-neutral-300 mt-2 leading-relaxed border-l-2 border-slate-200 dark:border-neutral-700 pl-2">
        {bodySnippet(email.body, 220)}
      </div>

      {t.insight && (
        <div className="bg-indigo-50 dark:bg-indigo-950 rounded p-2 mt-3">
          <div className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
            <Sparkles size={10} /> AI INSIGHT
          </div>
          <div className="text-[11px] text-slate-800 dark:text-neutral-200 mt-1 leading-relaxed">{t.insight}</div>
          {t.suggestedAction && (
            <div className="text-[10px] text-indigo-700 dark:text-indigo-300 mt-1">
              <strong>Suggested:</strong> {t.suggestedAction}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        <button onClick={() => onDraftReply(email)} className="text-[11px] bg-indigo-600 dark:bg-orange-500 text-white rounded px-3 py-1 font-semibold flex items-center gap-1">
          <Sparkles size={11} /> Draft Reply
        </button>
        <button onClick={() => onSnooze(email)} className="text-[11px] bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1 text-slate-700 dark:text-neutral-200 flex items-center gap-1">
          <Clock size={11} /> Snooze
        </button>
        <button onClick={() => onCreateTask(email)} className="text-[11px] bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1 text-slate-700 dark:text-neutral-200 flex items-center gap-1">
          <ListPlus size={11} /> Create task
        </button>
        <button onClick={() => onMarkDone(email)} className="text-[11px] bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1 text-slate-700 dark:text-neutral-200 flex items-center gap-1">
          <CheckCircle2 size={11} /> Mark done
        </button>
        <button onClick={() => onDismiss(email)} className="text-[11px] bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1 text-slate-700 dark:text-neutral-200 flex items-center gap-1">
          <X size={11} /> Dismiss
        </button>
      </div>
    </div>
  );
}
