// lib/contact-utils.js
// Shared utilities for contact management

// Check if a contact matches a given name (case-insensitive exact match against name + aliases)
export function contactMatchesName(contact, nameToMatch) {
  if (!contact || !nameToMatch) return false;
  const normalized = nameToMatch.toLowerCase().trim();
  if (contact.name.toLowerCase().trim() === normalized) return true;
  if (Array.isArray(contact.aliases)) {
    return contact.aliases.some(alias => alias.toLowerCase().trim() === normalized);
  }
  return false;
}

// Format a timestamp into a relative or short date string
export function formatContactTimestamp(timestamp) {
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
}

// Render note text with @mention highlighting (returns React elements)
export function renderNoteText(text, React) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return React.createElement('span', {
        key: i,
        className: 'text-indigo-600 dark:text-orange-500 font-medium bg-indigo-50 dark:bg-orange-500/10 px-1 rounded'
      }, part);
    }
    return part;
  });
}

// Get a human-readable description for a contact activity entry
export function getContactActivityDescription(activity) {
  const fieldLabels = {
    name: 'name',
    email: 'email',
    phone: 'phone',
    company: 'company',
    role: 'role',
    team: 'team',
    linkedInUrl: 'LinkedIn URL',
    aliases: 'aliases',
    tags: 'tags',
    projects: 'projects',
    howWeMet: 'how we met',
    relationshipContext: 'relationship context'
  };

  if (activity.type === 'create') return 'created this contact';
  if (activity.type === 'note') return 'added a note';
  if (activity.type === 'delete') return activity.newValue || 'deleted this contact';

  const fieldLabel = fieldLabels[activity.field] || activity.field;

  if (activity.oldValue && activity.newValue) {
    return `changed ${fieldLabel} from "${activity.oldValue}" to "${activity.newValue}"`;
  }
  if (activity.newValue) {
    return `set ${fieldLabel} to "${activity.newValue}"`;
  }
  if (activity.oldValue) {
    return `cleared ${fieldLabel}`;
  }
  return `updated ${fieldLabel}`;
}

// Generate avatar initials from a name
export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Normalize aliases from string or array input
export function normalizeAliases(aliases) {
  if (Array.isArray(aliases)) {
    return aliases.map(a => a.trim()).filter(Boolean);
  }
  if (typeof aliases === 'string') {
    return aliases.split(',').map(a => a.trim()).filter(Boolean);
  }
  return [];
}

// Normalize tags/projects from string or array input
export function normalizeStringArray(input) {
  if (Array.isArray(input)) {
    return input.map(a => a.trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(',').map(a => a.trim()).filter(Boolean);
  }
  return [];
}
