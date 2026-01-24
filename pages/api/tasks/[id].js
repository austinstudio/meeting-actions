// pages/api/tasks/[id].js
// Update individual task status

// Note: In production, this would connect to your database
// For now, we're using the in-memory store from webhook.js
// This is a limitation of the demo - you'd want a shared data layer

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (req.method === 'PATCH') {
    const { status, priority } = req.body;
    
    // In production: UPDATE tasks SET status = $1 WHERE id = $2
    // For demo, this would need shared state management
    
    return res.status(200).json({ 
      success: true, 
      message: 'Task updated',
      note: 'In demo mode - refresh to see actual data from webhook'
    });
  }

  if (req.method === 'DELETE') {
    // In production: DELETE FROM tasks WHERE id = $1
    return res.status(200).json({ success: true, message: 'Task deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
