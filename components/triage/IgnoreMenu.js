import React from 'react';
import { X, Ban, Building2 } from 'lucide-react';

function domainOf(addr) {
  const a = (addr || '').toLowerCase();
  const i = a.indexOf('@');
  return i >= 0 ? a.slice(i + 1) : '';
}

export default function IgnoreMenu({ email, onPick, onClose }) {
  const addr = (email.sender_email || '').toLowerCase();
  const domain = domainOf(addr);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl w-full md:max-w-sm p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900 dark:text-white">Ignore future emails</h3>
          <button onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="text-xs text-slate-500 dark:text-neutral-400 mb-3">
          Ignored senders skip AI analysis and get auto-dismissed.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onPick({ type: 'email', pattern: addr })}
            disabled={!addr}
            className="text-left text-sm px-3 py-2 bg-slate-50 dark:bg-neutral-800 rounded flex items-start gap-2 disabled:opacity-50"
          >
            <Ban size={14} className="mt-0.5 shrink-0" />
            <span>
              <div className="font-medium">Just this sender</div>
              <div className="text-[11px] text-slate-500 dark:text-neutral-400">{addr || '(no email)'}</div>
            </span>
          </button>
          <button
            onClick={() => onPick({ type: 'domain', pattern: domain })}
            disabled={!domain}
            className="text-left text-sm px-3 py-2 bg-slate-50 dark:bg-neutral-800 rounded flex items-start gap-2 disabled:opacity-50"
          >
            <Building2 size={14} className="mt-0.5 shrink-0" />
            <span>
              <div className="font-medium">Everyone from this domain</div>
              <div className="text-[11px] text-slate-500 dark:text-neutral-400">@{domain || '(no domain)'}</div>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
