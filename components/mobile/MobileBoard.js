import { useState, useRef, useEffect } from 'react';
import { Inbox } from 'lucide-react';
import MobileTaskCard from './MobileTaskCard';

export default function MobileBoard({ tasks, columns, meetings, onEditTask, onViewTriage, unfiledCount }) {
  const [activeColumnId, setActiveColumnId] = useState(() => columns[0]?.id || 'uncategorized');
  const tabsRef = useRef(null);
  const activeTabRef = useRef(null);

  // Scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && tabsRef.current) {
      const tab = activeTabRef.current;
      const container = tabsRef.current;
      const tabLeft = tab.offsetLeft;
      const tabWidth = tab.offsetWidth;
      const containerWidth = container.offsetWidth;
      const scrollLeft = container.scrollLeft;

      if (tabLeft < scrollLeft) {
        container.scrollTo({ left: tabLeft - 16, behavior: 'smooth' });
      } else if (tabLeft + tabWidth > scrollLeft + containerWidth) {
        container.scrollTo({ left: tabLeft + tabWidth - containerWidth + 16, behavior: 'smooth' });
      }
    }
  }, [activeColumnId]);

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  const columnTasks = tasks
    .filter(t => t.status === activeColumnId && !t.deleted && !t.archived)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
    });

  const getTabColor = (color, isActive) => {
    if (!isActive) return 'text-slate-500 dark:text-neutral-400';
    const map = {
      slate: 'text-slate-700 dark:text-slate-200 border-slate-500 dark:border-slate-400',
      blue: 'text-blue-700 dark:text-blue-300 border-blue-500 dark:border-blue-400',
      amber: 'text-amber-700 dark:text-amber-300 border-amber-500 dark:border-amber-400',
      emerald: 'text-emerald-700 dark:text-emerald-300 border-emerald-500 dark:border-emerald-400',
      purple: 'text-purple-700 dark:text-purple-300 border-purple-500 dark:border-purple-400',
      rose: 'text-rose-700 dark:text-rose-300 border-rose-500 dark:border-rose-400',
      indigo: 'text-indigo-700 dark:text-indigo-300 border-indigo-500 dark:border-indigo-400',
      teal: 'text-teal-700 dark:text-teal-300 border-teal-500 dark:border-teal-400',
    };
    return map[color] || map.slate;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Triage banner (if unfiled tasks exist) */}
      {unfiledCount > 0 && (
        <button
          onClick={onViewTriage}
          className="flex items-center justify-between mx-3 mt-3 px-4 py-2.5 bg-indigo-50 dark:bg-orange-900/20 border border-indigo-200 dark:border-orange-800 rounded-xl text-sm active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center gap-2">
            <Inbox size={16} className="text-indigo-600 dark:text-orange-400" />
            <span className="font-medium text-indigo-700 dark:text-orange-300">{unfiledCount} tasks to triage</span>
          </span>
          <span className="text-indigo-500 dark:text-orange-400">&rarr;</span>
        </button>
      )}

      {/* Column tabs */}
      {/* Column tabs — wrap on mobile so all are visible */}
      <div
        ref={tabsRef}
        className="flex flex-wrap gap-1.5 px-3 pt-3 pb-1"
      >
        {sortedColumns.map(col => {
          const isActive = col.id === activeColumnId;
          const count = tasks.filter(t => t.status === col.id && !t.deleted && !t.archived).length;
          return (
            <button
              key={col.id}
              ref={isActive ? activeTabRef : null}
              onClick={() => setActiveColumnId(col.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                isActive
                  ? `bg-white dark:bg-neutral-800 shadow-sm border border-slate-200 dark:border-neutral-700 ${getTabColor(col.color, true)}`
                  : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'
              }`}
            >
              {col.label}
              <span className={`ml-1 text-xs ${isActive ? 'opacity-70' : 'opacity-50'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-2">
        {columnTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-slate-400 dark:text-neutral-500 text-sm">No tasks in this column</p>
          </div>
        ) : (
          columnTasks.map(task => {
            const meeting = task.meetingId ? meetings.find(m => m.id === task.meetingId) : null;
            return (
              <MobileTaskCard
                key={task.id}
                task={task}
                meeting={meeting}
                onTap={() => onEditTask?.(task)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
