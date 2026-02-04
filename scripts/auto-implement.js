#!/usr/bin/env node

/**
 * Auto-implement script for GitHub Actions
 * Reads an issue and uses Claude via AWS Bedrock to generate code changes
 */

const AnthropicBedrock = require('@anthropic-ai/bedrock-sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new AnthropicBedrock({
  awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_REGION || 'us-east-1',
});

// Get all JS files in a directory recursively
function getJsFiles(dir, baseDir = dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Skip node_modules, .next, .git
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...getJsFiles(fullPath, baseDir));
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json') || entry.name.endsWith('.md')) {
        files.push(relativePath);
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return files;
}

// Read file fully - no truncation for source files
function readFileSafely(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

async function main() {
  const issueNumber = process.env.ISSUE_NUMBER;
  const issueTitle = process.env.ISSUE_TITLE;
  const issueBody = process.env.ISSUE_BODY;
  const issueLabels = process.env.ISSUE_LABELS || '';

  console.log(`Processing issue #${issueNumber}: ${issueTitle}`);
  console.log(`Labels: ${issueLabels}`);

  // Determine issue type from labels
  const isEnhancement = issueLabels.includes('enhancement');
  const isBug = issueLabels.includes('bug');
  const allowDeps = issueLabels.includes('allow-deps');

  // Get project structure
  const allFiles = getJsFiles(process.cwd());
  console.log(`Found ${allFiles.length} files in project`);

  let fileContext = '';
  let totalChars = 0;
  const includedFiles = [];

  // Files to skip (not useful for code changes)
  const skipFiles = [
    'package-lock.json',
    'FEATURE_IDEAS.md',
    'README.md',
    '.env.local',
    '.env',
  ];

  // Read ALL source files fully - Claude has 200k token context
  for (const file of allFiles) {
    // Skip non-essential files
    if (skipFiles.some(skip => file.endsWith(skip))) continue;
    if (file.includes('node_modules')) continue;

    const content = readFileSafely(file);
    if (content) {
      fileContext += `### ${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      totalChars += content.length;
      includedFiles.push(file);
    }
  }

  console.log(`Including ${includedFiles.length} files in context: ${includedFiles.join(', ')}`);

  // Also provide file listing for reference
  const fileListStr = allFiles.join('\n');

  const systemPrompt = `You are an expert software engineer working on a Next.js application called "Meeting Actions".
Your task is to implement changes based on GitHub issues.

## CRITICAL RULES - READ CAREFULLY:

1. **ALWAYS EDIT EXISTING FILES** - Do NOT create new files unless absolutely necessary. The codebase already has established patterns. Find where similar code exists and modify it there.

2. **AVOID MODIFYING package.json** - Only add dependencies if absolutely necessary AND the issue has the "allow-deps" label. Otherwise, work with what's already installed.

3. **FIND THE RIGHT LOCATION** - Before making changes, analyze where similar functionality exists in the codebase. For UI changes, look in pages/index.js which contains most components.

4. **MINIMAL CHANGES** - Make the smallest possible change to implement the feature. Don't refactor, don't "improve" other code, don't add error handling that wasn't asked for.

5. **MATCH EXISTING STYLE** - Copy the exact patterns, naming conventions, and styling classes used in the existing code.

6. **SEARCH BEFORE CREATING** - If the issue mentions a feature (like "GitHub icon" or "user menu"), search the provided code to find where it already exists.

## COMMON PATTERNS IN THIS CODEBASE:

- UI components are in pages/index.js (it's a large single-file app)
- Tooltips use the \`title\` attribute on elements
- Icons come from lucide-react (already imported)
- Tailwind CSS for styling
- The user menu is in pages/index.js around the session/user avatar area

## RESPONSE FORMAT:

Return ONLY a valid JSON object. For edits, use search/replace to specify changes (NOT full file content):

{
  "analysis": "Where I found the relevant code and what I'm changing",
  "changes": [
    {
      "file": "path/to/existing/file.js",
      "action": "edit",
      "search": "exact string to find in the file",
      "replace": "string to replace it with",
      "replace_all": false,
      "description": "what this change does"
    }
  ],
  "summary": "One sentence summary"
}

IMPORTANT for search/replace:
- The "search" string must be an EXACT match of existing code (copy it precisely, including whitespace)
- Keep search strings short but unique enough to match only once
- For multiple changes in the same file, use multiple change objects
- Include enough context in "search" to be unique (e.g., include the surrounding line or two)
- Use "replace_all": true if you want to replace ALL occurrences of a pattern (useful for consistent styling changes)

For creating NEW files (rare - prefer editing):
{
  "file": "path/to/new/file.js",
  "action": "create",
  "content": "full file content",
  "description": "what this file does"
}

If you cannot implement:
{
  "analysis": "explanation",
  "changes": [],
  "summary": "Could not auto-implement: reason"
}`;

  const userPrompt = `## Issue #${issueNumber}: ${issueTitle}

### Issue Type
${isEnhancement ? 'Enhancement' : isBug ? 'Bug Fix' : 'Task'}

### Issue Description
${issueBody}

---

## Project File Structure
\`\`\`
${fileListStr}
\`\`\`

---

## Source Code Context

${fileContext}

---

IMPORTANT REMINDERS:
- The user menu with GitHub icon is in pages/index.js - search for "Github" or "githubStatus" to find it
- DO NOT create new component files - edit pages/index.js directly
- ${allowDeps ? 'New dependencies ARE allowed for this issue (allow-deps label present)' : 'DO NOT modify package.json - no new dependencies allowed'}
- Use the \`title\` attribute for simple tooltips

Please implement the requested change by editing existing files.`;

  console.log('Calling Claude API with streaming...');

  try {
    // Use streaming for large requests (required for >10 min operations)
    let responseText = '';

    const stream = anthropic.messages.stream({
      model: 'us.anthropic.claude-opus-4-20250514-v1:0',
      max_tokens: 32000,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    stream.on('text', (text) => {
      responseText += text;
      process.stdout.write('.');
    });

    await stream.finalMessage();
    console.log('\nReceived response from Claude');

    // Parse JSON response
    let result;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response as JSON:', parseError);
      console.error('Raw response:', responseText);
      process.exit(1);
    }

    console.log('\n📋 Analysis:', result.analysis);
    console.log('📝 Summary:', result.summary);

    if (!result.changes || result.changes.length === 0) {
      console.log('\n⚠️ No changes to apply');
      process.exit(0);
    }

    // Validate changes
    let needsDepsLabel = false;
    for (const change of result.changes) {
      if (change.action === 'create') {
        console.warn(`⚠️ Warning: Attempting to create new file ${change.file}`);
      }
      if (change.file === 'package.json' || change.file === 'package-lock.json') {
        if (allowDeps) {
          console.log(`📦 Allowing package.json change (allow-deps label present)`);
        } else {
          console.error('❌ This change requires new dependencies');
          needsDepsLabel = true;
          result.changes = result.changes.filter(c => c.file !== 'package.json' && c.file !== 'package-lock.json');
        }
      }
    }

    // Write status for the workflow to read
    const status = {
      needsDepsLabel,
      analysis: result.analysis,
      summary: result.summary,
      changesApplied: result.changes.length,
    };
    fs.writeFileSync('auto-implement-status.json', JSON.stringify(status, null, 2));

    if (result.changes.length === 0) {
      console.log('\n⚠️ No valid changes to apply after filtering');
      process.exit(0);
    }

    // Apply changes
    console.log(`\n🔧 Applying ${result.changes.length} change(s)...`);

    // File cache to handle multiple edits to the same file
    const fileCache = {};
    let successCount = 0;
    let failCount = 0;

    for (const change of result.changes) {
      const filePath = path.join(process.cwd(), change.file);
      const dirPath = path.dirname(filePath);

      console.log(`  ${change.action}: ${change.file}`);
      console.log(`    └─ ${change.description}`);

      try {
        switch (change.action) {
          case 'edit':
            // Search and replace in existing file
            if (!fs.existsSync(filePath)) {
              console.error(`    ❌ File not found: ${change.file}`);
              failCount++;
              continue;
            }

            // Use cached content if available (for multiple edits to same file)
            if (!fileCache[filePath]) {
              fileCache[filePath] = fs.readFileSync(filePath, 'utf-8');
            }
            let content = fileCache[filePath];

            if (!change.search || change.replace === undefined) {
              console.error(`    ❌ Edit requires search and replace fields`);
              failCount++;
              continue;
            }

            console.log(`    Searching for: "${change.search.substring(0, 80).replace(/\n/g, '\\n')}${change.search.length > 80 ? '...' : ''}"`);

            if (!content.includes(change.search)) {
              console.error(`    ❌ Search string not found in file!`);
              console.error(`    This usually means the search string doesn't exactly match the file content.`);
              console.error(`    Search string (${change.search.length} chars):`);
              console.error(change.search);
              failCount++;
              continue;
            }

            // Count occurrences
            const occurrences = content.split(change.search).length - 1;

            let newContent;
            if (change.replace_all && occurrences > 1) {
              // Replace all occurrences
              newContent = content.split(change.search).join(change.replace);
              console.log(`    Replacing all ${occurrences} occurrences`);
            } else {
              // Replace first occurrence only
              if (occurrences > 1) {
                console.warn(`    ⚠️ Search string found ${occurrences} times, replacing first occurrence`);
              }
              newContent = content.replace(change.search, change.replace);
            }

            // Debug: Check if content actually changed
            if (newContent === content) {
              console.error(`    ❌ Replace resulted in identical content!`);
              console.error(`    Search: ${change.search.substring(0, 100)}`);
              console.error(`    Replace: ${change.replace.substring(0, 100)}`);
              failCount++;
              continue;
            }

            // Update cache and write file
            fileCache[filePath] = newContent;
            fs.writeFileSync(filePath, newContent);
            console.log(`    ✓ Applied search/replace successfully`);
            console.log(`    File size: ${content.length} -> ${newContent.length} bytes`);
            successCount++;
            break;

          case 'create':
            // Create new file
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(filePath, change.content);
            console.log(`    ✓ Created file`);
            successCount++;
            break;

          case 'delete':
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`    ✓ Deleted file`);
              successCount++;
            }
            break;

          default:
            console.warn(`    ⚠️ Unknown action: ${change.action}`);
        }
      } catch (err) {
        console.error(`    ❌ Error: ${err.message}`);
        failCount++;
      }
    }

    console.log(`\n📊 Results: ${successCount} succeeded, ${failCount} failed`);

    if (successCount === 0) {
      console.error('\n❌ No changes were applied successfully');
      process.exit(1);
    }

    if (failCount > 0) {
      console.warn(`\n⚠️ Some changes failed but ${successCount} were applied`);
    }

    console.log('\n✅ All changes applied successfully');

  } catch (error) {
    console.error('Error calling Claude API:', error);
    process.exit(1);
  }
}

main();
