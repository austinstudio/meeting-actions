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

// Files to include in context (adjust based on your project)
const CONTEXT_FILES = [
  'pages/index.js',
  'pages/api/webhook.js',
  'pages/api/tasks/index.js',
  'pages/api/tasks/[id].js',
  'pages/api/github/create-issue.js',
  'pages/api/github/status.js',
  'lib/auth.js',
  'lib/features.js',
  'package.json',
  'CLAUDE.md',
];

// Maximum tokens for file content (to stay within context limits)
const MAX_FILE_TOKENS = 50000;

function readFilesSafely(files) {
  const contents = {};
  let totalLength = 0;

  for (const file of files) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Rough token estimate (4 chars per token)
      if (totalLength + content.length / 4 < MAX_FILE_TOKENS) {
        contents[file] = content;
        totalLength += content.length / 4;
      }
    }
  }

  return contents;
}

function formatFilesForPrompt(files) {
  return Object.entries(files)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');
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

  // Read context files
  const files = readFilesSafely(CONTEXT_FILES);
  const fileContext = formatFilesForPrompt(files);

  const systemPrompt = `You are an expert software engineer working on a Next.js application called "Meeting Actions".
Your task is to implement changes based on GitHub issues.

IMPORTANT RULES:
1. Only make changes that are directly requested in the issue
2. Keep changes minimal and focused
3. Follow existing code patterns and styles in the codebase
4. Do not add unnecessary features or refactoring
5. Return your response as a JSON object with file changes

Your response MUST be a valid JSON object with this structure:
{
  "analysis": "Brief explanation of what you're implementing",
  "changes": [
    {
      "file": "path/to/file.js",
      "action": "edit" | "create" | "delete",
      "content": "full file content for create/edit, null for delete",
      "description": "what this change does"
    }
  ],
  "summary": "One sentence summary of all changes"
}

If you cannot implement the request (unclear requirements, needs human decision, etc.), return:
{
  "analysis": "explanation of why",
  "changes": [],
  "summary": "Could not auto-implement: reason"
}`;

  const userPrompt = `## Issue #${issueNumber}: ${issueTitle}

### Issue Type
${isEnhancement ? 'Enhancement' : isBug ? 'Bug Fix' : 'Task'}

### Issue Description
${issueBody}

---

## Current Codebase Context

${fileContext}

---

Please implement the changes requested in this issue. Remember to return valid JSON only.`;

  console.log('Calling Claude API...');

  try {
    const response = await anthropic.messages.create({
      model: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      max_tokens: 8000,
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
