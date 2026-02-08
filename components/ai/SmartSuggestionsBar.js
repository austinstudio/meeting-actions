import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ChevronUp, ChevronDown, X, AlertTriangle, Star, MessageCircle, Eye } from 'lucide-react';

const TYPE_CONFIG = {
  OVERDUE_REMINDER: {
    icon: AlertTriangle,
    label: 'Overdue',
    borderColor: 'border-l-rose-500',
    iconColor: 'text-rose-500 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/30',
  },
  PRIORITY_RECOMMENDATION: {
    icon: Star,
    label: 'Priority',
    borderColor: 'border-l-amber-500',
    iconColor: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
  },
  FOLLOW_UP_NUDGE: {
    icon: MessageCircle,
    label: 'Follow-up',
    borderColor: 'border-l-blue-500',
    iconColor: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
  },
};

export default function SmartSuggestionsBar({ tasks, meetings, loading, onEditTask }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const scrollRef = useRef(null);

  // Fetch suggestions once when tasks are loaded
  useEffect(() => {
    if (hasFetched || loading) return;

    const activeTasks = tasks.filter(t => !t.deleted && !t.archived && t.status !== 'done');
    if (activeTasks.length === 0) return;

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setHasFetched(true);

      try {
        const res = await fetch('/api/suggestions');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch (err) {
        console.error('Failed to fetch suggestions:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [tasks, loading, hasFetched]);

  const handleViewTask = (suggestion) => {
    if (!suggestion.taskIds?.length) return;

    const taskId = suggestion.taskIds[0];
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      onEditTask(task);
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    setIsDismissed(true);
  };

  // Don't render if dismissed, no suggestions, or still loading with nothing
  if (isDismissed) return null;
  if (!isLoading && suggestions.length === 0) return null;

  // Collapsed pill
  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
        <button
          onClick={() => setIsExpanded(true)}
          className="group flex items-center gap-2 px-4 py-2.5 rounded-full
            bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-orange-500 dark:to-amber-500
            text-white shadow-lg shadow-indigo-500/25 dark:shadow-orange-500/25
            hover:shadow-xl hover:shadow-indigo-500/30 dark:hover:shadow-orange-500/30
            hover:scale-105 active:scale-100 transition-all duration-200"
        >
          <Sparkles size={16} className="animate-pulse" />
          <span className="text-sm font-medium">
            {isLoading ? 'Thinking...' : 'AI Suggestions'}
          </span>
          {!isLoading && suggestions.length > 0 && (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/25 text-xs font-bold">
              {suggestions.length}
            </span>
          )}
          <ChevronUp size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    );
  }

  // Expanded bar
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pb-3 px-3 md:px-6">
      <div className="max-w-5xl mx-auto bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 shadow-xl shadow-black/10 dark:shadow-black/40">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-orange-500 dark:to-amber-500">
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-700 dark:text-neutral-200">
              Smart Suggestions
            </span>
            <span className="text-xs text-slate-400 dark:text-neutral-500">
              Powered by AI
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDismiss}
              className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              title="Dismiss"
            >
              <X size={16} />
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              title="Collapse"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>

        {/* Cards */}
        <div
          ref={scrollRef}
          className="flex gap-3 p-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        >
          {isLoading ? (
            // Skeleton cards
            <>
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="flex-shrink-0 w-64 md:w-72 rounded-lg border border-slate-100 dark:border-neutral-800 p-3 border-l-4 border-l-slate-200 dark:border-l-neutral-700 snap-start animate-pulse"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded bg-slate-200 dark:bg-neutral-700" />
                    <div className="h-3 w-16 rounded bg-slate-200 dark:bg-neutral-700" />
                  </div>
                  <div className="h-4 w-full rounded bg-slate-200 dark:bg-neutral-700 mb-2" />
                  <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-neutral-800" />
                </div>
              ))}
            </>
          ) : (
            suggestions.map((suggestion, index) => {
              const config = TYPE_CONFIG[suggestion.type] || TYPE_CONFIG.PRIORITY_RECOMMENDATION;
              const IconComponent = config.icon;

              return (
                <div
                  key={index}
                  className={`flex-shrink-0 w-64 md:w-72 rounded-lg border border-slate-100 dark:border-neutral-800 p-3 border-l-4 ${config.borderColor} ${config.bgColor} snap-start hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <IconComponent size={14} className={config.iconColor} />
                    <span className={`text-xs font-medium ${config.iconColor}`}>
                      {config.label}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium text-slate-800 dark:text-neutral-100 mb-1 line-clamp-1">
                    {suggestion.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-neutral-400 mb-2.5 line-clamp-2">
                    {suggestion.description}
                  </p>
                  {suggestion.taskIds?.length > 0 && (
                    <button
                      onClick={() => handleViewTask(suggestion)}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-orange-500 hover:text-indigo-700 dark:hover:text-orange-400 transition-colors"
                    >
                      <Eye size={12} />
                      View Task
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
