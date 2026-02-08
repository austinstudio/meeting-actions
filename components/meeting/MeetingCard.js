import React from 'react';
import { Calendar, Clock, Users, FileText, Pencil, Trash2 } from 'lucide-react';

export default function MeetingCard({ meeting, taskCount, isSelected, onClick, onDelete, onEdit, onViewTranscript, isEmpty, hasUncategorized }) {
  return (
    <div
      className={`relative w-full text-left p-3 rounded-lg border transition-all group/meeting ${
        hasUncategorized ? 'border-l-4 border-l-purple-500 dark:border-l-purple-400' : ''
      } ${
        isSelected
          ? 'bg-indigo-50 dark:bg-orange-500/20 border-indigo-200 dark:border-indigo-800'
          : isEmpty
            ? 'bg-slate-50 dark:bg-neutral-900/50 border-slate-100 dark:border-neutral-800 opacity-60'
            : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-600'
      }`}
    >
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover/meeting:opacity-100 transition-opacity bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-md px-1 py-0.5 shadow-sm z-10">
        {meeting.transcript && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewTranscript(meeting);
            }}
            className="p-1 text-slate-400 dark:text-neutral-500 hover:text-indigo-500 dark:hover:text-orange-500"
            title="View transcript"
          >
            <FileText size={14} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(meeting);
          }}
          className="p-1 text-slate-400 dark:text-neutral-500 hover:text-indigo-500 dark:hover:text-orange-500"
          title="Edit meeting details"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(meeting.id, meeting.title);
          }}
          className="p-1 text-slate-400 dark:text-neutral-500 hover:text-rose-500"
          title="Delete meeting and all its tasks"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <button onClick={onClick} className="w-full text-left">
        <h4 className={`font-medium text-sm leading-snug ${isEmpty ? 'text-slate-500 dark:text-neutral-400' : 'text-slate-800 dark:text-white'}`}>
          {meeting.title}
        </h4>
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-neutral-400">
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {meeting.duration && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {meeting.duration}
            </span>
          )}
        </div>
        {meeting.participants && meeting.participants.length > 0 && (
          <div className="flex items-center justify-between gap-2 mt-2">
            <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-neutral-500">
              <Users size={12} />
              <span className="truncate">{meeting.participants.slice(0, 3).join(', ')}{meeting.participants.length > 3 ? '...' : ''}</span>
            </div>
            {taskCount > 0 && (
              <span className="text-xs bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                {taskCount}
              </span>
            )}
          </div>
        )}
        {(!meeting.participants || meeting.participants.length === 0) && taskCount > 0 && (
          <div className="flex justify-end mt-2">
            <span className="text-xs bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 px-2 py-0.5 rounded-full whitespace-nowrap">
              {taskCount}
            </span>
          </div>
        )}
      </button>
    </div>
  );
}
