import { User } from 'lucide-react';
import { DueDateBadge } from '../task/TaskCard';

export default function MobileTaskCard({ task, meeting, onTap, large = false }) {
  return (
    <div
      onClick={() => onTap?.(task)}
      className={`bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 shadow-sm ${large ? 'p-5' : 'p-3'} ${onTap ? 'active:scale-[0.98] transition-transform' : ''}`}
    >
      {/* Priority + Title */}
      <div className="flex items-start gap-2">
        {task.priority && task.priority !== 'none' && (
          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${task.priority === 'high' ? 'bg-rose-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />
        )}
        <h3 className={`font-medium text-slate-900 dark:text-white ${large ? 'text-lg leading-snug' : 'text-sm leading-tight line-clamp-2'}`}>
          {task.task}
        </h3>
      </div>

      {/* Meeting source */}
      {meeting && (
        <p className={`text-slate-500 dark:text-neutral-400 mt-1.5 ${large ? 'text-sm' : 'text-xs'}`}>
          From: {meeting.title}
        </p>
      )}

      {/* Meta row: due date + owner */}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {task.dueDate && <DueDateBadge dueDate={task.dueDate} status={task.status} />}
        {task.owner && (
          <span className={`flex items-center gap-1 text-slate-500 dark:text-neutral-400 ${large ? 'text-sm' : 'text-xs'}`}>
            <User size={large ? 14 : 12} />
            {task.owner}
          </span>
        )}
      </div>

      {/* Tags */}
      {task.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {task.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Context (large only) */}
      {large && task.context && (
        <p className="text-sm text-slate-500 dark:text-neutral-400 mt-3 line-clamp-3">
          {task.context}
        </p>
      )}
    </div>
  );
}
