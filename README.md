# Meeting Actions

Automatically extract action items and follow-ups from your Plaud meeting recordings using AI.

## How It Works

1. **Plaud** records your meeting and generates a transcript
2. **Zapier** sends the transcript to this app's webhook
3. **Claude** extracts action items, follow-ups, owners, and due dates
4. **Kanban board** displays everything so you can track and complete tasks

---

## 🚀 Deploy to Vercel (Step by Step)

### Prerequisites
- A GitHub account (free)
- A Vercel account (free) - sign up at [vercel.com](https://vercel.com)
- A Google Gemini API key - get one at [aistudio.google.com](https://aistudio.google.com/apikey)

### Step 1: Push Code to GitHub

1. Create a new repository on GitHub:
   - Go to github.com → Click "+" → "New repository"
   - Name it `meeting-actions`
   - Keep it private if you prefer
   - Click "Create repository"

2. Push this code to your new repo:
   ```bash
   cd meeting-actions
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/meeting-actions.git
   git push -u origin main
   ```

### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub

2. Click **"Add New..."** → **"Project"**

3. Find your `meeting-actions` repo and click **"Import"**

4. Configure the project:
   - **Framework Preset**: Next.js (should auto-detect)
   - **Root Directory**: `./` (leave as default)
   
5. **Add Environment Variable** (IMPORTANT):
   - Click "Environment Variables"
   - Add:
     - **Name**: `GEMINI_API_KEY`
     - **Value**: Your Gemini API key
   - Click "Add"

6. Click **"Deploy"**

7. Wait 1-2 minutes. Vercel will give you a URL like:
   ```
   https://meeting-actions-abc123.vercel.app
   ```

### Step 3: Connect Zapier

1. In Zapier, create a new Zap:
   - **Trigger**: Plaud → "New Note"
   
2. **Action**: Webhooks by Zapier → "POST"
   - **URL**: `https://YOUR-VERCEL-URL.vercel.app/api/webhook`
   - **Payload Type**: JSON
   - **Data**:
     ```
     transcript: {{note_content}}
     title: {{note_title}}
     date: {{note_date}}
     noteId: {{note_id}}
     ```
   
   (Map these fields to whatever Plaud provides - the exact field names may vary)

3. Test the Zap and turn it on!

---

## 🧪 Testing Without Zapier

Once deployed, you can test the extraction without needing real Plaud data:

1. Visit your app at `https://YOUR-VERCEL-URL.vercel.app`
2. Click the **"Test with Sample"** button in the sidebar
3. This sends a sample meeting transcript through the pipeline

Or use curl:
```bash
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/test
```

---

## 📡 Webhook API

### POST /api/webhook

Receives meeting transcripts and extracts action items.

**Request:**
```json
{
  "transcript": "Full meeting transcript text...",
  "title": "Optional meeting title",
  "date": "2025-01-23",
  "noteId": "optional-plaud-note-id"
}
```

**Response:**
```json
{
  "success": true,
  "meeting": {
    "id": "m_1234567890",
    "title": "Sprint Planning Meeting",
    "participants": ["Sarah", "Marcus"],
    "summary": "Discussed Q1 priorities..."
  },
  "tasks": [
    {
      "id": "t_1234567890_0",
      "task": "Review authentication wireframes",
      "owner": "Me",
      "dueDate": "2025-01-24",
      "priority": "high",
      "type": "action"
    }
  ]
}
```

### GET /api/webhook

Returns all meetings and tasks.

---

## ⚠️ Current Limitations

This is a prototype with in-memory storage. Data will reset when the serverless function cold-starts. For production use, add a database:

**Recommended options:**
- **Vercel KV** - Redis-like, dead simple
- **Vercel Postgres** - Full SQL database
- **Supabase** - Postgres + auth + realtime
- **Planetscale** - Serverless MySQL

I can help add any of these if you want to persist data long-term.

---

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Create .env.local with your API key
echo "GEMINI_API_KEY=your-gemini-key-here" > .env.local

# Run development server
npm run dev

# Open http://localhost:3000
```

---

## Next Steps

Once you've validated the concept, potential enhancements:
- [ ] Add persistent database storage
- [ ] Email/Slack notifications for overdue items
- [ ] Calendar integration for due dates
- [ ] Export to Notion/Asana/Jira
- [ ] Team sharing and assignment
- [ ] Meeting analytics and trends
