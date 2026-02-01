// lib/features.js
// Central configuration for features and version tracking

// Current app version - increment when adding new features
export const APP_VERSION = 3;

// Whether to show the What's New modal to first-time users (serves as onboarding)
export const SHOW_TO_NEW_USERS = true;

// Feature list with version info
// Add new features at the top with the current APP_VERSION
export const FEATURES = [
  {
    version: 3,
    title: 'Smart AI Extraction',
    description: 'Improved AI that handles multiple content types - meeting transcripts, emails, chat logs, and more.',
    icon: 'Sparkles'
  },
  {
    version: 2,
    title: 'Mobile Responsive',
    description: 'Full support for phone browsers with bottom sheet modals and touch-friendly navigation.',
    icon: 'Smartphone'
  },
  {
    version: 1,
    title: 'Import History',
    description: 'Quickly find and jump to any previously imported meeting with the new history modal.',
    icon: 'History'
  }
];

// Get features newer than the given version
export function getNewFeatures(lastSeenVersion) {
  if (lastSeenVersion === null || lastSeenVersion === undefined) {
    // First-time user - return all features if SHOW_TO_NEW_USERS is true
    return SHOW_TO_NEW_USERS ? FEATURES : [];
  }
  return FEATURES.filter(feature => feature.version > lastSeenVersion);
}

// Check if there are new features since the given version
export function hasNewFeatures(lastSeenVersion) {
  return getNewFeatures(lastSeenVersion).length > 0;
}
