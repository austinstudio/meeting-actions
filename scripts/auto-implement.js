#!/usr/bin/env node

/**
 * Auto-implement script for GitHub Actions
 * Uses a two-pass approach with Claude to analyze and implement changes
 *
 * Pass 1: Analyze the issue and propose an approach (thinking step)
 * Pass 2: Generate the actual code changes
 */

const AnthropicBedrock = require('@anthropic-ai/bedrock-sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new AnthropicBedrock({
  awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_REGION || 'us-east-1',
});

const MODEL = 'us.anthropic.claude-opus-4-5-20251101-v1:0';

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
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json') || entry.name.endsWith('.md') || entry.name.endsWith('.css')) {
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

// Find files that import any of the given target files via ES `import`/`export
// ... from '...'` statements. Catches the "edited child, forgot parent" class
// of bug where the bot changes a component's prop signature but doesn't update
// the file that renders it.
//
// Matching is intentionally cheap (regex over the import-path tail). Index files
// and Next.js dynamic-route files are excluded as sources because their basenames
// ('index', '[id]', etc.) would over-match.
function findImporters(targetFiles, candidateFiles) {
  const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const targetSet = new Set(targetFiles);

  const targetBases = targetFiles
    .map(t => path.basename(t).replace(/\.[^.]+$/, ''))
    .filter(base => base && base.toLowerCase() !== 'index' && !base.startsWith('['));

  if (targetBases.length === 0) return [];

  const patterns = targetBases.map(base =>
    new RegExp(
      `(?:import|export)[^;\\n]*?from\\s+['"][^'"\\n]*?\\b${escapeRegex(base)}(?:\\.[a-z]+)?['"]`,
      'm'
    )
  );

  const importerSet = new Set();
  for (const candidate of candidateFiles) {
    if (targetSet.has(candidate)) continue;
    const content = readFileSafely(candidate);
    if (!content) continue;
    if (patterns.some(p => p.test(content))) {
      importerSet.add(candidate);
    }
  }

  return [...importerSet];
}

