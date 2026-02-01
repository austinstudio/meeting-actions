# Claude Code Instructions

## After Implementing New Features

When implementing a new user-facing feature, **always update the What's New modal** so users are informed of the change:

### Steps

1. **Increment the version** in `/lib/features.js`:
   ```javascript
   export const APP_VERSION = 4;  // Increment by 1
   ```

2. **Add a feature entry** at the top of the `FEATURES` array in `/lib/features.js`:
   ```javascript
   {
     version: 4,  // Match the new APP_VERSION
     title: 'Feature Name',  // Short, clear title
     description: 'What it does and why users will find it useful.',
     icon: 'IconName'  // See available icons below
   }
   ```

3. **If using a new icon**, add it to:
   - The import statement in `/pages/index.js` (from `lucide-react`)
   - The `FEATURE_ICONS` mapping in `/pages/index.js`

### Available Icons

Currently mapped icons: `Sparkles`, `Smartphone`, `History`, `Gift`

To add more, update the `FEATURE_ICONS` object in `/pages/index.js`.

### What Counts as a Feature

Update What's New for:
- New functionality users can interact with
- Significant UI/UX improvements
- New integrations or capabilities

Skip for:
- Bug fixes
- Internal refactors
- Performance improvements (unless dramatic)
- Minor styling tweaks
