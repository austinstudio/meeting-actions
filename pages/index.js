import React, { useState, useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { Calendar, User, Clock, CheckCircle2, ArrowRight, RefreshCw, Plus, FileText, X, Users, Trash2, Archive, MoreVertical, Settings, ChevronDown, Pencil, Search, Sparkles, Bell, Upload, File, MessageSquare, History, Send, AtSign, RotateCcw, AlertTriangle, Pin, Sun, Moon, Monitor, Tag, ChevronRight, ChevronLeft, ListChecks, Rows3, Rows4, LayoutList, GripVertical, PanelLeftClose, PanelLeft, Menu, SlidersHorizontal, Smartphone, Gift, Bot, Github, ExternalLink, Link } from 'lucide-react';
import { APP_VERSION, FEATURES, getNewFeatures, getAllFeatures } from '../lib/features';

const DEFAULT_COLUMNS = [
  { id: 'uncategorized', label: 'Uncategorized', color: 'purple', order: 0 },
  { id: 'todo', label: 'To Do', color: 'slate', order: 1 },
  { id: 'in-progress', label: 'In Progress', color: 'blue', order: 2 },
  { id: 'waiting', label: 'Waiting On Others', color: 'amber', order: 3 },
  { id: 'done', label: 'Done', color: 'emerald', order: 4 },
];

const COLUMN_COLORS = {
  slate: { bg: 'bg-slate-100', accent: 'border-slate-300', badge: 'bg-slate-200' },
  blue: { bg: 'bg-blue-50', accent: 'border-blue-300', badge: 'bg-blue-100' },
  amber: { bg: 'bg-amber-50', accent: 'border-amber-300', badge: 'bg-amber-100' },
  emerald: { bg: 'bg-emerald-50', accent: 'border-emerald-300', badge: 'bg-emerald-100' },
  purple: { bg: 'bg-purple-50', accent: 'border-purple-300', badge: 'bg-purple-100' },
  rose: { bg: 'bg-rose-50', accent: 'border-rose-300', badge: 'bg-rose-100' },
  indigo: { bg: 'bg-indigo-50', accent: 'border-indigo-300', badge: 'bg-indigo-100' },
  teal: { bg: 'bg-teal-50', accent: 'border-teal-300', badge: 'bg-teal-100' },
};

const priorityColors = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400',
};

