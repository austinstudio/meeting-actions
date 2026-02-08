export const DEFAULT_COLUMNS = [
  { id: 'uncategorized', label: 'Uncategorized', color: 'purple', order: 0 },
  { id: 'todo', label: 'To Do', color: 'slate', order: 1 },
  { id: 'in-progress', label: 'In Progress', color: 'blue', order: 2 },
  { id: 'waiting', label: 'Waiting On Others', color: 'amber', order: 3 },
  { id: 'done', label: 'Done', color: 'emerald', order: 4 },
];

export const COLUMN_COLORS = {
  slate: { bg: 'bg-slate-100', accent: 'border-slate-300', badge: 'bg-slate-200' },
  blue: { bg: 'bg-blue-50', accent: 'border-blue-300', badge: 'bg-blue-100' },
  amber: { bg: 'bg-amber-50', accent: 'border-amber-300', badge: 'bg-amber-100' },
  emerald: { bg: 'bg-emerald-50', accent: 'border-emerald-300', badge: 'bg-emerald-100' },
  purple: { bg: 'bg-purple-50', accent: 'border-purple-300', badge: 'bg-purple-100' },
  rose: { bg: 'bg-rose-50', accent: 'border-rose-300', badge: 'bg-rose-100' },
  indigo: { bg: 'bg-indigo-50', accent: 'border-indigo-300', badge: 'bg-indigo-100' },
  teal: { bg: 'bg-teal-50', accent: 'border-teal-300', badge: 'bg-teal-100' },
};

export const priorityColors = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400',
};

export const TAG_COLORS = {
  urgent: { bg: 'bg-rose-100 dark:bg-rose-500/20', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-500/30' },
  client: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/30' },
  bug: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-500/30' },
  feature: { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-500/30' },
  review: { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/30' },
  design: { bg: 'bg-teal-100 dark:bg-teal-500/20', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-200 dark:border-teal-500/30' },
  default: { bg: 'bg-slate-100 dark:bg-neutral-800', text: 'text-slate-600 dark:text-neutral-300', border: 'border-slate-200 dark:border-neutral-700' },
};

export const PREDEFINED_TAGS = ['urgent', 'client', 'bug', 'feature', 'review', 'design'];

export const isCurrentUser = (name, currentUser) => {
  if (!name || !currentUser) return false;
  const normalized = name.toLowerCase().trim();
  return normalized === 'me' || normalized === currentUser.toLowerCase();
};
