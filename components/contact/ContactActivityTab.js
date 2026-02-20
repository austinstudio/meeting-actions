import React from 'react';
import { History, MessageSquare, UserPlus, Trash2, Pencil } from 'lucide-react';
import { formatContactTimestamp, getContactActivityDescription } from '../../lib/contact-utils';

function getActivityIcon(item) {
  switch (item.type) {
    case 'create': return <UserPlus size={14} className="text-emerald-500" />;
    case 'note': return <MessageSquare size={14} className="text-blue-500 dark:text-blue-400" />;
    case 'delete': return <Trash2 size={14} className="text-rose-500" />;
    case 'update': return <Pencil size={14} className="text-slate-500 dark:text-neutral-400" />;
    default: return <History size={14} className="text-slate-500 dark:text-neutral-400" />;
  }
}

export default function ContactActivityTab({ contact }) {
  const activity = contact.activity || [];

  return (
    <div className="p-4">
      {activity.length === 0 ? (
        <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
          <History size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No activity yet</p>
          <p className="text-xs mt-1">Changes to this contact will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...activity].reverse().map(item => (
            <div key={item.id} className="flex gap-3 text-sm">
              <div className="flex-shrink-0 w-8 h-8 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center">
                {getActivityIcon(item)}
              </div>
              <div className="flex-1 pt-1">
                <p className="text-slate-600 dark:text-neutral-300">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{item.user}</span>
                  {' '}{getContactActivityDescription(item)}
                </p>
                <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">{formatContactTimestamp(item.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
