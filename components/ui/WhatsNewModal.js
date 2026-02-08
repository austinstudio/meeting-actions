import React from 'react';
import { X, Calendar, Sparkles, Smartphone, History, Gift, Users, Bot, Github } from 'lucide-react';

const FEATURE_ICONS = {
  Sparkles: Sparkles,
  Smartphone: Smartphone,
  History: History,
  Gift: Gift,
  Users: Users,
  Bot: Bot,
  Github: Github
};

export default function WhatsNewModal({ isOpen, onClose, features, showAll = false }) {
  if (!isOpen || !features || features.length === 0) return null;

  const latestVersion = Math.max(...features.map(f => f.version));

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-md max-h-[80vh] md:max-h-[70vh] flex flex-col border border-transparent dark:border-neutral-700">
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
