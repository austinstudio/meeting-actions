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

// Read file with size limit
function readFileSafely(filePath, maxChars = 100000) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.length > maxChars) {
        return content.substring(0, maxChars) + '\n\n... [FILE TRUNCATED - ' + (content.length - maxChars) + ' more characters]';
      }
      return content;
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

// Search for relevant code patterns in files
function searchInFiles(pattern, files) {
  const matches = [];
  const regex = new RegExp(pattern, 'gi');

  for (const file of files) {
    const content = readFileSafely(file, 200000);
    if (content && regex.test(content)) {
      matches.push(file);
    }
  }

  return matches;
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

  // Get project structure
  const allFiles = getJsFiles(process.cwd());
  console.log(`Found ${allFiles.length} files in project`);

  // Extract keywords from issue for smart file selection
  const issueText = `${issueTitle} ${issueBody}`.toLowerCase();
  const keywords = issueText.match(/\b\w{4,}\b/g) || [];

  // Find files that might be relevant based on keywords
  const relevantFiles = new Set(['pages/index.js', 'CLAUDE.md']); // Always include main file

  for (const keyword of keywords) {
    const matches = searchInFiles(keyword, allFiles.slice(0, 50)); // Limit search
    matches.forEach(f => relevantFiles.add(f));
  }

  // Build file context - prioritize relevant files
  const priorityFiles = [
    'pages/index.js',  // Main app file - MUST include
    'CLAUDE.md',       // Project instructions
    'lib/features.js',
  ];

  let fileContext = '';
  let totalChars = 0;
  const maxTotalChars = 150000; // ~37k tokens
  const includedFiles = [];

  // First pass: priority files
  for (const file of priorityFiles) {
    if (totalChars >= maxTotalChars) break;
    const content = readFileSafely(file, 80000);
    if (content) {
      fileContext += `### ${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      totalChars += content.length;
      includedFiles.push(file);
    }
  }

  // Second pass: other relevant files
  for (const file of relevantFiles) {
    if (totalChars >= maxTotalChars) break;
    if (includedFiles.includes(file)) continue;
    const content = readFileSafely(file, 30000);
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

2. **NEVER MODIFY package.json** - Do not add dependencies. Work with what's already installed.

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

Return ONLY a valid JSON object:
{
  "analysis": "Where I found the relevant code and what I'm changing",
  "changes": [
    {
      "file": "path/to/existing/file.js",
      "action": "edit",
      "content": "FULL file content with changes applied",
      "description": "what this change does"
    }
  ],
  "summary": "One sentence summary"
}

For edits, you MUST return the COMPLETE file content, not just the changed parts.

If you cannot implement (unclear requirements, would require creating new files when existing code should be edited, etc.):
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
- DO NOT modify package.json
- Use the \`title\` attribute for simple tooltips

Please implement the requested change by editing existing files.`;

  console.log('Calling Claude API...');

  try {
    const response = await anthropic.messages.create({
      model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    const responseText = response.content[0].text;
    console.log('Received response from Claude');

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

    // Validate changes - reject if trying to create new files when it shouldn't
    for (const change of result.changes) {
      if (change.action === 'create') {
        console.warn(`⚠️ Warning: Attempting to create new file ${change.file}`);
      }
      if (change.file === 'package.json') {
        console.error('❌ Rejecting change to package.json');
        result.changes = result.changes.filter(c => c.file !== 'package.json');
      }
    }

    if (result.changes.length === 0) {
      console.log('\n⚠️ No valid changes to apply after filtering');
      process.exit(0);
    }

    // Apply changes
    console.log(`\n🔧 Applying ${result.changes.length} change(s)...`);

    for (const change of result.changes) {
      const filePath = path.join(process.cwd(), change.file);
      const dirPath = path.dirname(filePath);

      console.log(`  ${change.action}: ${change.file}`);
      console.log(`    └─ ${change.description}`);

      switch (change.action) {
        case 'create':
        case 'edit':
          // Ensure directory exists
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          fs.writeFileSync(filePath, change.content);
          break;

        case 'delete':
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          break;

        default:
          console.warn(`    ⚠️ Unknown action: ${change.action}`);
      }
    }

    console.log('\n✅ All changes applied successfully');

  } catch (error) {
    console.error('Error calling Claude API:', error);
    process.exit(1);
  }
}

main();
