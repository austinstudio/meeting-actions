import React, { useState } from 'react';
import { Plus, ArrowUpDown } from 'lucide-react';
import { COLUMN_COLORS } from '../constants';
import TaskCard from './TaskCard';

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

export default function Column({ column, tasks, meetings, onDrop, onDeleteTask, onEditTask, onAddTask, onColumnDragStart, onColumnDragEnd, onColumnDragOver, onColumnDrop, isDraggingColumn, showSkeletons, isTrashView, onRestoreTask, onPermanentDelete, onPinTask, viewDensity, onSortColumn, currentUser }) {
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

  const columnTasks = tasks
    .filter(t => t.status === column.id)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
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
                onSortColumn(column.id);
              }}
              className="p-1 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white/50 dark:hover:bg-neutral-800/50 rounded transition-colors"
              title="Sort tasks in this column"
            >
              <ArrowUpDown size={16} />
            </button>
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
              currentUser={currentUser}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
