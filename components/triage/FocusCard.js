import React from 'react';
import { Sparkles, ChevronLeft, ChevronRight, CheckCircle2, X, Clock, Paperclip } from 'lucide-react';
import { bodySnippet, waitingDays } from '../../lib/triage-utils';

const BADGE = {
  high: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  medium: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  low: 'bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300'
};

export default function FocusCard({
  email, index, total,
  onPrev, onNext,
  onDraftReply, onSnooze, onDismiss, onMarkDone
}) {
  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 dark:text-neutral-400">
        <CheckCircle2 size={32} className="mb-2 text-emerald-500" />
        <p className="text-sm">No more follow-ups in your queue.</p>
      </div>
    );
  }

  const t = email.triage || {};
  const days = waitingDays(email);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-slate-200 dark:border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${BADGE[t.priority] || BADGE.low}`}>
            {(t.priority || 'low').toUpperCase()}
          </span>
          <span className="text-xs text-slate-500 dark:text-neutral-400">{index + 1} / {total}</span>
        </div>

        <h2 className="text-base font-bold text-slate-900 dark:text-white">{email.subject || '(no subject)'}</h2>
        <div className="text-xs text-slate-600 dark:text-neutral-400 mt-1 flex items-center gap-2 flex-wrap">
          <strong>{email.sender_name || email.sender_email}</strong>
          <span>·</span>
          <span className="flex items-center gap-1"><Clock size={11} /> {days}d ago</span>
          {email.has_attachments && <span className="flex items-center gap-1"><Paperclip size={11} /> {email.attachment_count}</span>}
        </div>

        <div className="text-sm text-slate-700 dark:text-neutral-300 mt-3 leading-relaxed border-l-2 border-slate-200 dark:border-neutral-700 pl-3 max-h-48 overflow-auto">
          {bodySnippet(email.body, 1200)}
        </div>

        {t.insight && (
          <div className="bg-indigo-50 dark:bg-indigo-950 rounded p-3 mt-4">
            <div className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
              <Sparkles size={10} /> WHY THIS NEEDS YOU
            </div>
            <div className="text-xs text-slate-800 dark:text-neutral-200 mt-1 leading-relaxed">{t.insight}</div>
            {t.suggestedAction && (
              <div className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-1">
                <strong>Suggested:</strong> {t.suggestedAction}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={() => onDraftReply(email)} className="flex-1 bg-indigo-600 dark:bg-orange-500 text-white rounded-md px-3 py-2 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Sparkles size={13} /> Draft Reply
          </button>
          <button onClick={() => onSnooze(email)} className="flex-1 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-md px-3 py-2 text-sm flex items-center justify-center gap-1.5">
            <Clock size={13} /> Snooze
          </button>
          <button onClick={() => onMarkDone(email)} className="flex-1 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-md px-3 py-2 text-sm flex items-center justify-center gap-1.5">
            <CheckCircle2 size={13} /> Done
          </button>
          <button onClick={() => onDismiss(email)} className="flex-1 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-md px-3 py-2 text-sm flex items-center justify-center gap-1.5">
            <X size={13} /> Skip
          </button>
        </div>

        <div className="flex justify-between mt-4 text-xs text-slate-500 dark:text-neutral-400">
          <button onClick={onPrev} disabled={index === 0} className="flex items-center gap-1 disabled:opacity-40">
            <ChevronLeft size={14} /> Previous
          </button>
          <button onClick={onNext} disabled={index >= total - 1} className="flex items-center gap-1 disabled:opacity-40">
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
