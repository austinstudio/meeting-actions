# Claude Code Instructions

## After Implementing New Features

When implementing a new user-facing feature, **always update the What's New modal** so users are informed of the change.

### Steps

1. **Ask the user about release type** before making version changes:
   > "Should this be a **major** (x.0), **minor** (1.x), or **patch** (no What's New entry) release?"

   - **Major (x.0)**: Significant new functionality, major UI overhauls, or breaking changes
   - **Minor (1.x)**: Small features, improvements, new options (most common)
   - **Patch**: Bug fixes, internal refactors, minor tweaks (skip What's New entry)

2. **Increment the version** in `/lib/features.js`:
   ```javascript
   // For minor release (1.5 -> 1.6):
   export const APP_VERSION = 1.6;

   // For major release (1.6 -> 2.0):
   export const APP_VERSION = 2.0;
   ```

3. **Add a feature entry** at the top of the `FEATURES` array in `/lib/features.js`:
   ```javascript
   {
     version: 1.6,  // Match the new APP_VERSION
     title: 'Feature Name',  // Short, clear title
     description: 'What it does and why users will find it useful.',
     icon: 'IconName',  // See available icons below
     releaseDate: '2026-02-01'  // Today's date in YYYY-MM-DD format
   }
   ```

4. **If using a new icon**, add it to:
   - The import statement in `/pages/index.js` (from `lucide-react`)
   - The `FEATURE_ICONS` mapping in `/pages/index.js`

### Available Icons

Currently mapped icons: `Sparkles`, `Smartphone`, `History`, `Gift`, `Users`

To add more, update the `FEATURE_ICONS` object in `/pages/index.js`.

### What Counts as Each Release Type

**Major (x.0)** - Update What's New:
- Major new functionality (e.g., adding a whole new section)
- Significant UI redesigns
- Breaking changes to user workflows

**Minor (1.x)** - Update What's New:
- New features users can interact with
- Significant UI/UX improvements
- New integrations or capabilities

**Patch** - Skip What's New:
- Bug fixes
- Internal refactors
- Performance improvements (unless dramatic)
- Minor styling tweaks
