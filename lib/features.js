// lib/features.js
// Central configuration for features and version tracking

// Current app version - use semantic versioning (major.minor)
// Major: significant new functionality or breaking changes (2.0, 3.0)
// Minor: small features and improvements (1.1, 1.2, 1.3)
export const APP_VERSION = 4.0;

// Whether to show the What's New modal to first-time users (serves as onboarding)
export const SHOW_TO_NEW_USERS = true;

// Feature list with version info
// Add new features at the top with the current APP_VERSION
export const FEATURES = [
  {
    version: 4.0,
    title: 'Smart AI Suggestions',
    description: 'A floating suggestions bar that analyzes your tasks and surfaces overdue reminders, priority picks, and follow-up nudges — powered by AI.',
    icon: 'Sparkles',
    releaseDate: '2026-02-08'
  },
  {
    version: 3.0,
    title: 'GitHub Integration',
    description: 'Create GitHub issues directly from tasks. Mark tasks as Enhancement or Bug, then link them to your repository with one click.',
    icon: 'Github',
    releaseDate: '2026-02-03'
  },
  {
    version: 2.1,
    title: 'AI Task Cards',
    description: 'AI responses now display tasks as interactive cards. Click any task to view or edit it directly.',
    icon: 'Bot',
    releaseDate: '2026-02-01'
  },
  {
    version: 2.0,
    title: 'AI Assistant',
    description: 'Ask questions about your tasks and meetings. Get summaries, find overdue items, and receive prioritization suggestions.',
    icon: 'Bot',
    releaseDate: '2026-02-01'
  },
  {
    version: 1.5,
    title: 'Release History',
    description: 'View all past features and updates from the user menu. See what\'s changed in each version.',
    icon: 'History',
    releaseDate: '2026-02-01'
  },
  {
    version: 1.4,
    title: 'Account Switching',
    description: 'Easily switch between Google accounts on the redesigned login page, now with dark mode support.',
    icon: 'Users',
    releaseDate: '2026-02-01'
  },
  {
    version: 1.3,
    title: 'Smart AI Extraction',
    description: 'Improved AI that handles multiple content types - meeting transcripts, emails, chat logs, and more.',
    icon: 'Sparkles',
    releaseDate: '2026-01-28'
  },
  {
    version: 1.2,
    title: 'Mobile Responsive',
    description: 'Full support for phone browsers with bottom sheet modals and touch-friendly navigation.',
    icon: 'Smartphone',
    releaseDate: '2026-01-25'
  },
  {
    version: 1.1,
    title: 'Import History',
    description: 'Quickly find and jump to any previously imported meeting with the new history modal.',
    icon: 'History',
    releaseDate: '2026-01-20'
  },
  {
    version: 1.0,
    title: 'Initial Release',
    description: 'AI-powered meeting transcript processing, Kanban board with drag-and-drop, task management with priorities and due dates, dark mode support, and file upload for PDFs and text files.',
    icon: 'Sparkles',
    releaseDate: '2026-01-15'
  }
];

// Get all features (for viewing full history)
export function getAllFeatures() {
  return FEATURES;
}

// Get features newer than the given version
export function getNewFeatures(lastSeenVersion) {
  if (lastSeenVersion === null || lastSeenVersion === undefined) {
    // First-time user - return all features if SHOW_TO_NEW_USERS is true
    return SHOW_TO_NEW_USERS ? FEATURES : [];
  }

  // Handle migration from old integer versioning (1, 2, 3, 4, 5) to semantic versioning (1.0, 1.1, etc.)
  // If lastSeenVersion is greater than APP_VERSION, it's from the old system - show features from 2.0+
  if (lastSeenVersion > APP_VERSION) {
    return FEATURES.filter(feature => feature.version >= 2.0);
  }

  return FEATURES.filter(feature => feature.version > lastSeenVersion);
}

// Check if there are new features since the given version
export function hasNewFeatures(lastSeenVersion) {
  return getNewFeatures(lastSeenVersion).length > 0;
}
