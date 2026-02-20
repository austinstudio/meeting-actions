import React from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const statusIcons = {
  done: <CheckCircle2 size={14} className="text-emerald-500" />,
  'in-progress': <Clock size={14} className="text-blue-500" />,
  todo: <AlertCircle size={14} className="text-slate-400" />
};

const priorityBadge = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400'
};

export default function ContactLinkedTasks({ tasks, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 dark:text-neutral-500">
        <div className="w-6 h-6 border-2 border-slate-300 dark:border-neutral-600 border-t-indigo-600 dark:border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 dark:text-neutral-500 px-4">
        <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No linked tasks</p>
        <p className="text-xs mt-1">Tasks where this contact is the owner or follow-up person will show here</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-neutral-800">
      {tasks.map(task => (
        <div key={task.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition-colors">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {statusIcons[task.column] || statusIcons.todo}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-800 dark:text-white">
                {task.task}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {task.priority && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${priorityBadge[task.priority] || priorityBadge.low}`}>
                    {task.priority}
                  </span>
                )}
                {task.owner && (
                  <span className="text-xs text-slate-500 dark:text-neutral-400">
                    Owner: {task.owner}
                  </span>
                )}
                {task.person && (
                  <span className="text-xs text-slate-500 dark:text-neutral-400">
                    Follow-up: {task.person}
                  </span>
                )}
                {task.dueDate && (
                  <span className="text-xs text-slate-400 dark:text-neutral-500">
                    Due: {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
