import React, { useState } from 'react';
import { User, Clock, CheckCircle2, ArrowRight, Trash2, Pencil, Pin, X, RotateCcw } from 'lucide-react';
import { priorityColors, TAG_COLORS, isCurrentUser } from '../constants';

export function TagBadge({ tag, onRemove, small = false }) {
  const tagKey = tag.toLowerCase();
  const colors = TAG_COLORS[tagKey] || TAG_COLORS.default;

  return (
    <span className={`inline-flex items-center gap-1 ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'} rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
      #{tag}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(tag); }} className="hover:opacity-70">
          <X size={small ? 10 : 12} />
        </button>
      )}
    </span>
  );
}

export function SubtaskProgress({ subtasks = [], compact = false }) {
  const completed = subtasks.filter(s => s.completed).length;
  const total = subtasks.length;
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  if (total === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
      <div className={`flex-1 ${compact ? 'h-1' : 'h-1.5'} bg-slate-200 dark:bg-neutral-800 rounded-full overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all ${percentage === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-slate-500 dark:text-neutral-400 whitespace-nowrap">
        {completed}/{total}
      </span>
    </div>
  );
}

export function DueDateBadge({ dueDate, status }) {
  const date = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  const isCompleted = status === 'done';
  const isOverdue = dateOnly < today && !isCompleted;
  const isToday = dateOnly.getTime() === today.getTime();
  const isTomorrow = dateOnly.getTime() === tomorrow.getTime();
  const isThisWeek = dateOnly > today && dateOnly <= nextWeek;

  let label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  let classes = 'text-slate-400 dark:text-neutral-500';

  if (isCompleted) {
    classes = 'text-slate-400 dark:text-neutral-500';
  } else if (isOverdue) {
    label = 'Overdue';
    classes = 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-full animate-pulse';
  } else if (isToday) {
    label = 'Due Today';
    classes = 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full';
  } else if (isTomorrow) {
    label = 'Tomorrow';
    classes = 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full';
  } else if (isThisWeek) {
    classes = 'text-blue-600 dark:text-blue-400';
  }

  return (
    <div className={`flex items-center gap-1 text-xs ${classes}`}>
      <Clock size={12} />
      {label}
    </div>
  );
}

export default function TaskCard({ task, meeting, onDelete, onEdit, isTrashView, onRestore, onPermanentDelete, onPin, viewDensity = 'normal', currentUser }) {
  const [isDragging, setIsDragging] = useState(false);
  const [expandContext, setExpandContext] = useState(false);
  const [expandSubtasks, setExpandSubtasks] = useState(false);

  const handleDragStart = (e) => {
    if (isTrashView) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.setData('taskOrder', task.order || 0);
  };

  const handleDragEnd = () => setIsDragging(false);

  const densityStyles = {
    compact: { padding: 'p-2', text: 'text-xs', gap: 'gap-1', hideContext: true },
    normal: { padding: 'p-3', text: 'text-sm', gap: 'gap-2', hideContext: false },
    spacious: { padding: 'p-4', text: 'text-sm', gap: 'gap-3', hideContext: false },
  };
  const density = densityStyles[viewDensity] || densityStyles.normal;

  return (
    <div
      draggable={!isTrashView}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDoubleClick={() => !isTrashView && onEdit(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isTrashView) {
          e.preventDefault();
          onEdit(task);
        }
      }}
      tabIndex={isTrashView ? -1 : 0}
      className={`rounded-lg border border-slate-200 dark:border-neutral-800 ${density.padding} ${isTrashView ? 'cursor-default opacity-75' : 'cursor-grab active:cursor-grabbing'} shadow-sm hover:shadow-md transition-all relative group/card ${isDragging ? 'opacity-50 rotate-2' : ''} ${task.pinned ? 'bg-orange-50 dark:bg-[rgb(27_13_1_/_80%)]' : 'bg-white dark:bg-neutral-900'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500`}
    >
      {task.pinned && (
        <div className="absolute -top-2 -left-2 w-5 h-5 bg-orange-400 dark:bg-orange-500 rounded-full flex items-center justify-center shadow-sm">
          <Pin size={10} className="text-white transform rotate-45" />
        </div>
      )}

      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-md px-1 py-0.5 shadow-sm">
        {isTrashView ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestore(task.id);
              }}
              className="p-1 text-slate-300 dark:text-neutral-600 hover:text-emerald-500"
              title="Restore task"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPermanentDelete(task.id);
              }}
              className="p-1 text-slate-300 dark:text-neutral-600 hover:text-rose-500"
              title="Delete permanently"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPin(task.id, !task.pinned);
              }}
              className={`p-1 ${task.pinned ? 'text-orange-500' : 'text-slate-300 dark:text-neutral-600 hover:text-orange-500'}`}
              title={task.pinned ? 'Unpin task' : 'Pin task'}
            >
              <Pin size={14} className={task.pinned ? 'transform rotate-45' : ''} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(task);
              }}
              className="p-1 text-slate-300 dark:text-neutral-600 hover:text-indigo-500"
              title="Edit task"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              className="p-1 text-slate-300 dark:text-neutral-600 hover:text-rose-500"
              title="Delete task"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {meeting && (
        <div className="mb-2 -mt-1">
          <span className="text-xs text-indigo-600 dark:text-orange-500 font-medium truncate block" title={meeting.title}>
            {meeting.title}
          </span>
        </div>
      )}

      <p className={`${density.text} text-slate-800 dark:text-white font-medium leading-snug mb-2`}>
        {task.task}
      </p>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map(tag => (
            <TagBadge key={tag} tag={tag} small={viewDensity === 'compact'} />
          ))}
        </div>
      )}

      {task.subtasks && task.subtasks.length > 0 && (
        <div className="mb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandSubtasks(!expandSubtasks);
            }}
            className="w-full"
          >
            <SubtaskProgress subtasks={task.subtasks} compact={viewDensity === 'compact'} />
          </button>
          {expandSubtasks && (
            <div className="mt-2 space-y-1 text-xs">
              {task.subtasks.map(st => (
                <div key={st.id} className={`flex items-center gap-2 ${st.completed ? 'text-slate-400 dark:text-neutral-500 line-through' : 'text-slate-600 dark:text-neutral-300'}`}>
                  <CheckCircle2 size={12} className={st.completed ? 'text-emerald-500' : 'text-slate-300 dark:text-neutral-600'} />
                  {st.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {task.context && !density.hideContext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpandContext(!expandContext);
          }}
          className={`text-xs text-slate-400 dark:text-neutral-500 mb-2 mr-1 italic text-left hover:text-slate-500 dark:hover:text-slate-400 break-words ${expandContext ? '' : 'line-clamp-2'}`}
          style={{ maxWidth: 'calc(100% - 1.5rem)' }}
          title={expandContext ? 'Click to collapse' : 'Click to expand'}
        >
          {task.context}
        </button>
      )}

      <div className="flex items-center gap-1.5 mb-2">
        <User size={12} className="text-slate-400 dark:text-neutral-500" />
        <span className={`text-xs ${isCurrentUser(task.owner, currentUser) ? 'text-indigo-600 dark:text-orange-500 font-medium' : 'text-slate-500 dark:text-neutral-400'}`}>
          {task.owner || 'Unassigned'}
        </span>
        {task.person && task.type === 'follow-up' && (
          <>
            <ArrowRight size={10} className="text-slate-300 dark:text-neutral-600" />
            <span className="text-xs text-slate-500 dark:text-neutral-400">{task.person}</span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority] || priorityColors['medium']}`}>
            {task.priority}
          </span>
        </div>
        <DueDateBadge dueDate={task.dueDate} status={task.status} />
      </div>
    </div>
  );
}
