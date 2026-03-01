import { useState, useCallback } from 'react';
import { Check, SkipForward, Trash2, LayoutGrid } from 'lucide-react';
import MobileTaskCard from './MobileTaskCard';

export default function MobileTriage({ tasks, columns, meetings, onAssign, onDelete, onViewBoard, onEditTask }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animatingOut, setAnimatingOut] = useState(null); // 'left' | 'right' | 'up' | null
  const [skippedIds, setSkippedIds] = useState(new Set());

  // Filter out skipped tasks for the current session
  const triageTasks = tasks.filter(t => !skippedIds.has(t.id));
  const safeIndex = Math.min(currentIndex, Math.max(triageTasks.length - 1, 0));
  const currentTask = triageTasks[safeIndex] || null;
  const totalRemaining = triageTasks.length;

  // Destination columns (all columns except uncategorized)
  const destinationColumns = columns
    .filter(c => c.id !== 'uncategorized')
    .sort((a, b) => a.order - b.order);

  const animateAndAdvance = useCallback((direction, callback) => {
    setAnimatingOut(direction);
    setTimeout(() => {
      callback();
      setAnimatingOut(null);
    }, 300);
  }, []);

  const handleAssign = useCallback((columnId) => {
    if (!currentTask) return;
    const taskId = currentTask.id;
    animateAndAdvance('right', () => {
      onAssign(taskId, columnId);
      setCurrentIndex(prev => {
        const newLength = triageTasks.length - 1;
        return prev >= newLength ? 0 : prev;
      });
    });
  }, [currentTask, triageTasks.length, onAssign, animateAndAdvance]);

  const handleSkip = useCallback(() => {
    if (!currentTask) return;
    animateAndAdvance('up', () => {
      setSkippedIds(prev => new Set([...prev, currentTask.id]));
      setCurrentIndex(prev => {
        const newLength = triageTasks.length - 1;
        return prev >= newLength ? 0 : prev;
      });
    });
  }, [currentTask, triageTasks.length, animateAndAdvance]);

  const handleDelete = useCallback(() => {
    if (!currentTask) return;
    const taskId = currentTask.id;
    animateAndAdvance('left', () => {
      onDelete(taskId);
      setCurrentIndex(prev => {
        const newLength = triageTasks.length - 1;
        return prev >= newLength ? 0 : prev;
      });
    });
  }, [currentTask, triageTasks.length, onDelete, animateAndAdvance]);

  const handleSetPriority = useCallback((priority) => {
    if (!currentTask || currentTask.priority === priority) return;
    // Update priority immediately for better UX
    onEditTask({ ...currentTask, priority });
  }, [currentTask, onEditTask]);

  const getColumnButtonColor = (color) => {
    const lightColors = {
      slate: 'bg-slate-100 text-slate-700 border-slate-300',
      blue: 'bg-blue-50 text-blue-700 border-blue-300',
      amber: 'bg-amber-50 text-amber-700 border-amber-300',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-300',
      purple: 'bg-purple-50 text-purple-700 border-purple-300',
      rose: 'bg-rose-50 text-rose-700 border-rose-300',
      indigo: 'bg-indigo-50 text-indigo-700 border-indigo-300',
      teal: 'bg-teal-50 text-teal-700 border-teal-300',
    };
    return lightColors[color] || lightColors.slate;
  };

  const getDarkColumnButtonColor = (color) => {
    const darkColors = {
      slate: 'dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
      blue: 'dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700',
      amber: 'dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700',
      emerald: 'dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700',
      purple: 'dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700',
      rose: 'dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-700',
      indigo: 'dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700',
      teal: 'dark:bg-teal-900/50 dark:text-teal-300 dark:border-teal-700',
    };
    return darkColors[color] || darkColors.slate;
  };

  // Empty state: all caught up
  if (totalRemaining === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
          <Check size={32} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">All caught up!</h2>
        <p className="text-slate-500 dark:text-neutral-400 mb-6">No uncategorized tasks to triage.</p>
        <button
          onClick={onViewBoard}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 dark:bg-orange-500 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform"
        >
          <LayoutGrid size={16} />
          View Board
        </button>
      </div>
    );
  }

  const meeting = currentTask?.meetingId
    ? meetings.find(m => m.id === currentTask.meetingId)
    : null;

  const cardTransform = animatingOut === 'right'
    ? 'translate-x-full opacity-0'
    : animatingOut === 'left'
    ? '-translate-x-full opacity-0'
    : animatingOut === 'up'
    ? '-translate-y-full opacity-0'
    : 'translate-x-0 opacity-100';

  return (
    <div className="flex flex-col h-full px-4 pt-3 pb-4 overflow-y-auto">
      {/* Header — compact single row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Triage</h2>
          <span className="text-xs text-slate-500 dark:text-neutral-400">
            {safeIndex + 1}/{totalRemaining}
          </span>
        </div>
        <button
          onClick={onViewBoard}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
        >
          <LayoutGrid size={14} />
          Board
        </button>
      </div>

      {/* Card area — no flex-1, natural height */}
      <div className="overflow-hidden">
        <div
          className={`w-full transition-all duration-300 ease-out ${cardTransform}`}
        >
          <MobileTaskCard task={currentTask} meeting={meeting} large onTap={() => onEditTask?.(currentTask)} />
        </div>
      </div>

      {/* Move to — column buttons in a tight grid */}
      <div className="mt-3">
        <p className="text-xs text-slate-400 dark:text-neutral-500 mb-2 text-center">Move to</p>
        <div className="grid grid-cols-3 gap-1.5">
          {destinationColumns.map(col => (
            <button
              key={col.id}
              onClick={() => handleAssign(col.id)}
              className={`px-2 py-2 rounded-lg text-xs font-medium border active:scale-95 transition-all text-center ${getColumnButtonColor(col.color)} ${getDarkColumnButtonColor(col.color)}`}
            >
              {col.label}
            </button>
          ))}
        </div>
      </div>

      {/* Skip + Delete — inline row */}
      <div className="flex items-center justify-center gap-6 mt-3">
        <button
          onClick={handleSkip}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 transition-colors"
        >
          <SkipForward size={14} />
          Skip
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}