// Tag colors and predefined tags
const TAG_COLORS = {
  urgent: { bg: 'bg-rose-100 dark:bg-rose-500/20', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-500/30' },
  client: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/30' },
  bug: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-500/30' },
  feature: { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-500/30' },
  review: { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/30' },
  design: { bg: 'bg-teal-100 dark:bg-teal-500/20', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-200 dark:border-teal-500/30' },
  default: { bg: 'bg-slate-100 dark:bg-neutral-800', text: 'text-slate-600 dark:text-neutral-300', border: 'border-slate-200 dark:border-neutral-700' },
};

const PREDEFINED_TAGS = ['urgent', 'client', 'bug', 'feature', 'review', 'design'];

// TagBadge component
function TagBadge({ tag, onRemove, small = false }) {
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

// SubtaskProgress component
function SubtaskProgress({ subtasks = [], compact = false }) {
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

// DueDateBadge component for smart due date display
function DueDateBadge({ dueDate, status }) {
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

// Current user configuration
const CURRENT_USER = 'Corey';
const isCurrentUser = (name) => {
  if (!name) return false;
  const normalized = name.toLowerCase().trim();
  return normalized === 'me' || normalized === 'corey';
};

function TaskCard({ task, meeting, onDelete, onEdit, isTrashView, onRestore, onPermanentDelete, onPin, viewDensity = 'normal' }) {
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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

  // Density-based styles
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
      className={`rounded-lg border border-slate-200 dark:border-neutral-800 ${density.padding} ${isTrashView ? 'cursor-default opacity-75' : 'cursor-grab active:cursor-grabbing'} shadow-sm hover:shadow-md transition-all relative group/card ${isDragging ? 'opacity-50 rotate-2' : ''} ${task.pinned ? 'bg-amber-50 dark:bg-[rgb(32_11_0/77%)]' : 'bg-white dark:bg-neutral-900'}`}
    >
      {/* Pin indicator */}
      {task.pinned && (
        <div className="absolute -top-2 -left-2 w-5 h-5 bg-amber-400 dark:bg-amber-500 rounded-full flex items-center justify-center shadow-sm">
          <Pin size={10} className="text-white transform rotate-45" />
        </div>
      )}

      {/* Action buttons - different for trash view */}
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
              className={`p-1 ${task.pinned ? 'text-amber-500' : 'text-slate-300 dark:text-neutral-600 hover:text-amber-500'}`}
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

      {/* Meeting source tag */}
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

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map(tag => (
            <TagBadge key={tag} tag={tag} small={viewDensity === 'compact'} />
          ))}
        </div>
      )}

      {/* Subtasks progress */}
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

      {/* Context - clickable to expand (hidden in compact mode) */}
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

      {/* Owner / Assigned to */}
      <div className="flex items-center gap-1.5 mb-2">
        <User size={12} className="text-slate-400 dark:text-neutral-500" />
        <span className={`text-xs ${isCurrentUser(task.owner) ? 'text-indigo-600 dark:text-orange-500 font-medium' : 'text-slate-500 dark:text-neutral-400'}`}>
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

function Column({ column, tasks, meetings, onDrop, onDeleteTask, onEditTask, onAddTask, onColumnDragStart, onColumnDragEnd, onColumnDragOver, onColumnDrop, isDraggingColumn, showSkeletons, isTrashView, onRestoreTask, onPermanentDelete, onPinTask, viewDensity }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isColumnDragOver, setIsColumnDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    const dragType = e.dataTransfer.types.includes('taskid') ? 'task' : 'column';
    if (dragType === 'task' || e.dataTransfer.getData('taskId')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setIsColumnDragOver(false);
    setDropIndex(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    setIsDragOver(false);
    setIsColumnDragOver(false);
    setDropIndex(null);

    const taskId = e.dataTransfer.getData('taskId');
    const columnId = e.dataTransfer.getData('columnId');

    if (taskId) {
      onDrop(taskId, column.id, targetIndex);
    } else if (columnId && onColumnDrop) {
      onColumnDrop(columnId, column.id);
    }
  };

  const handleColumnDragStart = (e) => {
    e.dataTransfer.setData('columnId', column.id);
    if (onColumnDragStart) onColumnDragStart(column.id);
  };

  const handleColumnDragEnd = () => {
    if (onColumnDragEnd) onColumnDragEnd();
  };

  // Get and sort column tasks - pinned first, then by order
  const columnTasks = tasks
    .filter(t => t.status === column.id)
    .sort((a, b) => {
      // Pinned tasks first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // Then by order (lower = higher priority)
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });

  const colors = COLUMN_COLORS[column.color] || COLUMN_COLORS.slate;

  return (
    <div
      draggable
      onDragStart={handleColumnDragStart}
      onDragEnd={handleColumnDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, columnTasks.length)}
      className={`flex-1 min-w-[280px] max-w-[320px] rounded-xl ${colors.bg} dark:bg-opacity-[0.15] border-2 ${isDragOver ? colors.accent : 'border-transparent'} transition-colors ${isDraggingColumn ? 'opacity-50' : ''} flex flex-col h-full`}
    >
      <div className="p-3 border-b border-slate-200/50 dark:border-neutral-800/50 cursor-grab active:cursor-grabbing">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{column.label}</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddTask(column.id);
              }}
              className="p-1 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white/50 dark:hover:bg-neutral-800/50 rounded transition-colors"
              title="Add task to this column"
            >
              <Plus size={16} />
            </button>
            <span className={`text-xs ${colors.badge} dark:bg-opacity-30 text-slate-600 dark:text-neutral-300 px-2 py-0.5 rounded-full`}>
              {columnTasks.length}
            </span>
          </div>
        </div>
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto">
        {/* Show skeletons when processing in background */}
        {showSkeletons && column.id === 'uncategorized' && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {columnTasks.map((task, index) => (
          <div
            key={task.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropIndex(index);
            }}
            onDrop={(e) => {
              e.stopPropagation();
              handleDrop(e, index);
            }}
            className={dropIndex === index ? 'border-t-2 border-indigo-400' : ''}
          >
            <TaskCard
              task={task}
              meeting={meetings.find(m => m.id === task.meetingId)}
              onDelete={onDeleteTask}
              onEdit={onEditTask}
              isTrashView={isTrashView}
              onRestore={onRestoreTask}
              onPermanentDelete={onPermanentDelete}
              onPin={onPinTask}
              viewDensity={viewDensity}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingCard({ meeting, taskCount, isSelected, onClick, onDelete, onEdit, onViewTranscript, isEmpty, hasUncategorized }) {
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
      {/* Action buttons - hover overlay */}
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
        {/* Show task count on its own row if no participants */}
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

// Edit Meeting Modal
function EditMeetingModal({ isOpen, meeting, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [participants, setParticipants] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meeting) {
      setTitle(meeting.title || '');
      setDate(meeting.date || '');
      setParticipants((meeting.participants || []).join(', '));
    }
  }, [meeting]);

  if (!isOpen || !meeting) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const participantsArray = participants
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      await onSave(meeting.id, {
        title: title.trim(),
        date,
        participants: participantsArray
      });
      onClose();
    } catch (error) {
      console.error('Failed to save meeting:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-xl md:max-w-md w-full border border-slate-200 dark:border-neutral-600">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Edit Meeting</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-neutral-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-neutral-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Participants
            </label>
            <input
              type="text"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="John, Jane, Bob"
              className="w-full px-3 py-2 border border-slate-200 dark:border-neutral-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Separate names with commas</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Transcript Modal - View original transcript
function TranscriptModal({ isOpen, meeting, onClose }) {
  if (!isOpen || !meeting) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-3xl h-[90vh] md:h-auto md:max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              Transcript
            </h3>
            <p className="text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
              {meeting.sourceFileName || meeting.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {meeting.transcript ? (
            <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-neutral-300 font-mono leading-relaxed">
              {meeting.transcript}
            </pre>
          ) : (
            <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p>No transcript available</p>
              <p className="text-xs mt-1">This meeting was created before transcript storage was enabled</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-neutral-800">
          <button
            onClick={() => {
              if (meeting.transcript) {
                navigator.clipboard.writeText(meeting.transcript);
              }
            }}
            disabled={!meeting.transcript}
            className="px-4 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Copy to clipboard
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportHistoryModal({ isOpen, onClose, meetings, onSelectMeeting }) {
  const [filterQuery, setFilterQuery] = useState('');

  if (!isOpen) return null;

  // Sort meetings by processedAt date (most recent first) and filter by query
  const sortedMeetings = [...meetings]
    .filter((meeting) => {
      if (!filterQuery.trim()) return true;
      const query = filterQuery.toLowerCase();
      return (
        meeting.title?.toLowerCase().includes(query) ||
        meeting.sourceFileName?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const dateA = new Date(a.processedAt || a.date || 0);
      const dateB = new Date(b.processedAt || b.date || 0);
      return dateB - dateA;
    });

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const handleSelect = (meetingId) => {
    onSelectMeeting(meetingId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-lg h-[80vh] md:h-auto md:max-h-[70vh] flex flex-col border border-transparent dark:border-neutral-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <History size={20} className="text-indigo-600 dark:text-orange-500" />
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              Import History
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter input */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter by name..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              autoFocus
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sortedMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-neutral-500">
              <FileText size={40} className="mb-3 opacity-50" />
              {meetings.length === 0 ? (
                <>
                  <p className="text-sm">No imports yet</p>
                  <p className="text-xs mt-1">Import a transcript to see it here</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No matches found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {sortedMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => handleSelect(meeting.id)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-orange-500 transition-colors">
                        {meeting.title}
                      </p>
                      {meeting.sourceFileName && meeting.sourceFileName !== meeting.title && (
                        <p className="text-xs text-slate-400 dark:text-neutral-500 truncate mt-0.5">
                          {meeting.sourceFileName}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-300 dark:text-neutral-600 group-hover:text-indigo-500 dark:group-hover:text-orange-500 flex-shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(meeting.processedAt || meeting.date)}
                    </span>
                    {meeting.participants?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {meeting.participants.length}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t border-slate-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-lg hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Icon mapping for features
const FEATURE_ICONS = {
  Sparkles: Sparkles,
  Smartphone: Smartphone,
  History: History,
  Gift: Gift,
  Users: Users,
  Bot: Bot,
  Github: Github
};

function WhatsNewModal({ isOpen, onClose, features, showAll = false }) {
  if (!isOpen || !features || features.length === 0) return null;

  const latestVersion = Math.max(...features.map(f => f.version));

  // Format release date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-md max-h-[80vh] md:max-h-[70vh] flex flex-col border border-transparent dark:border-neutral-700">
        {/* Header with gradient icon */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <Gift size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              {showAll ? 'Release History' : "What's New"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              {showAll ? 'All features by version' : 'Latest updates and features'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable feature list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {features.map((feature) => {
            const IconComponent = FEATURE_ICONS[feature.icon] || Gift;
            const isLatest = feature.version === latestVersion;

            return (
              <div
                key={feature.version}
                className="flex gap-3 p-3 rounded-lg bg-slate-50 dark:bg-neutral-800/50 border border-slate-100 dark:border-neutral-700"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isLatest
                    ? 'bg-indigo-100 dark:bg-indigo-500/20'
                    : 'bg-slate-100 dark:bg-neutral-700'
                }`}>
                  <IconComponent
                    size={20}
                    className={isLatest
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-neutral-400'
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-slate-800 dark:text-white text-sm">
                      {feature.title}
                    </h4>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-200 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 rounded">
                      v{feature.version}
                    </span>
                    {isLatest && !showAll && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">
                    {feature.description}
                  </p>
                  {showAll && feature.releaseDate && (
                    <p className="text-xs text-slate-400 dark:text-neutral-500 mt-2 flex items-center gap-1">
                      <Calendar size={10} />
                      {formatDate(feature.releaseDate)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer with dismiss button */}
        <div className="flex justify-end p-4 border-t border-slate-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors font-medium"
          >
            {showAll ? 'Close' : 'Got it!'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Compact task card for AI responses
function AITaskCard({ task, meeting, onEdit }) {
  const priorityColors = {
    high: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    low: 'bg-slate-100 text-slate-600 dark:bg-neutral-700 dark:text-neutral-400',
  };

  const statusColors = {
    'uncategorized': 'border-purple-300 dark:border-purple-500/50',
    'todo': 'border-slate-300 dark:border-slate-600',
    'in-progress': 'border-blue-300 dark:border-blue-500/50',
    'waiting': 'border-amber-300 dark:border-amber-500/50',
    'done': 'border-emerald-300 dark:border-emerald-500/50',
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    if (dateOnly < today && task.status !== 'done') return { text: 'Overdue', className: 'text-rose-600 dark:text-rose-400 font-medium' };
    if (dateOnly.getTime() === today.getTime()) return { text: 'Today', className: 'text-amber-600 dark:text-amber-400 font-medium' };
    if (dateOnly.getTime() === tomorrow.getTime()) return { text: 'Tomorrow', className: 'text-blue-600 dark:text-blue-400' };
    return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), className: 'text-slate-500 dark:text-neutral-400' };
  };

  const dueDateInfo = formatDate(task.dueDate);

  return (
    <button
      onClick={onEdit}
      className={`w-full text-left p-3 rounded-lg bg-white dark:bg-neutral-900 border-l-4 ${statusColors[task.status] || statusColors['uncategorized']} border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 transition-colors group`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-white leading-snug flex-1 group-hover:text-indigo-600 dark:group-hover:text-orange-500 transition-colors">
          {task.task}
        </p>
        <ChevronRight size={14} className="text-slate-300 dark:text-neutral-600 group-hover:text-indigo-500 dark:group-hover:text-orange-500 flex-shrink-0 mt-0.5" />
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[task.priority] || priorityColors['medium']}`}>
          {task.priority}
        </span>
        <span className="text-xs text-slate-500 dark:text-neutral-400">
          {task.owner}
        </span>
        <span className={`text-xs flex items-center gap-1 ${dueDateInfo.className}`}>
          <Clock size={10} />
          {dueDateInfo.text}
        </span>
      </div>
      {meeting && (
        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1.5 truncate">
          From: {meeting.title}
        </p>
      )}
    </button>
  );
}

function AskAIModal({ isOpen, onClose, onEditTask, tasks: liveTasks, meetings: liveMeetings }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [referencedTaskIds, setReferencedTaskIds] = useState(new Set()); // Track which tasks AI has referenced
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Build lookup maps from live data
  const taskMap = {};
  liveTasks?.forEach(t => { taskMap[t.id] = t; });
  const meetingMap = {};
  liveMeetings?.forEach(m => { meetingMap[m.id] = m; });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Function to manually start a new chat
  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    setReferencedTaskIds(new Set());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.filter(m => !m.tasks) // Don't send task data in history
        })
      });

      const data = await response.json();

      if (data.success) {
        // Track which task IDs were referenced
        if (data.tasks) {
          setReferencedTaskIds(prev => {
            const updated = new Set(prev);
            data.tasks.forEach(t => updated.add(t.id));
            return updated;
          });
        }

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.'
        }]);
      }
    } catch (error) {
      console.error('Ask AI error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I couldn\'t connect to the AI service. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Render formatted AI response with task cards
  // Render formatted AI response with task cards (uses live data from props)
  const renderAIResponse = (content) => {
    // Split content by task references
    const parts = content.split(/(\[\[TASK:[\w_]+\]\])/g);

    return (
      <div className="space-y-2">
        {parts.map((part, i) => {
          // Check if this is a task reference
          const taskMatch = part.match(/\[\[TASK:([\w_]+)\]\]/);
          if (taskMatch) {
            const taskId = taskMatch[1];
            const task = taskMap[taskId]; // Use live data from props
            if (task) {
              return (
                <AITaskCard
                  key={i}
                  task={task}
                  meeting={meetingMap[task.meetingId]} // Use live meeting data
                  onEdit={() => {
                    onClose();
                    onEditTask(task);
                  }}
                />
              );
            }
            return null; // Task not found, skip
          }

          // Regular text - apply formatting
          if (!part.trim()) return null;

          return (
            <div key={i} className="text-sm">
              {formatAIText(part)}
            </div>
          );
        })}
      </div>
    );
  };

  // Format text with basic markdown-like styling
  const formatAIText = (text) => {
    // Split into lines for processing
    const lines = text.split('\n');

    return lines.map((line, i) => {
      if (!line.trim()) return <br key={i} />;

      // Process inline formatting
      let formatted = line;

      // Bold: **text**
      const parts = [];
      let lastIndex = 0;
      const boldRegex = /\*\*([^*]+)\*\*/g;
      let match;

      while ((match = boldRegex.exec(formatted)) !== null) {
        if (match.index > lastIndex) {
          parts.push(formatted.slice(lastIndex, match.index));
        }
        parts.push(<strong key={`bold-${i}-${match.index}`} className="font-semibold">{match[1]}</strong>);
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < formatted.length) {
        parts.push(formatted.slice(lastIndex));
      }

      const content = parts.length > 0 ? parts : formatted;

      // Check if line is a bullet point
      if (line.trim().startsWith('• ') || line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletContent = line.trim().replace(/^[•\-*]\s*/, '');
        return (
          <div key={i} className="flex gap-2 ml-1">
            <span className="text-indigo-500 dark:text-orange-500">•</span>
            <span>{typeof content === 'string' ? bulletContent : content}</span>
          </div>
        );
      }

      return <p key={i} className="leading-relaxed">{content}</p>;
    });
  };

  const suggestedQuestions = [
    "What's due this week?",
    "What should I prioritize today?",
    "Show me overdue tasks",
    "Summarize my open items"
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-2xl h-[85vh] md:h-[70vh] flex flex-col border border-transparent dark:border-neutral-700">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-orange-500 dark:via-amber-500 dark:to-yellow-500 flex items-center justify-center">
            <Bot size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              AI Assistant
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              Ask questions about your tasks and meetings
            </p>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleNewChat}
                className="px-2 py-1 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors"
              >
                New Chat
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                <Bot size={32} className="text-slate-400 dark:text-neutral-500" />
              </div>
              <h4 className="text-slate-700 dark:text-neutral-200 font-medium mb-2">
                How can I help you?
              </h4>
              <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6 max-w-sm">
                I can answer questions about your tasks, help you find things, and suggest what to prioritize.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {suggestedQuestions.map((question, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(question);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 rounded-full hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-indigo-600 dark:bg-orange-500 text-white">
                      <div className="text-sm">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="max-w-[90%] rounded-2xl px-4 py-3 bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200">
                      {renderAIResponse(msg.content)}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 dark:bg-neutral-800 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-slate-200 dark:border-neutral-800">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your tasks..."
              className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-4 py-2.5 bg-indigo-600 dark:bg-orange-500 text-white rounded-xl hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ProcessingOverlay({ onProcessInBackground, canNotify }) {
  return (
    <div className="absolute inset-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
      {/* AI Processing Animation */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 animate-spin-slow opacity-20 absolute inset-0" />
        <div className="w-20 h-20 rounded-full bg-gradient-to-bl from-indigo-500 via-purple-500 to-pink-500 animate-spin-slow-reverse opacity-20 absolute inset-0" />
        <div className="w-20 h-20 rounded-full bg-white dark:bg-neutral-900 flex items-center justify-center relative">
          <Sparkles className="w-10 h-10 text-indigo-600 dark:text-orange-500 animate-pulse" />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">AI is analyzing your transcript</h3>
      <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6 text-center max-w-xs">
        Extracting action items, identifying owners, and setting priorities...
      </p>

      {/* Animated dots */}
      <div className="flex gap-1 mb-6">
        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      <button
        onClick={onProcessInBackground}
        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
      >
        <Bell size={16} />
        {canNotify ? 'Process in background' : 'Enable notifications & continue'}
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-slate-200 dark:border-neutral-800 p-3 animate-pulse">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-3 h-3 rounded bg-indigo-200 dark:bg-indigo-900" />
        <div className="h-3 bg-indigo-100 dark:bg-indigo-900/50 rounded w-24" />
      </div>
      <div className="flex items-start gap-2 mb-2">
        <div className="w-4 h-4 rounded bg-slate-200 dark:bg-neutral-800 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-neutral-800 rounded w-full" />
          <div className="h-4 bg-slate-200 dark:bg-neutral-800 rounded w-3/4" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-2 ml-6">
        <div className="w-3 h-3 rounded bg-slate-200 dark:bg-neutral-800" />
        <div className="h-3 bg-slate-100 dark:bg-neutral-800 rounded w-16" />
      </div>
      <div className="flex items-center justify-between ml-6">
        <div className="h-5 bg-slate-100 dark:bg-neutral-800 rounded-full w-14" />
        <div className="h-3 bg-slate-100 dark:bg-neutral-800 rounded w-12" />
      </div>
    </div>
  );
}

function PasteModal({ isOpen, onClose, onSubmit, isProcessing, onProcessInBackground, canNotify, onBulkSubmit, meetings = [] }) {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [fileQueue, setFileQueue] = useState([]); // Queue for bulk upload
  const [bulkMode, setBulkMode] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { filename, existingMeeting }
  const fileInputRef = useRef(null);
  const bulkFileInputRef = useRef(null);

  // Check if a filename already exists in meetings
  const checkForDuplicate = (filename) => {
    const normalizedFilename = filename.toLowerCase().trim();
    const filenameWithoutExt = normalizedFilename.replace(/\.(pdf|txt)$/i, '');

    return meetings.find(m => {
      const sourceFileName = (m.sourceFileName || '').toLowerCase().trim();
      const sourceFileNameWithoutExt = sourceFileName.replace(/\.(pdf|txt)$/i, '');
      const title = (m.title || '').toLowerCase().trim();

      // Compare without extensions on both sides
      return sourceFileNameWithoutExt === filenameWithoutExt ||
             sourceFileName === normalizedFilename ||
             title === filenameWithoutExt;
    });
  };

  // Clear form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setTranscript('');
      setUploadedFile(null);
      setUploadError(null);
      setFileQueue([]);
      setBulkMode(false);
      setDuplicateWarning(null);
    }
  }, [isOpen]);

  // Parse a single file and return the text
  const parseFile = async (file) => {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await fetch('/api/parse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: base64,
        filename: file.name,
        type: file.type
      })
    });

    const data = await response.json();
    if (data.success) {
      return { success: true, text: data.text, filename: file.name };
    } else {
      return { success: false, error: data.error, filename: file.name };
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'text/plain'];
    const validExtensions = ['.pdf', '.txt'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setUploadError('Please upload a PDF or TXT file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    // Check for duplicate
    const existingMeeting = checkForDuplicate(file.name);
    if (existingMeeting) {
      setDuplicateWarning({ filename: file.name, existingMeeting });
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await parseFile(file);

      if (result.success) {
        setTranscript(result.text);
        setUploadedFile(file.name);
        // Try to extract title from filename
        if (!title) {
          const nameWithoutExt = file.name.replace(/\.(pdf|txt)$/i, '');
          setTitle(nameWithoutExt);
        }
      } else {
        setUploadError(result.error || 'Failed to parse file');
      }
    } catch (err) {
      console.error('File upload error:', err);
      setUploadError('Failed to upload file');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBulkFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate all files
    const validTypes = ['application/pdf', 'text/plain'];
    const validExtensions = ['.pdf', '.txt'];

    const validFiles = files.filter(file => {
      const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      const hasValidType = validTypes.includes(file.type);
      const validSize = file.size <= 10 * 1024 * 1024;
      return (hasValidType || hasValidExtension) && validSize;
    });

    if (validFiles.length === 0) {
      setUploadError('No valid PDF or TXT files selected');
      return;
    }

    if (validFiles.length < files.length) {
      setUploadError(`${files.length - validFiles.length} file(s) skipped (invalid type or too large)`);
    }

    // Add files to queue with pending status, checking for duplicates
    const newQueue = validFiles.map(file => {
      const existingMeeting = checkForDuplicate(file.name);
      return {
        file,
        name: file.name,
        status: 'pending', // pending, parsing, parsed, error
        text: null,
        error: null,
        isDuplicate: !!existingMeeting,
        existingMeeting: existingMeeting || null
      };
    });

    setFileQueue(newQueue);
    setBulkMode(true);

    // Reset file input
    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.value = '';
    }

    // Parse all files
    for (let i = 0; i < newQueue.length; i++) {
      setFileQueue(prev => prev.map((item, idx) =>
        idx === i ? { ...item, status: 'parsing' } : item
      ));

      try {
        const result = await parseFile(newQueue[i].file);
        setFileQueue(prev => prev.map((item, idx) =>
          idx === i ? {
            ...item,
            status: result.success ? 'parsed' : 'error',
            text: result.text,
            error: result.error
          } : item
        ));
      } catch (err) {
        setFileQueue(prev => prev.map((item, idx) =>
          idx === i ? { ...item, status: 'error', error: 'Failed to parse' } : item
        ));
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (transcript.trim()) {
      onSubmit({ title: title.trim() || 'Untitled Meeting', transcript: transcript.trim() });
    }
  };

  const handleBulkSubmit = () => {
    const parsedFiles = fileQueue.filter(f => f.status === 'parsed' && f.text);
    if (parsedFiles.length > 0 && onBulkSubmit) {
      onBulkSubmit(parsedFiles.map(f => ({
        title: f.name.replace(/\.(pdf|txt)$/i, ''),
        transcript: f.text
      })));
    }
  };

  const removeFromQueue = (index) => {
    setFileQueue(prev => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    setTitle('');
    setTranscript('');
    setUploadedFile(null);
    setUploadError(null);
    setFileQueue([]);
    setBulkMode(false);
    onClose();
  };

  if (!isOpen) return null;

  const parsedCount = fileQueue.filter(f => f.status === 'parsed').length;
  const parsingCount = fileQueue.filter(f => f.status === 'parsing').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-2xl h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden relative border border-transparent dark:border-neutral-600 flex flex-col">
        {/* Processing Overlay */}
        {isProcessing && (
          <ProcessingOverlay
            onProcessInBackground={onProcessInBackground}
            canNotify={canNotify}
          />
        )}

        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            {bulkMode ? `Bulk Import (${parsedCount} files ready)` : 'Add Meeting Transcript'}
          </h2>
          <button onClick={handleClose} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200" disabled={isProcessing}>
            <X size={20} />
          </button>
        </div>

        {bulkMode ? (
          /* Bulk Mode UI */
          <div className="p-4">
            <div className="mb-4 max-h-[400px] overflow-y-auto space-y-2">
              {fileQueue.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    item.status === 'parsed' && item.isDuplicate ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30' :
                    item.status === 'parsed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' :
                    item.status === 'error' ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30' :
                    item.status === 'parsing' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30' :
                    'bg-slate-50 dark:bg-neutral-800 border-slate-200 dark:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <File size={16} className={
                      item.status === 'parsed' && item.isDuplicate ? 'text-amber-500' :
                      item.status === 'parsed' ? 'text-emerald-500' :
                      item.status === 'error' ? 'text-rose-500' :
                      item.status === 'parsing' ? 'text-blue-500' :
                      'text-slate-400'
                    } />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-neutral-200">{item.name}</p>
                      {item.status === 'parsing' && (
                        <p className="text-xs text-blue-600 dark:text-blue-400">Parsing...</p>
                      )}
                      {item.status === 'parsed' && !item.isDuplicate && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">Ready to import</p>
                      )}
                      {item.status === 'parsed' && item.isDuplicate && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle size={10} />
                          Duplicate - previously imported as "{item.existingMeeting?.title}"
                        </p>
                      )}
                      {item.status === 'error' && (
                        <p className="text-xs text-rose-600 dark:text-rose-400">{item.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'parsing' && (
                      <RefreshCw size={14} className="animate-spin text-blue-500" />
                    )}
                    {item.status === 'parsed' && (
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    )}
                    <button
                      onClick={() => removeFromQueue(idx)}
                      className="p-1 text-slate-400 hover:text-rose-500"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setBulkMode(false);
                  setFileQueue([]);
                }}
                className="text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200"
              >
                Switch to single file mode
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isProcessing}
                  className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={parsedCount === 0 || parsingCount > 0 || isProcessing}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  Import {parsedCount} File{parsedCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Single File Mode UI */
          <form onSubmit={handleSubmit} className="p-4">
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                Meeting Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Sprint Planning, Client Call, 1:1 with Sarah"
                className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                disabled={isProcessing}
              />
              {uploadedFile && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1.5" title={uploadedFile}>
                  <File size={12} className="flex-shrink-0" />
                  <span className="truncate">{uploadedFile}</span>
                </p>
              )}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
                  Transcript <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isProcessing || isUploading}
                  />
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={handleBulkFileSelect}
                    className="hidden"
                    multiple
                    disabled={isProcessing || isUploading}
                  />
                  <button
                    type="button"
                    onClick={() => bulkFileInputRef.current?.click()}
                    disabled={isProcessing || isUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-orange-500 bg-indigo-50 dark:bg-orange-500/10 hover:bg-indigo-100 dark:hover:bg-orange-500/20 rounded-lg transition-colors disabled:opacity-50"
                    title="Select multiple files to import at once"
                  >
                    <Plus size={14} />
                    Bulk Import
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing || isUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        Upload File
                      </>
                    )}
                  </button>
                </div>
              </div>
              {uploadError && (
                <p className="text-xs text-rose-500 mb-2">{uploadError}</p>
              )}
              {duplicateWarning && (
                <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />
                    <span className="truncate">
                      Duplicate - previously imported as "{duplicateWarning.existingMeeting.title}"
                    </span>
                  </p>
                </div>
              )}
              <textarea
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  if (uploadedFile) setUploadedFile(null);
                }}
                placeholder="Paste your meeting transcript here, or upload a PDF/TXT file..."
                rows={12}
                required
                disabled={isProcessing || isUploading}
                className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm disabled:bg-slate-50 dark:disabled:bg-slate-900 dark:bg-neutral-950 dark:text-white"
              />
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">
                Paste the full transcript or upload a file. Use <strong>Bulk Import</strong> to process multiple files at once.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isProcessing}
                className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!transcript.trim() || isProcessing}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Sparkles size={16} />
                Extract Action Items
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AddColumnModal({ isOpen, onClose, onSubmit }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('slate');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (label.trim()) {
      onSubmit({ label: label.trim(), color });
      setLabel('');
      setColor('slate');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-md border border-transparent dark:border-neutral-600">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Add New Column</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Column Name
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Review, Blocked, Next Week"
              className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(COLUMN_COLORS).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full ${COLUMN_COLORS[c].bg} border-2 ${color === c ? 'border-indigo-500' : 'border-transparent'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!label.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Column
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel = "Delete", danger = true, subMessage }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-md overflow-hidden border border-transparent dark:border-neutral-600">
        <div className="p-6">
          <div className="flex items-start gap-4">
            {danger && (
              <div className="flex-shrink-0 w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{title}</h2>
              <p className="text-slate-600 dark:text-neutral-300 mt-1">{message}</p>
              {subMessage && (
                <p className="text-sm text-slate-500 dark:text-neutral-400 mt-2 bg-slate-50 dark:bg-neutral-950 rounded-lg px-3 py-2">
                  {subMessage}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-neutral-950 border-t border-slate-100 dark:border-neutral-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              danger
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTaskModal({ isOpen, task, onClose, onSave, columns, onAddComment, githubStatus, onRefreshGithubStatus }) {
  const [formData, setFormData] = useState({
    task: '',
    owner: '',
    person: '',
    dueDate: '',
    priority: 'medium',
    type: 'action',
    context: '',
    status: 'todo',
    tags: [],
    subtasks: [],
    githubIssueUrl: null,
    githubIssueNumber: null
  });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);

  useEffect(() => {
    if (task && isOpen) {
      // Only reset tab and clear inputs when opening a different task
      const isNewTask = task.id !== currentTaskId;

      setFormData({
        task: task.task || '',
        owner: task.owner || '',
        person: task.person || '',
        dueDate: task.dueDate || '',
        priority: task.priority || 'medium',
        type: task.type || 'action',
        context: task.context || '',
        status: task.status || 'todo',
        tags: task.tags || [],
        subtasks: task.subtasks || [],
        githubIssueUrl: task.githubIssueUrl || null,
        githubIssueNumber: task.githubIssueNumber || null
      });

      if (isNewTask) {
        setActiveTab('details');
        setNewComment('');
        setNewTag('');
        setNewSubtask('');
        setCurrentTaskId(task.id);
      }
    }
  }, [task, isOpen]);

  // Reset currentTaskId when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentTaskId(null);
    }
  }, [isOpen]);

  // Tag management
  const addTag = (tag) => {
    const normalizedTag = tag.toLowerCase().trim().replace(/^#/, '');
    if (normalizedTag && !formData.tags.includes(normalizedTag)) {
      setFormData({ ...formData, tags: [...formData.tags, normalizedTag] });
    }
    setNewTag('');
  };

  const removeTag = (tagToRemove) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tagToRemove) });
  };

  // Subtask management - with immediate save
  const saveSubtasksUpdate = async (updatedSubtasks) => {
    const updatedFormData = { ...formData, subtasks: updatedSubtasks };
    setFormData(updatedFormData);
    await onSave(task.id, updatedFormData);
  };

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    const subtask = {
      id: `st_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: newSubtask.trim(),
      completed: false
    };
    setNewSubtask('');
    await saveSubtasksUpdate([...formData.subtasks, subtask]);
  };

  const toggleSubtask = async (subtaskId) => {
    const updatedSubtasks = formData.subtasks.map(st =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    await saveSubtasksUpdate(updatedSubtasks);
  };

  const removeSubtask = async (subtaskId) => {
    await saveSubtasksUpdate(formData.subtasks.filter(st => st.id !== subtaskId));
  };

  const startEditingSubtask = (subtask) => {
    setEditingSubtaskId(subtask.id);
    setEditingSubtaskText(subtask.text);
  };

  const saveSubtaskEdit = async () => {
    if (!editingSubtaskId) return;
    if (!editingSubtaskText.trim()) {
      // If empty, remove the subtask
      await removeSubtask(editingSubtaskId);
    } else {
      const updatedSubtasks = formData.subtasks.map(st =>
        st.id === editingSubtaskId ? { ...st, text: editingSubtaskText.trim() } : st
      );
      await saveSubtasksUpdate(updatedSubtasks);
    }
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(task.id, formData);
    setIsSaving(false);
    onClose();
  };

  const handleMarkAsDone = async () => {
    setIsSaving(true);
    await onSave(task.id, { ...formData, status: 'done' });
    setIsSaving(false);
    onClose();
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || isAddingComment) return;

    setIsAddingComment(true);
    try {
      await onAddComment(task.id, newComment.trim());
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setIsAddingComment(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getActivityDescription = (activity) => {
    const fieldLabels = {
      status: 'status',
      priority: 'priority',
      task: 'description',
      owner: 'owner',
      person: 'follow-up person',
      dueDate: 'due date',
      context: 'context',
      type: 'type',
      archived: 'archived status'
    };

    if (activity.type === 'comment') {
      return 'added a comment';
    }

    if (activity.type === 'created') {
      return activity.source ? `extracted from "${activity.source}"` : 'task created';
    }

    const fieldLabel = fieldLabels[activity.field] || activity.field;
    if (activity.oldValue && activity.newValue) {
      return `changed ${fieldLabel} from "${activity.oldValue}" to "${activity.newValue}"`;
    }
    if (activity.newValue) {
      return `set ${fieldLabel} to "${activity.newValue}"`;
    }
    return `updated ${fieldLabel}`;
  };

  // Parse @mentions in comment text
  const renderCommentText = (text) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className="text-indigo-600 font-medium bg-indigo-50 px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (!isOpen || !task) return null;

  const comments = task.comments || [];
  const activity = task.activity || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-2xl h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col border border-transparent dark:border-neutral-600">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Edit Task</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-neutral-800 px-4 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'details'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <Pencil size={16} />
            Details
          </button>
          <button
            onClick={() => setActiveTab('tags')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'tags'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <Tag size={16} />
            Tags
            {formData.tags.length > 0 && (
              <span className="bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">
                {formData.tags.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('subtasks')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'subtasks'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <ListChecks size={16} />
            Subtasks
            {formData.subtasks.length > 0 && (
              <span className="bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">
                {formData.subtasks.filter(s => s.completed).length}/{formData.subtasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'comments'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <MessageSquare size={16} />
            Comments
            {comments.length > 0 && (
              <span className="bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">
                {comments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'activity'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <History size={16} />
            Activity
            {activity.length > 0 && (
              <span className="bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">
                {activity.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <form id="edit-task-form" onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Task Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Task Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={formData.task}
                  onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                  rows={2}
                  required
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none dark:bg-neutral-950 dark:text-white"
                />
              </div>

              {/* Owner */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Owner / Assigned To
                </label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Me, John, Sarah, etc."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                />
              </div>

              {/* Type and Person (for follow-ups) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                  >
                    <option value="action">Action</option>
                    <option value="follow-up">Follow-up</option>
                    <option value="enhancement">Enhancement</option>
                    <option value="bug">Bug</option>
                  </select>
                </div>
                {formData.type === 'follow-up' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                      Follow-up With
                    </label>
                    <input
                      type="text"
                      value={formData.person}
                      onChange={(e) => setFormData({ ...formData, person: e.target.value })}
                      placeholder="Person name"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {/* Due Date and Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                >
                  {columns.map(col => (
                    <option key={col.id} value={col.id}>{col.label}</option>
                  ))}
                </select>
              </div>

              {/* Context */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Context / Notes
                </label>
                <textarea
                  value={formData.context}
                  onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                  rows={3}
                  placeholder="Additional context about this task..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none dark:bg-neutral-950 dark:text-white"
                />
              </div>

              {/* GitHub Integration - only show for enhancement/bug types */}
              {(formData.type === 'enhancement' || formData.type === 'bug') && (
                <div className="border border-slate-200 dark:border-neutral-700 rounded-lg p-4 bg-slate-50 dark:bg-neutral-900/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Github size={18} className="text-slate-600 dark:text-neutral-400" />
                    <span className="font-medium text-slate-700 dark:text-neutral-300">GitHub Integration</span>
                  </div>

                  {formData.githubIssueUrl ? (
                    // Issue already exists
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500" />
                      <span className="text-sm text-slate-600 dark:text-neutral-400">Issue #{formData.githubIssueNumber}</span>
                      <a
                        href={formData.githubIssueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-lg hover:bg-slate-300 dark:hover:bg-neutral-700 transition-colors"
                      >
                        View on GitHub
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  ) : githubStatus?.connected ? (
                    // Connected but no issue yet
                    <div>
                      <p className="text-sm text-slate-500 dark:text-neutral-500 mb-2">
                        Connected as <span className="font-medium text-slate-700 dark:text-neutral-300">@{githubStatus.username}</span>
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsCreatingIssue(true);
                          try {
                            const response = await fetch('/api/github/create-issue', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                task: formData.task,
                                owner: formData.owner,
                                dueDate: formData.dueDate,
                                priority: formData.priority,
                                type: formData.type,
                                context: formData.context,
                              }),
                            });
                            const data = await response.json();
                            if (data.success) {
                              setFormData({
                                ...formData,
                                githubIssueUrl: data.issueUrl,
                                githubIssueNumber: data.issueNumber,
                              });
                              // Save immediately with GitHub issue data
                              await onSave(task.id, {
                                ...formData,
                                githubIssueUrl: data.issueUrl,
                                githubIssueNumber: data.issueNumber,
                              });
                            } else {
                              alert('Failed to create issue: ' + (data.error || 'Unknown error'));
                            }
                          } catch (error) {
                            console.error('Create issue error:', error);
                            alert('Failed to create issue');
                          } finally {
                            setIsCreatingIssue(false);
                          }
                        }}
                        disabled={isCreatingIssue || !formData.task.trim()}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-neutral-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isCreatingIssue ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Github size={16} />
                            Create GitHub Issue
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    // Not connected
                    <div>
                      <p className="text-sm text-slate-500 dark:text-neutral-500 mb-3">
                        Connect your GitHub account to create issues directly.
                      </p>
                      <a
                        href="/api/github/connect"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-neutral-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-neutral-600 transition-colors"
                      >
                        <Link size={16} />
                        Connect GitHub
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-between pt-2">
                {/* Mark as Done button - only show if not already done */}
                {formData.status !== 'done' ? (
                  <button
                    type="button"
                    disabled={!formData.task.trim() || isSaving}
                    onClick={handleMarkAsDone}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    Mark as Done
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!formData.task.trim() || isSaving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Tags Tab */}
          {activeTab === 'tags' && (
            <div className="p-4">
              {/* Predefined Tags */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-2">
                  Quick Add Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      disabled={formData.tags.includes(tag)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        formData.tags.includes(tag)
                          ? 'bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border-slate-200 dark:border-neutral-700 cursor-not-allowed'
                          : `${TAG_COLORS[tag]?.bg || TAG_COLORS.default.bg} ${TAG_COLORS[tag]?.text || TAG_COLORS.default.text} ${TAG_COLORS[tag]?.border || TAG_COLORS.default.border} hover:opacity-80`
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Tag Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Add Custom Tag
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(newTag);
                      }
                    }}
                    placeholder="Type a tag name..."
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => addTag(newTag)}
                    disabled={!newTag.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Current Tags */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-2">
                  Current Tags ({formData.tags.length})
                </label>
                {formData.tags.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-neutral-500 italic">No tags added yet</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map(tag => (
                      <TagBadge key={tag} tag={tag} onRemove={removeTag} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Subtasks Tab */}
          {activeTab === 'subtasks' && (
            <div className="p-4">
              {/* Add Subtask */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Add Subtask
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSubtask();
                      }
                    }}
                    placeholder="Enter subtask..."
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={addSubtask}
                    disabled={!newSubtask.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Subtask Progress */}
              {formData.subtasks.length > 0 && (
                <div className="mb-4">
                  <SubtaskProgress subtasks={formData.subtasks} />
                </div>
              )}

              {/* Subtasks List */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-2">
                  Subtasks ({formData.subtasks.length})
                </label>
                {formData.subtasks.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-neutral-500 italic">No subtasks added yet</p>
                ) : (
                  <div className="space-y-2">
                    {formData.subtasks.map(subtask => (
                      <div
                        key={subtask.id}
                        className={`flex items-center gap-3 p-2 rounded-lg border ${
                          subtask.completed
                            ? 'bg-slate-50 dark:bg-neutral-900 border-slate-200 dark:border-neutral-800'
                            : 'bg-white dark:bg-neutral-950 border-slate-200 dark:border-neutral-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSubtask(subtask.id)}
                          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            subtask.completed
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-slate-300 dark:border-neutral-700 hover:border-emerald-500'
                          }`}
                        >
                          {subtask.completed && <CheckCircle2 size={12} />}
                        </button>
                        {editingSubtaskId === subtask.id ? (
                          <input
                            type="text"
                            value={editingSubtaskText}
                            onChange={(e) => setEditingSubtaskText(e.target.value)}
                            onBlur={saveSubtaskEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveSubtaskEdit();
                              } else if (e.key === 'Escape') {
                                setEditingSubtaskId(null);
                                setEditingSubtaskText('');
                              }
                            }}
                            autoFocus
                            className="flex-1 text-sm px-2 py-1 border border-indigo-300 dark:border-indigo-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-white"
                          />
                        ) : (
                          <span
                            onClick={() => startEditingSubtask(subtask)}
                            className={`flex-1 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-neutral-800 px-2 py-1 rounded ${subtask.completed ? 'text-slate-400 dark:text-neutral-500 line-through' : 'text-slate-700 dark:text-neutral-300'}`}
                          >
                            {subtask.text}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSubtask(subtask.id)}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && (
            <div className="p-4 flex flex-col h-full">
              {/* Comment Input */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment... (use @name to mention someone)"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm dark:bg-neutral-950 dark:text-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          handleAddComment();
                        }
                      }}
                    />
                    <div className="absolute right-2 bottom-2 text-xs text-slate-400 dark:text-neutral-500">
                      {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to send
                    </div>
                  </div>
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || isAddingComment}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
                  >
                    {isAddingComment ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </div>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto space-y-3">
                {comments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                    <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No comments yet</p>
                    <p className="text-xs mt-1">Add a comment to keep track of updates</p>
                  </div>
                ) : (
                  [...comments].reverse().map(comment => (
                    <div key={comment.id} className="bg-slate-50 dark:bg-neutral-950 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{comment.user}</span>
                        <span className="text-xs text-slate-400 dark:text-neutral-500">{formatTimestamp(comment.timestamp)}</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-neutral-300">{renderCommentText(comment.text)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="p-4">
              {activity.length === 0 ? (
                <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                  <History size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Changes to this task will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...activity].reverse().map(item => (
                    <div key={item.id} className="flex gap-3 text-sm">
                      <div className="flex-shrink-0 w-8 h-8 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center">
                        {item.type === 'comment' ? (
                          <MessageSquare size={14} className="text-slate-500 dark:text-neutral-400" />
                        ) : (
                          <History size={14} className="text-slate-500 dark:text-neutral-400" />
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-slate-600 dark:text-neutral-300">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{item.user}</span>
                          {' '}{getActivityDescription(item)}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">{formatTimestamp(item.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddTaskModal({ isOpen, columnId, columns, onClose, onSave }) {
  const [formData, setFormData] = useState({
    task: '',
    owner: CURRENT_USER,
    person: '',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    priority: 'medium',
    type: 'action',
    context: '',
    status: 'todo'
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && columnId) {
      setFormData(prev => ({
        ...prev,
        task: '',
        context: '',
        status: columnId
      }));
    }
  }, [isOpen, columnId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(formData);
    setIsSaving(false);
    setFormData({
      task: '',
      owner: CURRENT_USER,
      person: '',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority: 'medium',
      type: 'action',
      context: '',
      status: columnId || 'todo'
    });
    onClose();
  };

  if (!isOpen) return null;

  const columnName = columns.find(c => c.id === columnId)?.label || 'To Do';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-lg h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden border border-transparent dark:border-neutral-600 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Add Task to {columnName}</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Task Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Task Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={formData.task}
              onChange={(e) => setFormData({ ...formData, task: e.target.value })}
              rows={2}
              required
              autoFocus
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none dark:bg-neutral-950 dark:text-white"
            />
          </div>

          {/* Owner */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Owner / Assigned To
            </label>
            <input
              type="text"
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              placeholder="Me, John, Sarah, etc."
              className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
            />
          </div>

          {/* Type and Person */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
              >
                <option value="action">Action</option>
                <option value="follow-up">Follow-up</option>
              </select>
            </div>
            {formData.type === 'follow-up' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Follow-up With
                </label>
                <input
                  type="text"
                  value={formData.person}
                  onChange={(e) => setFormData({ ...formData, person: e.target.value })}
                  placeholder="Person name"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* Due Date and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Context */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Context / Notes
            </label>
            <textarea
              value={formData.context}
              onChange={(e) => setFormData({ ...formData, context: e.target.value })}
              rows={2}
              placeholder="Additional context about this task..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none dark:bg-neutral-950 dark:text-white"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.task.trim() || isSaving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Add Task
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// FilterDropdown component for compact filter menus
function FilterDropdown({ label, icon: Icon, options, value, onChange, multiple = false, badge }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasValue = multiple ? value.length > 0 : value !== null && value !== 'all';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
          hasValue
            ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium'
            : 'bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:border-slate-300 dark:hover:border-neutral-600'
        }`}
      >
        {Icon && <Icon size={14} />}
        {label}
        {badge && <span className="text-xs opacity-70">({badge})</span>}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
          {options.map(option => {
            const isSelected = multiple
              ? value.includes(option.id)
              : value === option.id;

            return (
              <button
                key={option.id}
                onClick={() => {
                  if (multiple) {
                    onChange(isSelected
                      ? value.filter(v => v !== option.id)
                      : [...value, option.id]
                    );
                  } else {
                    onChange(isSelected ? (option.id === 'all' ? 'all' : null) : option.id);
                    setIsOpen(false);
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-orange-500/10 text-indigo-700 dark:text-orange-500'
                    : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700'
                }`}
              >
                {multiple && (
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                    isSelected
                      ? 'bg-indigo-600 dark:bg-orange-500 border-indigo-600 dark:border-orange-500'
                      : 'border-slate-300 dark:border-neutral-600'
                  }`}>
                    {isSelected && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                )}
                {option.icon && <option.icon size={14} className={option.color || ''} />}
                <span className="flex-1">{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs text-slate-400 dark:text-neutral-500">{option.count}</span>
                )}
              </button>
            );
          })}

          {multiple && value.length > 0 && (
            <>
              <div className="h-px bg-slate-200 dark:bg-neutral-700 my-1" />
              <button
                onClick={() => {
                  onChange([]);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-sm text-left text-slate-500 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-700"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// MobileFilterSheet component for mobile filter drawer
function MobileFilterSheet({ isOpen, onClose, view, setView, dueDateFilter, setDueDateFilter, tagFilter, setTagFilter, stats }) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 md:hidden"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-neutral-900 rounded-t-2xl shadow-xl md:hidden max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <h3 className="font-semibold text-slate-800 dark:text-white">Filters</h3>
          <button onClick={onClose} className="p-1 text-slate-400 dark:text-neutral-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* View Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">View</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'all', label: 'All Items' },
                { id: 'mine', label: 'My Tasks', count: stats?.mine },
                { id: 'actions', label: 'Actions' },
                { id: 'follow-ups', label: 'Follow-ups' },
              ].map(option => (
                <button
                  key={option.id}
                  onClick={() => setView(option.id)}
                  className={`px-3 py-2 rounded-lg text-sm text-left ${
                    view === option.id
                      ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium'
                      : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {option.label}
                  {option.count !== undefined && <span className="ml-1 opacity-70">({option.count})</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">Due Date</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: null, label: 'Any time' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'today', label: 'Due Today' },
                { id: 'this-week', label: 'This Week' },
                { id: 'upcoming', label: 'Upcoming' },
              ].map(option => (
                <button
                  key={option.id || 'any'}
                  onClick={() => setDueDateFilter(option.id)}
                  className={`px-3 py-2 rounded-lg text-sm text-left ${
                    dueDateFilter === option.id
                      ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium'
                      : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">Tags</label>
            <div className="flex flex-wrap gap-2">
              {PREDEFINED_TAGS.map(tag => {
                const isSelected = tagFilter.includes(tag);
                const colors = TAG_COLORS[tag] || TAG_COLORS.default;
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      if (isSelected) {
                        setTagFilter(tagFilter.filter(t => t !== tag));
                      } else {
                        setTagFilter([...tagFilter, tag]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm ${
                      isSelected
                        ? `${colors.bg} ${colors.text} ${colors.border} border`
                        : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Apply/Clear Buttons */}
        <div className="p-4 border-t border-slate-200 dark:border-neutral-800 flex gap-3">
          <button
            onClick={() => {
              setView('all');
              setDueDateFilter(null);
              setTagFilter([]);
            }}
            className="flex-1 px-4 py-2.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg"
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg font-medium"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}

function SearchInput({ value, onChange, resultCount }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onChange('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChange]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={value ? `${resultCount} results` : "Search tasks... (\u2318K)"}
        className="pl-9 pr-8 py-1.5 w-full md:w-64 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default function MeetingKanban() {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [view, setView] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showEmptyMeetings, setShowEmptyMeetings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState(null);
  const [error, setError] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });
  const [editingTask, setEditingTask] = useState(null);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [viewingTranscript, setViewingTranscript] = useState(null);
  const [addingToColumn, setAddingToColumn] = useState(null);
  const [draggingColumn, setDraggingColumn] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingInBackground, setProcessingInBackground] = useState(false);
  const [canNotify, setCanNotify] = useState(false);
  const processingDataRef = useRef(null);

  // New state for features
  const [theme, setTheme] = useState('system'); // 'light', 'dark', 'system'
  const [tagFilter, setTagFilter] = useState([]); // Array of tags to filter by
  const [dueDateFilter, setDueDateFilter] = useState(null); // 'overdue', 'today', 'this-week', 'upcoming', null
  const [viewDensity, setViewDensity] = useState('normal'); // 'compact', 'normal', 'spacious'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Collapsible sidebar
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Mobile sidebar drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false); // Mobile filter sheet
  const [showImportHistory, setShowImportHistory] = useState(false); // Import history modal
  const [showWhatsNew, setShowWhatsNew] = useState(false); // What's New modal
  const [newFeatures, setNewFeatures] = useState([]); // Features to display in What's New
  const [showAllFeatures, setShowAllFeatures] = useState(false); // Show all features vs just new
  const [showAskAI, setShowAskAI] = useState(false); // AI Assistant modal
  const [githubStatus, setGithubStatus] = useState(null); // GitHub connection status

  // Fetch GitHub connection status
  const fetchGithubStatus = async () => {
    try {
      const response = await fetch('/api/github/status');
      if (response.ok) {
        const data = await response.json();
        setGithubStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch GitHub status:', error);
    }
  };

  // Check for GitHub connection result from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('github_connected') === 'true') {
      fetchGithubStatus();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('github_error')) {
      console.error('GitHub connection error:', params.get('github_error'));
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Fetch GitHub status on mount
  useEffect(() => {
    if (session) {
      fetchGithubStatus();
    }
  }, [session]);

  // Initialize theme from localStorage and system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    const savedDensity = localStorage.getItem('viewDensity') || 'normal';
    const savedSidebarState = localStorage.getItem('sidebarCollapsed') === 'true';
    setTheme(savedTheme);
    setViewDensity(savedDensity);
    setSidebarCollapsed(savedSidebarState);

    // Apply theme
    applyTheme(savedTheme);

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (savedTheme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);

    // Keyboard shortcut for sidebar toggle (Cmd/Ctrl + B)
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => {
          const newState = !prev;
          localStorage.setItem('sidebarCollapsed', String(newState));
          return newState;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const applyTheme = (themeValue) => {
    const isDark = themeValue === 'dark' ||
      (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  const changeViewDensity = (density) => {
    setViewDensity(density);
    localStorage.setItem('viewDensity', density);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebarCollapsed', String(newState));
      return newState;
    });
  };

  // Check for overdue tasks and send notification on page load
  useEffect(() => {
    const lastNotified = localStorage.getItem('lastOverdueNotification');
    const today = new Date().toDateString();

    if (lastNotified !== today && tasks.length > 0) {
      const overdueTasks = tasks.filter(t => {
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return dueDate < now && t.status !== 'done' && !t.archived && !t.deleted;
      });

      if (overdueTasks.length > 0 && canNotify) {
        sendNotification(
          'Overdue Tasks',
          `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} that need attention.`
        );
        localStorage.setItem('lastOverdueNotification', today);
      }
    }
  }, [tasks, canNotify]);

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setCanNotify(Notification.permission === 'granted');
    }
  }, []);

  // Request notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setCanNotify(permission === 'granted');
      return permission === 'granted';
    }
    return false;
  };

  // Send browser notification
  const sendNotification = (title, body) => {
    if (canNotify && 'Notification' in window) {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'meeting-actions'
      });
    }
  };

  // Fetch data from API
  const fetchData = async () => {
    try {
      setLoading(true);
      const [dataRes, columnsRes] = await Promise.all([
        fetch('/api/webhook'),
        fetch('/api/columns')
      ]);
      const data = await dataRes.json();
      const columnsData = await columnsRes.json();
      
      setMeetings(data.meetings || []);
      setTasks(data.tasks || []);
      setColumns(columnsData.columns || DEFAULT_COLUMNS);
      setLastSynced(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to fetch data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Check for new features on mount
  useEffect(() => {
    const checkNewFeatures = async () => {
      try {
        const response = await fetch('/api/user-preferences');
        if (!response.ok) return;

        const data = await response.json();
        const features = getNewFeatures(data.lastSeenVersion);

        if (features.length > 0) {
          setNewFeatures(features);
          setShowWhatsNew(true);
        }
      } catch (err) {
        console.error('Failed to check for new features:', err);
      }
    };

    checkNewFeatures();
  }, []);

  // Handle What's New modal dismiss
  const handleWhatsNewDismiss = async () => {
    setShowWhatsNew(false);
    setShowAllFeatures(false);

    // Only update lastSeenVersion if we were showing new features (not release history)
    if (!showAllFeatures) {
      try {
        await fetch('/api/user-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastSeenVersion: APP_VERSION })
        });
      } catch (err) {
        console.error('Failed to update last seen version:', err);
      }
    }
  };

  // Open release history modal
  const handleShowReleaseHistory = () => {
    setNewFeatures(getAllFeatures());
    setShowAllFeatures(true);
    setShowWhatsNew(true);
  };

  // Process a pasted transcript
  const handlePasteSubmit = async ({ title, transcript }) => {
    setIsProcessing(true);
    setError(null);

    // Store the request data in case we switch to background processing
    processingDataRef.current = { title, transcript };

    try {
      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          title,
          date: new Date().toISOString().split('T')[0]
        })
      });

      const data = await response.json();

      if (data.success) {
        setMeetings(prev => [data.meeting, ...prev]);
        setTasks(prev => [...data.tasks, ...prev]);
        setShowPasteModal(false);

        // Send notification if processing was in background
        if (processingInBackground) {
          sendNotification(
            'Meeting processed!',
            `Extracted ${data.tasks.length} action items from "${data.meeting.title}"`
          );
        }
      } else {
        setError(data.error || 'Failed to process transcript');
        if (processingInBackground) {
          sendNotification('Processing failed', data.error || 'Failed to process transcript');
        }
      }
    } catch (err) {
      setError('Failed to process transcript');
      console.error(err);
      if (processingInBackground) {
        sendNotification('Processing failed', 'Failed to process transcript');
      }
    } finally {
      setIsProcessing(false);
      setProcessingInBackground(false);
      processingDataRef.current = null;
    }
  };

  // Bulk import handler - processes multiple files sequentially
  const handleBulkSubmit = async (files) => {
    setIsProcessing(true);
    setProcessingInBackground(true); // Auto-enable background mode for bulk
    setShowPasteModal(false);
    setError(null);

    let successCount = 0;
    let totalTasks = 0;

    for (const file of files) {
      try {
        const response = await fetch('/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: file.transcript,
            title: file.title,
            date: new Date().toISOString().split('T')[0]
          })
        });

        const data = await response.json();

        if (data.success) {
          setMeetings(prev => [data.meeting, ...prev]);
          setTasks(prev => [...data.tasks, ...prev]);
          successCount++;
          totalTasks += data.tasks.length;
        }
      } catch (err) {
        console.error(`Failed to process ${file.title}:`, err);
      }
    }

    setIsProcessing(false);
    setProcessingInBackground(false);

    // Send completion notification
    if (canNotify) {
      sendNotification(
        'Bulk import complete!',
        `Processed ${successCount}/${files.length} files, extracted ${totalTasks} action items`
      );
    }
  };

  // Handle switching to background processing
  const handleProcessInBackground = async () => {
    // Request notification permission if not already granted
    if (!canNotify) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        // Still allow background processing, just won't get notification
        console.log('Notifications not granted, continuing without');
      }
    }

    // Close modal and show skeletons
    setShowPasteModal(false);
    setProcessingInBackground(true);
  };

  const handleDrop = async (taskId, newStatus, targetIndex) => {
    // Get tasks in the target column, sorted by current order
    const columnTasks = tasks
      .filter(t => t.status === newStatus && t.id !== taskId && !t.deleted)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
      });

    // Insert at target position
    const updatedTasks = [...columnTasks];
    const movingTask = tasks.find(t => t.id === taskId);
    if (targetIndex !== undefined && targetIndex >= 0) {
      updatedTasks.splice(targetIndex, 0, { ...movingTask, status: newStatus });
    } else {
      updatedTasks.push({ ...movingTask, status: newStatus });
    }

    // Recalculate order values
    const updates = updatedTasks.map((t, idx) => ({ id: t.id, order: idx }));

    // Optimistic update
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newOrder = updates.find(u => u.id === taskId)?.order ?? t.order;
        return { ...t, status: newStatus, order: newOrder };
      }
      const orderUpdate = updates.find(u => u.id === t.id);
      if (orderUpdate) {
        return { ...t, order: orderUpdate.order };
      }
      return t;
    }));

    try {
      // Update the dragged task's status
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, order: updates.find(u => u.id === taskId)?.order })
      });

      // Bulk update order for all tasks in the column
      if (updates.length > 1) {
        await fetch('/api/tasks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reorder', updates })
        });
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handlePinTask = async (taskId, pinned) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, pinned, pinnedAt: pinned ? new Date().toISOString() : null } : t
    ));

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned })
      });
    } catch (err) {
      console.error('Failed to pin task:', err);
      fetchData();
    }
  };

  const handleDeleteTask = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setConfirmModal({
      isOpen: true,
      title: 'Delete Task',
      message: `Are you sure you want to delete this task?`,
      subMessage: task.task?.slice(0, 100) + (task.task?.length > 100 ? '...' : ''),
      confirmLabel: 'Move to Trash',
      onConfirm: async () => {
        // Optimistic update - mark as deleted
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, deleted: true, deletedAt: new Date().toISOString() } : t
        ));

        setConfirmModal({ isOpen: false });

        try {
          await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permanent: false })
          });
        } catch (err) {
          console.error('Failed to delete task:', err);
          fetchData();
        }
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    });
  };

  const handleRestoreTask = async (taskId) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, deleted: false, deletedAt: null } : t
    ));

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true })
      });
    } catch (err) {
      console.error('Failed to restore task:', err);
      fetchData();
    }
  };

  const handlePermanentDelete = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setConfirmModal({
      isOpen: true,
      title: 'Permanently Delete',
      message: 'This will permanently delete the task. This action cannot be undone.',
      subMessage: task.task?.slice(0, 100) + (task.task?.length > 100 ? '...' : ''),
      confirmLabel: 'Delete Forever',
      onConfirm: async () => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setConfirmModal({ isOpen: false });

        try {
          await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permanent: true })
          });
        } catch (err) {
          console.error('Failed to permanently delete task:', err);
          fetchData();
        }
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    });
  };

  const handleEditTask = async (taskId, updatedData) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, ...updatedData } : t
    ));

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });

      const data = await response.json();
      if (data.success) {
        // Update with server response to get activity log
        setTasks(prev => prev.map(t =>
          t.id === taskId ? data.task : t
        ));
        // Update editingTask if it's the same task
        if (editingTask?.id === taskId) {
          setEditingTask(data.task);
        }
      }
    } catch (err) {
      console.error('Failed to update task:', err);
      fetchData(); // Refresh on error
    }
  };

  const handleAddComment = async (taskId, comment) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment, user: CURRENT_USER })
      });

      const data = await response.json();
      if (data.success) {
        // Update the task in state with new comment
        setTasks(prev => prev.map(t =>
          t.id === taskId ? data.task : t
        ));
        // Update editingTask to show new comment
        if (editingTask?.id === taskId) {
          setEditingTask(data.task);
        }
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const handleAddTask = async (taskData) => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTasks(prev => [data.task, ...prev]);
      } else {
        setError(data.error || 'Failed to add task');
      }
    } catch (err) {
      console.error('Failed to add task:', err);
      setError('Failed to add task');
    }
  };

  const handleColumnDrop = async (draggedColumnId, targetColumnId) => {
    if (draggedColumnId === targetColumnId) return;
    
    // Find indices
    const draggedIndex = columns.findIndex(c => c.id === draggedColumnId);
    const targetIndex = columns.findIndex(c => c.id === targetColumnId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder columns
    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);
    
    // Update order property
    const reorderedColumns = newColumns.map((col, idx) => ({ ...col, order: idx }));
    
    // Optimistic update
    setColumns(reorderedColumns);
    
    // Save to API
    try {
      await fetch('/api/columns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: reorderedColumns })
      });
    } catch (err) {
      console.error('Failed to reorder columns:', err);
      fetchData(); // Refresh on error
    }
  };

  const handleDeleteMeeting = (meetingId, meetingTitle) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Meeting',
      message: `Are you sure you want to delete "${meetingTitle}" and all its tasks? This cannot be undone.`,
      onConfirm: async () => {
        setMeetings(prev => prev.filter(m => m.id !== meetingId));
        setTasks(prev => prev.filter(t => t.meetingId !== meetingId));
        if (selectedMeeting === meetingId) setSelectedMeeting(null);
        
        try {
          await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
        } catch (err) {
          console.error('Failed to delete meeting:', err);
          fetchData();
        }
        setConfirmModal({ isOpen: false });
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    });
  };

  const handleUpdateMeeting = async (meetingId, updates) => {
    // Optimistic update
    setMeetings(prev => prev.map(m =>
      m.id === meetingId ? { ...m, ...updates } : m
    ));

    try {
      const response = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to update meeting');
      }
    } catch (err) {
      console.error('Failed to update meeting:', err);
      fetchData(); // Revert on error
    }
  };

  const handleArchiveDone = async () => {
    const doneTasks = tasks.filter(t => t.status === 'done' && !t.archived);
    if (doneTasks.length === 0) return;
    
    setTasks(prev => prev.map(t => 
      t.status === 'done' && !t.archived 
        ? { ...t, archived: true, archivedAt: new Date().toISOString() }
        : t
    ));
    
    try {
      await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive-done' })
      });
    } catch (err) {
      console.error('Failed to archive tasks:', err);
      fetchData();
    }
  };

  const handleAddColumn = async ({ label, color }) => {
    try {
      const response = await fetch('/api/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, color })
      });
      const data = await response.json();
      if (data.success) {
        setColumns(data.columns);
      }
    } catch (err) {
      console.error('Failed to add column:', err);
    }
  };

  const handleDeleteColumn = async (columnId) => {
    const column = columns.find(c => c.id === columnId);
    setConfirmModal({
      isOpen: true,
      title: 'Delete Column',
      message: `Are you sure you want to delete "${column?.label}"? Tasks in this column will be moved to "To Do".`,
      onConfirm: async () => {
        try {
          const response = await fetch('/api/columns', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columnId })
          });
          const data = await response.json();
          if (data.success) {
            setColumns(data.columns);
            setTasks(prev => prev.map(t => 
              t.status === columnId ? { ...t, status: 'todo' } : t
            ));
          }
        } catch (err) {
          console.error('Failed to delete column:', err);
        }
        setConfirmModal({ isOpen: false });
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    });
  };

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    // Trash filter - if viewing trash, only show deleted tasks
    if (showTrash) {
      return t.deleted === true;
    }

    // Exclude deleted tasks from normal views
    if (t.deleted) return false;

    // Archived filter
    if (!showArchived && t.archived) return false;
    if (showArchived && !t.archived) return false;

    // Meeting filter
    if (selectedMeeting && t.meetingId !== selectedMeeting) return false;

    // Type/owner filters
    if (view === 'mine' && !isCurrentUser(t.owner)) return false;
    if (view === 'follow-ups' && t.type !== 'follow-up') return false;
    if (view === 'actions' && t.type !== 'action') return false;

    // Tag filter
    if (tagFilter.length > 0) {
      const taskTags = t.tags || [];
      if (!tagFilter.some(tag => taskTags.includes(tag))) {
        return false;
      }
    }

    // Due date filter
    if (dueDateFilter) {
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      switch (dueDateFilter) {
        case 'overdue':
          if (dueDate >= today || t.status === 'done') return false;
          break;
        case 'today':
          if (dueDate.getTime() !== today.getTime()) return false;
          break;
        case 'this-week':
          if (dueDate < today || dueDate > nextWeek) return false;
          break;
        case 'upcoming':
          if (dueDate < today) return false;
          break;
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const meeting = meetings.find(m => m.id === t.meetingId);

      const searchFields = [
        t.task,
        t.owner,
        t.person,
        t.context,
        meeting?.title,
        meeting?.participants?.join(' '),
        ...(t.tags || [])
      ].filter(Boolean).join(' ').toLowerCase();

      if (!searchFields.includes(query)) {
        return false;
      }
    }

    return true;
  });

  const stats = {
    total: tasks.filter(t => !t.archived && !t.deleted).length,
    mine: tasks.filter(t => isCurrentUser(t.owner) && !t.archived && !t.deleted).length,
    overdue: tasks.filter(t => new Date(t.dueDate) < new Date() && t.status !== 'done' && !t.archived && !t.deleted).length,
    archived: tasks.filter(t => t.archived && !t.deleted).length,
    trash: tasks.filter(t => t.deleted).length,
  };

  // Build column stats dynamically
  const columnStats = columns.sort((a, b) => a.order - b.order).map(col => ({
    ...col,
    count: tasks.filter(t => t.status === col.id && !t.archived && !t.deleted).length
  }));

  // Color mapping for stats display
  const statColors = {
    slate: 'text-slate-800 dark:text-neutral-200',
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    purple: 'text-purple-600 dark:text-purple-400',
    rose: 'text-rose-600 dark:text-rose-400',
    indigo: 'text-indigo-600 dark:text-orange-500',
    teal: 'text-teal-600 dark:text-teal-400',
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800 px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg md:hidden"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Meeting Actions</h1>
              <p className="text-sm text-slate-500 dark:text-neutral-400 mt-0.5 hidden md:block">Extract and track action items from your meetings</p>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-6">
            {/* Refresh with last synced */}
            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                className="p-2 text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title={lastSynced ? `Last synced: ${lastSynced.toLocaleTimeString()}` : 'Refresh'}
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
              {lastSynced && (
                <div className="text-xs text-slate-400 dark:text-neutral-500 hidden lg:block">
                  <div className="text-[10px] uppercase tracking-wide">Last Updated</div>
                  <div>{lastSynced.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                </div>
              )}
            </div>

            {/* Divider - hidden on mobile */}
            <div className="w-px h-10 bg-slate-200 dark:bg-neutral-800 hidden lg:block" />

            {/* Stats - hidden on mobile, show on lg+ */}
            <div className="hidden lg:flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600 dark:text-orange-500">{stats.mine}</div>
                <div className="text-xs text-slate-500 dark:text-neutral-400">My Tasks</div>
              </div>
              {columnStats.map(col => (
                <div key={col.id} className="text-center">
                  <div className={`text-2xl font-bold ${statColors[col.color] || 'text-slate-800 dark:text-slate-200'}`}>{col.count}</div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400">{col.label}</div>
                </div>
              ))}
              {stats.overdue > 0 && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.overdue}</div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400">Overdue</div>
                </div>
              )}
            </div>

            {/* User Menu */}
            {session && (
              <div className="relative group">
                <button
                  className="flex items-center gap-2 p-1.5 text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                  title={session.user?.email}
                >
                  {session.user?.image ? (
                    <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-orange-500/20 flex items-center justify-center text-sm font-medium text-indigo-600 dark:text-orange-500">
                      {session.user?.email?.[0].toUpperCase()}
                    </div>
                  )}
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[200px]">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="text-sm font-medium text-slate-700 dark:text-neutral-200 truncate">{session.user?.name || 'User'}</div>
                    <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">{session.user?.email}</div>
                  </div>

                  {/* Theme Options */}
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="text-xs text-slate-400 dark:text-neutral-500 mb-1.5">Theme</div>
                    <div className="flex gap-1">
                      {[
                        { id: 'light', icon: Sun },
                        { id: 'dark', icon: Moon },
                        { id: 'system', icon: Monitor },
                      ].map(option => (
                        <button
                          key={option.id}
                          onClick={() => changeTheme(option.id)}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded ${theme === option.id ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-500' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                          title={option.id.charAt(0).toUpperCase() + option.id.slice(1)}
                        >
                          <option.icon size={14} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* View Density Options */}
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="text-xs text-slate-400 dark:text-neutral-500 mb-1.5">Card Density</div>
                    <div className="flex gap-1">
                      {[
                        { id: 'compact', icon: Rows4 },
                        { id: 'normal', icon: Rows3 },
                        { id: 'spacious', icon: LayoutList },
                      ].map(option => (
                        <button
                          key={option.id}
                          onClick={() => changeViewDensity(option.id)}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded ${viewDensity === option.id ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-500' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                          title={option.id.charAt(0).toUpperCase() + option.id.slice(1)}
                        >
                          <option.icon size={14} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* What's New Link */}
                  <button
                    onClick={handleShowReleaseHistory}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 border-b border-slate-200 dark:border-neutral-800"
                  >
                    <Gift size={16} />
                    What's New
                  </button>

                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 rounded-b-lg"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex pb-5">
        {/* Mobile sidebar backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar - drawer on mobile, fixed on desktop */}
        <aside className={`
          ${sidebarCollapsed ? 'md:w-16' : 'md:w-80'}
          fixed md:relative inset-y-0 left-0 z-50 md:z-auto
          w-80
          transform ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          border-r border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950
          h-full md:h-[calc(100vh-93px)]
          transition-all duration-300 ease-in-out flex flex-col overflow-hidden
        `}>
          {sidebarCollapsed ? (
            /* Collapsed Sidebar */
            <div className="flex flex-col items-center gap-2 p-2 pt-4">
              {/* Expand button */}
              <button
                onClick={toggleSidebar}
                className="p-2 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title="Expand sidebar (⌘B)"
              >
                <PanelLeft size={20} />
              </button>

              {/* Add Meeting Button - Icon only */}
              <button
                onClick={() => setShowPasteModal(true)}
                className="w-10 h-10 flex items-center justify-center bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors"
                title="Add Meeting Transcript"
              >
                <Plus size={18} />
              </button>

              {/* Meetings count badge */}
              <button
                onClick={toggleSidebar}
                className="w-10 h-10 flex flex-col items-center justify-center text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title={`${meetings.length} meetings - Click to expand`}
              >
                <FileText size={16} />
                <span className="text-[10px] mt-0.5">{meetings.length}</span>
              </button>

              {/* Import History Button */}
              <button
                onClick={() => setShowImportHistory(true)}
                className="w-10 h-10 flex items-center justify-center text-slate-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title="Import History"
              >
                <History size={16} />
              </button>

              {/* Divider */}
              <div className="w-8 h-px bg-slate-200 dark:bg-neutral-800 my-1" />

              {/* Archive button */}
              <button
                onClick={() => {
                  setShowArchived(!showArchived);
                  if (showTrash) setShowTrash(false);
                }}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors ${showArchived ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                title={showArchived ? 'Show active tasks' : `View archived (${stats.archived})`}
              >
                <Archive size={16} />
                {stats.archived > 0 && <span className="text-[10px] mt-0.5">{stats.archived}</span>}
              </button>

              {/* Trash button */}
              <button
                onClick={() => {
                  setShowTrash(!showTrash);
                  if (showArchived) setShowArchived(false);
                }}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors ${showTrash ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                title={showTrash ? 'Back to tasks' : `View trash (${stats.trash})`}
              >
                <Trash2 size={16} />
                {stats.trash > 0 && <span className="text-[10px] mt-0.5">{stats.trash}</span>}
              </button>
            </div>
          ) : (
            /* Expanded Sidebar */
            <div className="flex-1 flex flex-col min-h-0">
              {/* Fixed Header Section */}
              <div className="px-4 pt-4 pb-2 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  {/* Mobile close button */}
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors md:hidden"
                  >
                    <X size={18} />
                  </button>
                  <h2 className="font-semibold text-slate-700 dark:text-slate-200">Meetings</h2>
                  <button
                    onClick={() => { setShowPasteModal(true); setMobileMenuOpen(false); }}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 dark:bg-orange-500 text-white rounded-md font-medium hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors"
                    title="Add Meeting Transcript"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                  <button
                    onClick={() => { setShowImportHistory(true); setMobileMenuOpen(false); }}
                    className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                    title="Import History"
                  >
                    <History size={16} />
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={toggleSidebar}
                    className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors hidden md:block"
                    title="Collapse sidebar (⌘B)"
                  >
                    <PanelLeftClose size={18} />
                  </button>
                </div>

                <button
                  onClick={() => { setSelectedMeeting(null); setMobileMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedMeeting ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium' : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                >
                  All Meetings ({meetings.length})
                </button>
              </div>

              {/* Scrollable Meetings List */}
              <div className="flex-1 overflow-y-auto px-4 min-h-0">
                {loading && meetings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                    <p className="text-sm">Loading...</p>
                  </div>
                ) : meetings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm mb-2">No meetings yet</p>
                    <p className="text-xs">Click "Add Meeting Transcript" to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2 pb-2">
                    {meetings
                      .map(meeting => {
                        const meetingTasks = tasks.filter(t => t.meetingId === meeting.id && !t.archived && !t.deleted);
                        return {
                          ...meeting,
                          taskCount: meetingTasks.length,
                          uncategorizedCount: meetingTasks.filter(t => t.status === 'uncategorized').length
                        };
                      })
                      .filter(meeting => showEmptyMeetings || meeting.taskCount > 0)
                      .map(meeting => (
                        <MeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          taskCount={meeting.taskCount}
                          isSelected={selectedMeeting === meeting.id}
                          onClick={() => { setSelectedMeeting(meeting.id === selectedMeeting ? null : meeting.id); setMobileMenuOpen(false); }}
                          onDelete={handleDeleteMeeting}
                          onEdit={setEditingMeeting}
                          onViewTranscript={setViewingTranscript}
                          isEmpty={meeting.taskCount === 0}
                          hasUncategorized={meeting.uncategorizedCount > 0}
                        />
                      ))}
                    {/* Show empty meetings toggle */}
                    {meetings.some(m => tasks.filter(t => t.meetingId === m.id && !t.archived && !t.deleted).length === 0) && (
                      <button
                        onClick={() => setShowEmptyMeetings(!showEmptyMeetings)}
                        className="w-full text-xs text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-slate-400 py-2 flex items-center justify-center gap-1"
                      >
                        {showEmptyMeetings ? (
                          <>Hide empty meetings</>
                        ) : (
                          <>Show {meetings.filter(m => tasks.filter(t => t.meetingId === m.id && !t.archived && !t.deleted).length === 0).length} empty meetings</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Fixed Bottom Section - Archive & Trash */}
              <div className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 space-y-1">
                <button
                  onClick={handleArchiveDone}
                  disabled={(columnStats.find(c => c.id === 'done')?.count || 0) === 0}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Archive size={16} />
                  Archive completed ({columnStats.find(c => c.id === 'done')?.count || 0})
                </button>
                <button
                  onClick={() => {
                    setShowArchived(!showArchived);
                    if (showTrash) setShowTrash(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg ${showArchived ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                >
                  <FileText size={16} />
                  {showArchived ? 'Show active tasks' : `View archived${stats.archived > 0 ? ` (${stats.archived})` : ''}`}
                </button>
                <button
                  onClick={() => {
                    setShowTrash(!showTrash);
                    if (showArchived) setShowArchived(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg ${showTrash ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                >
                  <Trash2 size={16} />
                  {showTrash ? 'Back to tasks' : `View trash${stats.trash > 0 ? ` (${stats.trash})` : ''}`}
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-3 md:p-6 overflow-x-auto h-[calc(100vh-73px)] md:h-[calc(100vh-93px)] flex flex-col">
          {/* Filters - Compact single row with dropdowns */}
          <div className="flex items-center justify-between gap-2 md:gap-4 mb-4 md:mb-6">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                resultCount={filteredTasks.length}
              />

              {/* Mobile filter button */}
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="flex md:hidden items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800"
              >
                <SlidersHorizontal size={16} />
                Filters
                {(tagFilter.length > 0 || dueDateFilter || view !== 'all') && (
                  <span className="w-5 h-5 rounded-full bg-indigo-600 dark:bg-orange-500 text-white text-xs flex items-center justify-center">
                    {(tagFilter.length > 0 ? 1 : 0) + (dueDateFilter ? 1 : 0) + (view !== 'all' ? 1 : 0)}
                  </span>
                )}
              </button>

              {/* Desktop filters */}
              <div className="hidden md:contents">
                <div className="w-px h-6 bg-slate-200 dark:bg-neutral-800" />

                {/* View Dropdown */}
                <FilterDropdown
                  label={view === 'all' ? 'View' : view === 'mine' ? 'My Tasks' : view === 'actions' ? 'Actions' : 'Follow-ups'}
                  options={[
                    { id: 'all', label: 'All Items', count: filteredTasks.length },
                    { id: 'mine', label: 'My Tasks', count: stats.mine },
                    { id: 'actions', label: 'Actions' },
                    { id: 'follow-ups', label: 'Follow-ups' },
                  ]}
                  value={view}
                  onChange={setView}
                />

                {/* Due Date Dropdown */}
                <FilterDropdown
                  label={dueDateFilter ? dueDateFilter === 'overdue' ? 'Overdue' : dueDateFilter === 'today' ? 'Today' : dueDateFilter === 'this-week' ? 'This Week' : 'Upcoming' : 'Due'}
                  icon={Clock}
                  options={[
                    { id: null, label: 'Any time' },
                    { id: 'overdue', label: 'Overdue', color: 'text-rose-500' },
                    { id: 'today', label: 'Due Today', color: 'text-amber-500' },
                    { id: 'this-week', label: 'This Week', color: 'text-blue-500' },
                    { id: 'upcoming', label: 'Upcoming' },
                  ]}
                  value={dueDateFilter}
                  onChange={setDueDateFilter}
                />

                {/* Tags Dropdown */}
                <FilterDropdown
                  label="Tags"
                  icon={Tag}
                  badge={tagFilter.length > 0 ? tagFilter.length : null}
                  options={PREDEFINED_TAGS.map(tag => ({
                    id: tag,
                    label: `#${tag}`,
                  }))}
                  value={tagFilter}
                  onChange={setTagFilter}
                  multiple
                />
              </div>

              {/* Active Filters as Chips - hidden on mobile */}
              {(searchQuery || selectedMeeting || showArchived || tagFilter.length > 0 || dueDateFilter || view !== 'all') && (
                <div className="hidden md:contents">
                  <div className="w-px h-6 bg-slate-200 dark:bg-neutral-800" />

                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-2 py-1 rounded-full text-xs bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium flex items-center gap-1"
                    >
                      "{searchQuery.slice(0, 12)}{searchQuery.length > 12 ? '...' : ''}"
                      <X size={12} />
                    </button>
                  )}

                  {selectedMeeting && (
                    <button
                      onClick={() => setSelectedMeeting(null)}
                      className="px-2 py-1 rounded-full text-xs bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1"
                    >
                      <FileText size={10} />
                      {meetings.find(m => m.id === selectedMeeting)?.title?.slice(0, 15)}...
                      <X size={12} />
                    </button>
                  )}

                  {showArchived && (
                    <span className="px-2 py-1 rounded-full text-xs bg-slate-200 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 font-medium flex items-center gap-1">
                      <Archive size={10} />
                      Archived
                    </span>
                  )}

                  {/* Clear all filters button */}
                  {(tagFilter.length > 0 || dueDateFilter || view !== 'all' || searchQuery || selectedMeeting) && (
                    <button
                      onClick={() => {
                        setView('all');
                        setDueDateFilter(null);
                        setTagFilter([]);
                        setSearchQuery('');
                        setSelectedMeeting(null);
                      }}
                      className="px-2 py-1 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowAskAI(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-orange-500 dark:to-amber-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 dark:hover:from-orange-600 dark:hover:to-amber-600 transition-all shadow-sm whitespace-nowrap"
            >
              <Bot size={16} />
              <span className="hidden sm:inline">Ask AI</span>
            </button>

            <button
              onClick={() => setShowColumnModal(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus size={16} />
              Add Column
            </button>
          </div>

          {/* Kanban Board */}
          <div className="flex gap-3 md:gap-4 flex-1 min-h-0 overflow-x-auto snap-x snap-mandatory md:snap-none pb-2 -mx-3 px-3 md:mx-0 md:px-0">
            {columns.sort((a, b) => a.order - b.order).map(column => (
              <div key={column.id} className="relative group snap-start w-[85vw] md:w-auto">
                <Column
                  column={column}
                  tasks={filteredTasks}
                  meetings={meetings}
                  onDrop={handleDrop}
                  onDeleteTask={handleDeleteTask}
                  onEditTask={(task) => setEditingTask(task)}
                  onAddTask={(columnId) => setAddingToColumn(columnId)}
                  onColumnDragStart={(columnId) => setDraggingColumn(columnId)}
                  onColumnDragEnd={() => setDraggingColumn(null)}
                  onColumnDrop={handleColumnDrop}
                  isDraggingColumn={draggingColumn === column.id}
                  showSkeletons={processingInBackground}
                  isTrashView={showTrash}
                  onRestoreTask={handleRestoreTask}
                  onPermanentDelete={handlePermanentDelete}
                  onPinTask={handlePinTask}
                  viewDensity={viewDensity}
                />
                {/* Delete column button for custom columns */}
                {column.custom && (
                  <button
                    onClick={() => handleDeleteColumn(column.id)}
                    className="absolute top-2 right-2 p-1 text-slate-400 dark:text-neutral-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete column"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-700 dark:text-rose-400 text-sm">
              {error}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <PasteModal
        isOpen={showPasteModal}
        onClose={() => setShowPasteModal(false)}
        onSubmit={handlePasteSubmit}
        onBulkSubmit={handleBulkSubmit}
        isProcessing={isProcessing}
        onProcessInBackground={handleProcessInBackground}
        canNotify={canNotify}
        meetings={meetings}
      />
      
      <AddColumnModal
        isOpen={showColumnModal}
        onClose={() => setShowColumnModal(false)}
        onSubmit={handleAddColumn}
      />
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />
      
      <EditTaskModal
        isOpen={!!editingTask}
        task={editingTask}
        columns={columns}
        onClose={() => setEditingTask(null)}
        onSave={handleEditTask}
        onAddComment={handleAddComment}
        githubStatus={githubStatus}
        onRefreshGithubStatus={fetchGithubStatus}
      />

      <EditMeetingModal
        isOpen={!!editingMeeting}
        meeting={editingMeeting}
        onClose={() => setEditingMeeting(null)}
        onSave={handleUpdateMeeting}
      />

      <TranscriptModal
        isOpen={!!viewingTranscript}
        meeting={viewingTranscript}
        onClose={() => setViewingTranscript(null)}
      />

      <ImportHistoryModal
        isOpen={showImportHistory}
        onClose={() => setShowImportHistory(false)}
        meetings={meetings}
        onSelectMeeting={(meetingId) => {
          setSelectedMeeting(meetingId);
          setMobileMenuOpen(false);
        }}
      />

      <AddTaskModal
        isOpen={!!addingToColumn}
        columnId={addingToColumn}
        columns={columns}
        onClose={() => setAddingToColumn(null)}
        onSave={handleAddTask}
      />

      {/* Mobile Filter Sheet */}
      <MobileFilterSheet
        isOpen={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        view={view}
        setView={setView}
        dueDateFilter={dueDateFilter}
        setDueDateFilter={setDueDateFilter}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        stats={stats}
      />

      {/* What's New Modal */}
      <WhatsNewModal
        isOpen={showWhatsNew}
        onClose={handleWhatsNewDismiss}
        features={newFeatures}
        showAll={showAllFeatures}
      />

      {/* AI Assistant Modal */}
      <AskAIModal
        isOpen={showAskAI}
        onClose={() => setShowAskAI(false)}
        onEditTask={(task) => setEditingTask(task)}
        tasks={tasks}
        meetings={meetings}
      />
    </div>
  );
}
