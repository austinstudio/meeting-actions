import React from 'react';
import { Calendar, FileText } from 'lucide-react';

export default function ContactLinkedMeetings({ meetings, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 dark:text-neutral-500">
        <div className="w-6 h-6 border-2 border-slate-300 dark:border-neutral-600 border-t-indigo-600 dark:border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!meetings || meetings.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 dark:text-neutral-500 px-4">
        <Calendar size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No linked meetings</p>
        <p className="text-xs mt-1">Meetings where this contact appears as a participant will show here</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-neutral-800">
      {meetings.map(meeting => (
        <div key={meeting.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition-colors">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center">
              <FileText size={14} className="text-indigo-600 dark:text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                {meeting.title || 'Untitled Meeting'}
              </p>
              {meeting.date && (
                <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                  {new Date(meeting.date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </p>
              )}
              {meeting.participants && meeting.participants.length > 0 && (
                <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5 truncate">
                  {meeting.participants.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