// Stream a message from Claude with extended thinking
async function streamMessage(messages, system, useThinking = true, maxTokens = 16000) {
  let responseText = '';
  let thinkingText = '';

  const options = {
    model: MODEL,
    max_tokens: maxTokens,
    messages,
    system,
  };

  // Try to enable extended thinking if supported
  // Extended thinking makes Claude reason through problems deeply
  if (useThinking) {
    try {
      options.thinking = {
        type: 'enabled',
        budget_tokens: 10000,
      };
    } catch (e) {
      console.log('Extended thinking not available, continuing without it');
    }
  }

  const stream = anthropic.messages.stream(options);

  // Capture all text from the stream
  stream.on('text', (text) => {
    responseText += text;
    process.stdout.write('.');
  });

  // Also try to capture thinking if available
  stream.on('contentBlockDelta', (event) => {
    if (event.delta?.type === 'thinking_delta') {
      thinkingText += event.delta.thinking || '';
    }
  });

  const finalMessage = await stream.finalMessage();
  console.log('');

  // If streaming didn't capture text, extract from final message
  if (!responseText && finalMessage.content) {
    for (const block of finalMessage.content) {
      if (block.type === 'text') {
        responseText += block.text;
      } else if (block.type === 'thinking') {
        thinkingText += block.thinking || '';
      }
    }
  }

  if (thinkingText) {
    console.log('\n💭 Claude\'s reasoning (summary):');
    console.log(thinkingText.substring(0, 500) + (thinkingText.length > 500 ? '...' : ''));
  }

  // Debug: show response length
  console.log(`Response length: ${responseText.length} chars`);
  if (responseText.length < 50) {
    console.log('Raw response:', responseText);
  }

  return responseText;
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

  // Files to skip (not useful for code changes)
  const skipFiles = [
    'package-lock.json',
    'FEATURE_IDEAS.md',
    'README.md',
    '.env.local',
    '.env',
  ];

  const candidateFiles = allFiles.filter(f =>
    !skipFiles.some(skip => f.endsWith(skip)) && !f.includes('node_modules')
  );
  const fileListStr = candidateFiles.join('\n');

  // ============================================================
  // PASS 0: FILE SELECTION - Pick only the files relevant to this issue
  // ============================================================
  // Without this, we'd send the entire codebase (~700KB / 175K+ tokens) on
  // every issue, which blows past the model's context limit and is wasteful.

  const selectionSystemPrompt = `You are an expert software engineer reviewing a GitHub issue for a Next.js application called "Meeting Actions". Your job is to identify which files in the codebase are most likely needed to understand and implement this change.

Guidelines:
- Pick the 5-20 files most relevant to the issue.
- Prefer files explicitly named in the issue, plus the components/pages/APIs that implement the feature or bug.
- Include closely-related shared utilities or library files when they're likely to be edited or referenced.
- Skip unrelated areas of the codebase, large docs/plans (.md files in docs/), and the auto-implement script itself.
- File paths must exactly match entries from the provided file list.

Respond with ONLY a JSON object in this format:
{
  "files": ["pages/foo.js", "components/bar/Baz.js"],
  "reasoning": "Brief explanation of why these files were selected"
}`;

  const selectionUserPrompt = `## Issue #${issueNumber}: ${issueTitle}

### Issue Type
${isEnhancement ? 'Enhancement' : isBug ? 'Bug Fix' : 'Task'}

### Issue Description
${issueBody}

---

## Project Files
\`\`\`
${fileListStr}
\`\`\`

Select the files most likely needed to implement this change.`;

  console.log('\n🔎 PASS 0: Selecting relevant files...');

  let selectedFiles;
  try {
    const responseText = await streamMessage(
      [{ role: 'user', content: selectionUserPrompt }],
      selectionSystemPrompt,
      false, // no extended thinking for the cheap selection pass
      2000
    );

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in file selection response');
    const selection = JSON.parse(jsonMatch[0]);
    const normalized = (selection.files || [])
      .map(f => (typeof f === 'string' ? f.replace(/^\.\//, '') : ''))
      .filter(f => candidateFiles.includes(f));

    if (normalized.length === 0) {
      console.warn('⚠️  Pass 0 returned no matching files - falling back to all candidate files');
      selectedFiles = candidateFiles;
    } else {
      selectedFiles = normalized;
      console.log(`📁 Selected ${selectedFiles.length} files:`);
      selectedFiles.forEach(f => console.log(`   - ${f}`));
      if (selection.reasoning) {
        console.log(`💭 Reasoning: ${selection.reasoning}`);
      }
    }
  } catch (error) {
    console.warn(`⚠️  File selection failed (${error.message}) - falling back to all candidate files`);
    selectedFiles = candidateFiles;
  }

  // Expand the selected file set with anything that *imports* those files, so
  // the bot also sees the parents in any prop/signature chain it's about to
  // change. Skipped when we already fell back to "all candidate files".
  if (selectedFiles !== candidateFiles) {
    const importers = findImporters(selectedFiles, candidateFiles);
    const added = importers.filter(f => !selectedFiles.includes(f));
    if (added.length > 0) {
      console.log(`🔗 Auto-included ${added.length} importer file(s) (catches parent→child wiring):`);
      added.forEach(f => console.log(`   + ${f}`));
      selectedFiles = [...selectedFiles, ...added];
    }
  }

  // Read selected files into context
  let fileContext = '';
  const includedFiles = [];
  for (const file of selectedFiles) {
    const content = readFileSafely(file);
    if (content) {
      fileContext += `### ${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      includedFiles.push(file);
    }
  }

  console.log(`Including ${includedFiles.length} files in context (${fileContext.length} chars)`);

  // ============================================================
  // PASS 1: ANALYSIS - Think through the problem before coding
  // ============================================================

  const analysisSystemPrompt = `You are an expert software engineer analyzing a GitHub issue for a Next.js application called "Meeting Actions".

Your task is to THINK THROUGH the problem carefully before any code is written. You must:

1. **Understand what's being asked** - What exactly does the user want? Is it clear or ambiguous?

2. **Identify the right approach** - What's the correct technical solution? Consider:
   - Where in the codebase should this change be made?
   - What's the right pattern to use?
   - Are there any technical limitations or gotchas?

3. **Decide if you can implement it** - Be honest about whether:
   - The request is clear enough to implement
   - You have enough information
   - The change is technically feasible with the current approach

## CRITICAL: COMMON PITFALLS TO AVOID

### CSS/Styling Pitfalls - THINK CAREFULLY ABOUT THESE:

**Native browser controls CANNOT be styled with padding/margin:**
- \`<select>\` dropdown arrows - The arrow is rendered BY THE BROWSER, not by CSS. Adding \`pr-8\` or \`padding-right\` does NOTHING to the arrow position.
- \`<input type="date">\`, \`<input type="time">\` - Calendar/time picker icons are browser-controlled.

**To actually style a native <select> dropdown arrow, you MUST:**
1. Use \`appearance: none\` to remove the browser's default arrow entirely
2. Add your own arrow using \`background-image\` with an SVG/icon
3. Use \`background-position\` to place it where you want
4. Example: \`appearance-none bg-[url('data:image/svg+xml,...')] bg-no-repeat bg-[right_0.5rem_center]\`

**DO NOT just add padding and hope it fixes dropdown arrows - IT WON'T WORK.**

**Ask yourself:** "Is this a native browser control? If yes, padding won't help."

### React/Next.js Pitfalls:
- State updates are async - don't expect immediate updates
- useEffect dependencies matter - missing deps cause bugs
- Event handlers need proper binding

### General Pitfalls:
- Don't add padding/margin to fix alignment issues without understanding the root cause
- Don't apply changes to ALL similar elements when only SOME need fixing
- Don't guess - if you're not sure what the user wants, say so

## RESPONSE FORMAT

Respond with a JSON object:

{
  "understanding": "What I understand the user is asking for",
  "technical_analysis": "The technical approach I would take and why",
  "potential_issues": ["Any concerns or limitations"],
  "confidence": "high" | "medium" | "low",
  "recommendation": "proceed" | "needs_clarification",
  "clarification_needed": "If needs_clarification, what specific questions would help",
  "implementation_plan": "If proceeding, step-by-step plan for the changes"
}

If confidence is "low" or you're unsure about the right approach, set recommendation to "needs_clarification".
It's BETTER to ask for clarification than to implement something wrong.`;

  const analysisUserPrompt = `## Issue #${issueNumber}: ${issueTitle}

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

Please analyze this issue carefully. Think through the problem before proposing a solution.
- What exactly is being asked?
- What's the RIGHT way to implement this (not just A way)?
- Are there any technical gotchas or limitations?
- Do you have enough information to implement this correctly?`;

  console.log('\n📊 PASS 1: Analyzing issue...');

  let analysisResponse;
  try {
    const responseText = await streamMessage(
      [{ role: 'user', content: analysisUserPrompt }],
      analysisSystemPrompt
    );

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysisResponse = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in analysis response');
    }
  } catch (error) {
    console.error('Failed to parse analysis response:', error);
    process.exit(1);
  }

  console.log('\n📋 Understanding:', analysisResponse.understanding);
  console.log('🔍 Technical Analysis:', analysisResponse.technical_analysis);
  console.log('⚠️  Potential Issues:', analysisResponse.potential_issues?.join(', ') || 'None identified');
  console.log('📈 Confidence:', analysisResponse.confidence);
  console.log('💡 Recommendation:', analysisResponse.recommendation);

  // Check if we should proceed or need clarification
  if (analysisResponse.recommendation === 'needs_clarification') {
    console.log('\n❓ Clarification needed:', analysisResponse.clarification_needed);

    // Write status for the workflow
    const status = {
      needsClarification: true,
      analysis: analysisResponse.understanding,
      clarificationNeeded: analysisResponse.clarification_needed,
      summary: `Could not auto-implement: ${analysisResponse.clarification_needed}`,
    };
    fs.writeFileSync('auto-implement-status.json', JSON.stringify(status, null, 2));

    console.log('\n⏸️  Stopping - clarification needed before implementation');
    process.exit(0);
  }

  if (analysisResponse.confidence === 'low') {
    console.log('\n⚠️  Low confidence - proceeding with caution');
  }

  // ============================================================
  // PASS 2: IMPLEMENTATION - Generate the actual code changes
  // ============================================================

  const implementationSystemPrompt = `You are an expert software engineer implementing a change for a Next.js application called "Meeting Actions".

You have already analyzed this issue and have a clear plan. Now generate the exact code changes.

## YOUR ANALYSIS AND PLAN:
${JSON.stringify(analysisResponse, null, 2)}

## CRITICAL RULES:

1. **FOLLOW YOUR PLAN** - Implement exactly what you analyzed, don't deviate.

2. **ALWAYS EDIT EXISTING FILES** - Do NOT create new files unless absolutely necessary.

3. **AVOID MODIFYING package.json** - Only add dependencies if the issue has "allow-deps" label.

4. **MINIMAL CHANGES** - Make the smallest possible change. Don't refactor or "improve" other code.

5. **MATCH EXISTING STYLE** - Copy exact patterns from the codebase.

## RESPONSE FORMAT:

Return ONLY a valid JSON object:

{
  "analysis": "Brief summary of what you're changing and why",
  "changes": [
    {
      "file": "path/to/file.js",
      "action": "edit",
      "search": "exact string to find (copy precisely, including whitespace)",
      "replace": "string to replace it with",
      "replace_all": false,
      "description": "what this change does"
    }
  ],
  "summary": "One sentence summary of the implementation"
}

For search/replace:
- The "search" string must be an EXACT match (copy it precisely)
- Keep search strings unique enough to match only once
- Use "replace_all": true only if you need to change ALL occurrences
- Include enough context to be unique

If you realize you cannot implement this correctly:
{
  "analysis": "Why this cannot be implemented",
  "changes": [],
  "summary": "Could not implement: reason"
}`;

  const implementationUserPrompt = `Now implement the changes based on your analysis.

## Issue #${issueNumber}: ${issueTitle}

### Issue Description
${issueBody}

---

## Source Code Context

${fileContext}

---

REMINDERS:
- ${allowDeps ? 'New dependencies ARE allowed (allow-deps label present)' : 'DO NOT modify package.json'}
- Follow your implementation plan exactly
- Make minimal, targeted changes`;

  console.log('\n🔧 PASS 2: Generating implementation...');

  let result;
  try {
    const responseText = await streamMessage(
      [{ role: 'user', content: implementationUserPrompt }],
      implementationSystemPrompt
    );

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in implementation response');
    }
  } catch (error) {
    console.error('Failed to parse implementation response:', error);
    process.exit(1);
  }

  console.log('\n📋 Analysis:', result.analysis);
  console.log('📝 Summary:', result.summary);

  if (!result.changes || result.changes.length === 0) {
    console.log('\n⚠️ No changes to apply');

    const status = {
      needsClarification: false,
      analysis: result.analysis,
      summary: result.summary,
      changesApplied: 0,
    };
    fs.writeFileSync('auto-implement-status.json', JSON.stringify(status, null, 2));

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

  // Write status for the workflow
  const status = {
    needsDepsLabel,
    needsClarification: false,
    analysis: result.analysis,
    summary: result.summary,
    changesApplied: result.changes.length,
    implementationPlan: analysisResponse.implementation_plan,
  };
  fs.writeFileSync('auto-implement-status.json', JSON.stringify(status, null, 2));

  if (result.changes.length === 0) {
    console.log('\n⚠️ No valid changes to apply after filtering');
    process.exit(0);
  }

  // Apply changes
  console.log(`\n🔧 Applying ${result.changes.length} change(s)...`);

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
          if (!fs.existsSync(filePath)) {
            console.error(`    ❌ File not found: ${change.file}`);
            failCount++;
            continue;
          }

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
            console.error(`    Search string (${change.search.length} chars):`);
            console.error(change.search.substring(0, 200));
            failCount++;
            continue;
          }

          const occurrences = content.split(change.search).length - 1;

          let newContent;
          if (change.replace_all && occurrences > 1) {
            newContent = content.split(change.search).join(change.replace);
            console.log(`    Replacing all ${occurrences} occurrences`);
          } else {
            if (occurrences > 1) {
              console.warn(`    ⚠️ Search string found ${occurrences} times, replacing first occurrence`);
            }
            newContent = content.replace(change.search, change.replace);
          }

          if (newContent === content) {
            console.error(`    ❌ Replace resulted in identical content!`);
            failCount++;
            continue;
          }

          fileCache[filePath] = newContent;
          fs.writeFileSync(filePath, newContent);
          console.log(`    ✓ Applied successfully`);
          console.log(`    File size: ${content.length} -> ${newContent.length} bytes`);
          successCount++;
          break;

        case 'create':
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

  console.log('\n✅ Implementation complete');
}

main();
