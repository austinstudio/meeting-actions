import React, { useState, useEffect } from 'react';
import { Calendar, User, Clock, CheckCircle2, ArrowRight, RefreshCw, Plus, FileText, X, Users } from 'lucide-react';

const statusColumns = [
  { id: 'todo', label: 'To Do', color: 'bg-slate-100', accent: 'border-slate-300' },
  { id: 'in-progress', label: 'In Progress', color: 'bg-blue-50', accent: 'border-blue-300' },
  { id: 'waiting', label: 'Waiting On Others', color: 'bg-amber-50', accent: 'border-amber-300' },
  { id: 'done', label: 'Done', color: 'bg-emerald-50', accent: 'border-emerald-300' },
];

const priorityColors = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const typeIcons = {
  'action': <CheckCircle2 size={14} />,
  'follow-up': <ArrowRight size={14} />,
};

function TaskCard({ task, meeting }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.setData('taskId', task.id);
  };

  const handleDragEnd = () => setIsDragging(false);

  const dueDate = new Date(task.dueDate);
  const today = new Date();
  const isOverdue = dueDate < today && task.status !== 'done';
  const isDueSoon = !isOverdue && (dueDate - today) / (1000 * 60 * 60 * 24) <= 2;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`bg-white rounded-lg border border-slate-200 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all ${isDragging ? 'opacity-50 rotate-2' : ''}`}
    >
      {/* Meeting source tag */}
      {meeting && (
        <div className="flex items-center gap-1.5 mb-2 -mt-1">
          <FileText size={12} className="text-indigo-400" />
          <span className="text-xs text-indigo-600 font-medium truncate" title={meeting.title}>
            {meeting.title}
          </span>
        </div>
      )}
      
      <div className="flex items-start gap-2 mb-2">
        <div className="text-slate-400 mt-0.5">
          {typeIcons[task.type] || typeIcons['action']}
        </div>
        <p className="text-sm text-slate-800 font-medium leading-snug flex-1">
          {task.task}
        </p>
      </div>

      {/* Owner / Assigned to */}
      <div className="flex items-center gap-1.5 mb-2 ml-5">
        <User size={12} className="text-slate-400" />
        <span className={`text-xs ${task.owner === 'Me' ? 'text-indigo-600 font-medium' : 'text-slate-500'}`}>
          {task.owner || 'Unassigned'}
        </span>
        {task.person && task.type === 'follow-up' && (
          <>
            <ArrowRight size={10} className="text-slate-300" />
            <span className="text-xs text-slate-500">{task.person}</span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between ml-5">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority] || priorityColors['medium']}`}>
            {task.priority}
          </span>
        </div>
        <div className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-rose-600 font-medium' : isDueSoon ? 'text-amber-600' : 'text-slate-400'}`}>
          <Clock size={12} />
          {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>
    </div>
  );
}

function Column({ column, tasks, meetings, onDrop }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData('taskId');
    onDrop(taskId, column.id);
  };

  const columnTasks = tasks.filter(t => t.status === column.id);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 min-w-[280px] max-w-[320px] rounded-xl ${column.color} border-2 ${isDragOver ? column.accent : 'border-transparent'} transition-colors`}
    >
      <div className="p-3 border-b border-slate-200/50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">{column.label}</h3>
          <span className="text-xs bg-white/60 text-slate-500 px-2 py-0.5 rounded-full">
            {columnTasks.length}
          </span>
        </div>
      </div>
      <div className="p-2 space-y-2 min-h-[400px]">
        {columnTasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            meeting={meetings.find(m => m.id === task.meetingId)}
          />
        ))}
      </div>
    </div>
  );
}

function MeetingCard({ meeting, taskCount, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium text-slate-800 text-sm leading-snug">{meeting.title}</h4>
        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full whitespace-nowrap">
          {taskCount} items
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        {meeting.duration && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {meeting.duration}
          </span>
        )}
      </div>
      {meeting.participants && meeting.participants.length > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
          <Users size={12} />
          <span className="truncate">{meeting.participants.slice(0, 3).join(', ')}{meeting.participants.length > 3 ? '...' : ''}</span>
        </div>
      )}
    </button>
  );
}

function PasteModal({ isOpen, onClose, onSubmit, isProcessing }) {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (transcript.trim()) {
      onSubmit({ title: title.trim() || 'Untitled Meeting', transcript: transcript.trim() });
    }
  };

  const handleClose = () => {
    setTitle('');
    setTranscript('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Add Meeting Transcript</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Meeting Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sprint Planning, Client Call, 1:1 with Sarah"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Transcript <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your meeting transcript here..."
              rows={12}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              Paste the full transcript from Plaud. The AI will extract action items, follow-ups, and assign owners.
            </p>
          </div>
          
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!transcript.trim() || isProcessing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Extract Action Items
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MeetingKanban() {
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [view, setView] = useState('all'); // 'all', 'mine', 'follow-ups', 'actions'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch data from API
  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/webhook');
      const data = await response.json();
      setMeetings(data.meetings || []);
      setTasks(data.tasks || []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Process a pasted transcript
  const handlePasteSubmit = async ({ title, transcript }) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          title,
          date: new Date().toISOString().split('T')[0]
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Add new meeting and tasks to state
        setMeetings(prev => [data.meeting, ...prev]);
        setTasks(prev => [...data.tasks, ...prev]);
        setShowPasteModal(false);
      } else {
        setError(data.error || 'Failed to process transcript');
      }
    } catch (err) {
      setError('Failed to process transcript');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = async (taskId, newStatus) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: newStatus } : t
    ));

    // In production, persist to backend
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const filteredTasks = tasks.filter(t => {
    // Meeting filter
    if (selectedMeeting && t.meetingId !== selectedMeeting) return false;
    
    // Type/owner filters
    if (view === 'mine' && t.owner !== 'Me') return false;
    if (view === 'follow-ups' && t.type !== 'follow-up') return false;
    if (view === 'actions' && t.type !== 'action') return false;
    
    return true;
  });

  const stats = {
    total: tasks.length,
    mine: tasks.filter(t => t.owner === 'Me').length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => new Date(t.dueDate) < new Date() && t.status !== 'done').length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Meeting Actions</h1>
            <p className="text-sm text-slate-500 mt-0.5">Extract and track action items from your meetings</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">{stats.mine}</div>
                <div className="text-xs text-slate-500">My Tasks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800">{stats.todo}</div>
                <div className="text-xs text-slate-500">To Do</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
                <div className="text-xs text-slate-500">In Progress</div>
              </div>
              {stats.overdue > 0 && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600">{stats.overdue}</div>
                  <div className="text-xs text-slate-500">Overdue</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{stats.done}</div>
                <div className="text-xs text-slate-500">Done</div>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-80 border-r border-slate-200 bg-white p-4 min-h-[calc(100vh-73px)]">
          {/* Add Meeting Button */}
          <button
            onClick={() => setShowPasteModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors mb-4"
          >
            <Plus size={18} />
            Add Meeting Transcript
          </button>
          
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">Meetings</h2>
          </div>

          <div className="space-y-2 mb-4">
            <button
              onClick={() => setSelectedMeeting(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedMeeting ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              All Meetings ({meetings.length})
            </button>
          </div>

          {loading && meetings.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading...</p>
            </div>
          ) : meetings.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm mb-2">No meetings yet</p>
              <p className="text-xs">Click "Add Meeting Transcript" to get started</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
              {meetings.map(meeting => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  taskCount={tasks.filter(t => t.meetingId === meeting.id).length}
                  isSelected={selectedMeeting === meeting.id}
                  onClick={() => setSelectedMeeting(meeting.id === selectedMeeting ? null : meeting.id)}
                />
              ))}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-x-auto">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-slate-500 mr-2">Show:</span>
            {[
              { id: 'all', label: 'All Items' },
              { id: 'mine', label: 'My Tasks' },
              { id: 'actions', label: 'Actions' },
              { id: 'follow-ups', label: 'Follow-ups' },
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setView(filter.id)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${view === filter.id ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {filter.label}
                {filter.id === 'mine' && (
                  <span className="ml-1 text-xs">({stats.mine})</span>
                )}
              </button>
            ))}
            
            {selectedMeeting && (
              <button
                onClick={() => setSelectedMeeting(null)}
                className="ml-2 px-3 py-1.5 rounded-full text-sm bg-amber-100 text-amber-700 font-medium flex items-center gap-1"
              >
                {meetings.find(m => m.id === selectedMeeting)?.title?.slice(0, 20)}...
                <X size={14} />
              </button>
            )}
          </div>

          {/* Kanban Board */}
          <div className="flex gap-4">
            {statusColumns.map(column => (
              <Column
                key={column.id}
                column={column}
                tasks={filteredTasks}
                meetings={meetings}
                onDrop={handleDrop}
              />
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
              {error}
            </div>
          )}
        </main>
      </div>

      {/* Paste Modal */}
      <PasteModal
        isOpen={showPasteModal}
        onClose={() => setShowPasteModal(false)}
        onSubmit={handlePasteSubmit}
        isProcessing={isProcessing}
      />
    </div>
  );
}
