import React, { useState, useEffect } from 'react';
import { Calendar, User, Clock, CheckCircle2, ArrowRight, RefreshCw, Plus, Zap } from 'lucide-react';

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

function TaskCard({ task, meeting, onStatusChange }) {
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
      <div className="flex items-start gap-2 mb-2">
        <div className="text-slate-400 mt-0.5">
          {typeIcons[task.type] || typeIcons['action']}
        </div>
        <p className="text-sm text-slate-800 font-medium leading-snug flex-1">
          {task.task}
        </p>
      </div>

      {task.person && (
        <div className="flex items-center gap-1.5 mb-2 ml-5">
          <User size={12} className="text-slate-400" />
          <span className="text-xs text-slate-500">{task.person}</span>
        </div>
      )}

      <div className="flex items-center justify-between ml-5">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority] || priorityColors['medium']}`}>
            {task.priority}
          </span>
          {meeting && (
            <span className="text-xs text-slate-400 truncate max-w-[100px]" title={meeting.title}>
              {meeting.title?.split(' ').slice(0, 2).join(' ')}
            </span>
          )}
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
    </button>
  );
}

export default function MeetingKanban() {
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [view, setView] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testLoading, setTestLoading] = useState(false);

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

  // Test with sample transcript
  const handleTestTranscript = async () => {
    setTestLoading(true);
    try {
      const response = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (data.success) {
        await fetchData(); // Refresh the data
      } else {
        setError(data.error || 'Test failed');
      }
    } catch (err) {
      setError('Failed to run test');
      console.error(err);
    } finally {
      setTestLoading(false);
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
    if (selectedMeeting && t.meetingId !== selectedMeeting) return false;
    if (view === 'follow-ups' && t.type !== 'follow-up') return false;
    if (view === 'actions' && t.type !== 'action') return false;
    return true;
  });

  const stats = {
    total: tasks.length,
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
            <p className="text-sm text-slate-500 mt-0.5">Extracted from your Plaud recordings</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm">
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">Recent Meetings</h2>
          </div>

          <div className="space-y-2 mb-6">
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
              <p className="text-sm mb-4">No meetings yet</p>
              <button
                onClick={handleTestTranscript}
                disabled={testLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {testLoading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                Test with Sample
              </button>
            </div>
          ) : (
            <div className="space-y-2">
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

          {/* Connection Status */}
          <div className="mt-6 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-amber-500" />
              <span className="text-sm font-medium text-slate-700">Zapier Webhook</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">Send POST requests to:</p>
            <code className="text-xs bg-slate-100 px-2 py-1 rounded block truncate text-slate-600">
              /api/webhook
            </code>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-x-auto">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-slate-500 mr-2">Show:</span>
            {[
              { id: 'all', label: 'All Items' },
              { id: 'actions', label: 'Actions' },
              { id: 'follow-ups', label: 'Follow-ups' },
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setView(filter.id)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${view === filter.id ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {filter.label}
              </button>
            ))}
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
    </div>
  );
}
