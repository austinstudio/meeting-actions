import React, { useState, useEffect } from 'react';
import { Calendar, User, Clock, CheckCircle2, ArrowRight, RefreshCw, Plus, FileText, X, Users, Trash2, Archive, MoreVertical, Settings, ChevronDown } from 'lucide-react';

const DEFAULT_COLUMNS = [
  { id: 'todo', label: 'To Do', color: 'slate', order: 0 },
  { id: 'in-progress', label: 'In Progress', color: 'blue', order: 1 },
  { id: 'waiting', label: 'Waiting On Others', color: 'amber', order: 2 },
  { id: 'done', label: 'Done', color: 'emerald', order: 3 },
];

const COLUMN_COLORS = {
  slate: { bg: 'bg-slate-100', accent: 'border-slate-300', badge: 'bg-slate-200' },
  blue: { bg: 'bg-blue-50', accent: 'border-blue-300', badge: 'bg-blue-100' },
  amber: { bg: 'bg-amber-50', accent: 'border-amber-300', badge: 'bg-amber-100' },
  emerald: { bg: 'bg-emerald-50', accent: 'border-emerald-300', badge: 'bg-emerald-100' },
  purple: { bg: 'bg-purple-50', accent: 'border-purple-300', badge: 'bg-purple-100' },
  rose: { bg: 'bg-rose-50', accent: 'border-rose-300', badge: 'bg-rose-100' },
  indigo: { bg: 'bg-indigo-50', accent: 'border-indigo-300', badge: 'bg-indigo-100' },
  teal: { bg: 'bg-teal-50', accent: 'border-teal-300', badge: 'bg-teal-100' },
};

const priorityColors = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const typeIcons = {
  'action': <CheckCircle2 size={14} />,
  'follow-up': <ArrowRight size={14} />,
};

function TaskCard({ task, meeting, onDelete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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
      className={`bg-white rounded-lg border border-slate-200 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all relative group ${isDragging ? 'opacity-50 rotate-2' : ''}`}
    >
      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(task.id);
        }}
        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete task"
      >
        <Trash2 size={14} />
      </button>
      
      {/* Meeting source tag */}
      {meeting && (
        <div className="flex items-center gap-1.5 mb-2 -mt-1 pr-6">
          <FileText size={12} className="text-indigo-400 flex-shrink-0" />
          <span className="text-xs text-indigo-600 font-medium truncate" title={meeting.title}>
            {meeting.title}
          </span>
        </div>
      )}
      
      <div className="flex items-start gap-2 mb-2">
        <div className="text-slate-400 mt-0.5">
          {typeIcons[task.type] || typeIcons['action']}
        </div>
        <p className="text-sm text-slate-800 font-medium leading-snug flex-1 pr-4">
          {task.task}
        </p>
      </div>

      {/* Context */}
      {task.context && (
        <p className="text-xs text-slate-400 mb-2 ml-5 italic line-clamp-2">
          {task.context}
        </p>
      )}

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

function Column({ column, tasks, meetings, onDrop, onDeleteTask }) {
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
  const colors = COLUMN_COLORS[column.color] || COLUMN_COLORS.slate;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 min-w-[280px] max-w-[320px] rounded-xl ${colors.bg} border-2 ${isDragOver ? colors.accent : 'border-transparent'} transition-colors`}
    >
      <div className="p-3 border-b border-slate-200/50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">{column.label}</h3>
          <span className={`text-xs ${colors.badge} text-slate-600 px-2 py-0.5 rounded-full`}>
            {columnTasks.length}
          </span>
        </div>
      </div>
      <div className="p-2 space-y-2 min-h-[400px] max-h-[calc(100vh-280px)] overflow-y-auto">
        {columnTasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            meeting={meetings.find(m => m.id === task.meetingId)}
            onDelete={onDeleteTask}
          />
        ))}
      </div>
    </div>
  );
}

function MeetingCard({ meeting, taskCount, isSelected, onClick, onDelete }) {
  const [showDelete, setShowDelete] = useState(false);
  
  return (
    <div
      className={`relative w-full text-left p-3 rounded-lg border transition-all ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-slate-800 text-sm leading-snug pr-6">{meeting.title}</h4>
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
      
      {/* Delete button */}
      {showDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(meeting.id, meeting.title);
          }}
          className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
          title="Delete meeting and all its tasks"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
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
              Paste the full transcript from Plaud. The AI will extract genuine action items and commitments.
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

function AddColumnModal({ isOpen, onClose, onSubmit }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('slate');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (label.trim()) {
      onSubmit({ label: label.trim(), color });
      setLabel('');
      setColor('slate');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Add New Column</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Column Name
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Review, Blocked, Next Week"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(COLUMN_COLORS).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full ${COLUMN_COLORS[c].bg} border-2 ${color === c ? 'border-indigo-500' : 'border-transparent'}`}
                />
              ))}
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!label.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Column
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel = "Delete", danger = true }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">{title}</h2>
        <p className="text-slate-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium ${danger ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MeetingKanban() {
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [view, setView] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });

  // Fetch data from API
  const fetchData = async () => {
    try {
      setLoading(true);
      const [dataRes, columnsRes] = await Promise.all([
        fetch('/api/webhook'),
        fetch('/api/columns')
      ]);
      const data = await dataRes.json();
      const columnsData = await columnsRes.json();
      
      setMeetings(data.meetings || []);
      setTasks(data.tasks || []);
      setColumns(columnsData.columns || DEFAULT_COLUMNS);
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
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: newStatus } : t
    ));

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

  const handleDeleteTask = async (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete task:', err);
      fetchData(); // Refresh on error
    }
  };

  const handleDeleteMeeting = (meetingId, meetingTitle) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Meeting',
      message: `Are you sure you want to delete "${meetingTitle}" and all its tasks? This cannot be undone.`,
      onConfirm: async () => {
        setMeetings(prev => prev.filter(m => m.id !== meetingId));
        setTasks(prev => prev.filter(t => t.meetingId !== meetingId));
        if (selectedMeeting === meetingId) setSelectedMeeting(null);
        
        try {
          await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
        } catch (err) {
          console.error('Failed to delete meeting:', err);
          fetchData();
        }
        setConfirmModal({ isOpen: false });
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    });
  };

  const handleArchiveDone = async () => {
    const doneTasks = tasks.filter(t => t.status === 'done' && !t.archived);
    if (doneTasks.length === 0) return;
    
    setTasks(prev => prev.map(t => 
      t.status === 'done' && !t.archived 
        ? { ...t, archived: true, archivedAt: new Date().toISOString() }
        : t
    ));
    
    try {
      await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive-done' })
      });
    } catch (err) {
      console.error('Failed to archive tasks:', err);
      fetchData();
    }
  };

  const handleAddColumn = async ({ label, color }) => {
    try {
      const response = await fetch('/api/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, color })
      });
      const data = await response.json();
      if (data.success) {
        setColumns(data.columns);
      }
    } catch (err) {
      console.error('Failed to add column:', err);
    }
  };

  const handleDeleteColumn = async (columnId) => {
    const column = columns.find(c => c.id === columnId);
    setConfirmModal({
      isOpen: true,
      title: 'Delete Column',
      message: `Are you sure you want to delete "${column?.label}"? Tasks in this column will be moved to "To Do".`,
      onConfirm: async () => {
        try {
          const response = await fetch('/api/columns', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columnId })
          });
          const data = await response.json();
          if (data.success) {
            setColumns(data.columns);
            setTasks(prev => prev.map(t => 
              t.status === columnId ? { ...t, status: 'todo' } : t
            ));
          }
        } catch (err) {
          console.error('Failed to delete column:', err);
        }
        setConfirmModal({ isOpen: false });
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    });
  };

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    // Archived filter
    if (!showArchived && t.archived) return false;
    if (showArchived && !t.archived) return false;
    
    // Meeting filter
    if (selectedMeeting && t.meetingId !== selectedMeeting) return false;
    
    // Type/owner filters
    if (view === 'mine' && t.owner !== 'Me') return false;
    if (view === 'follow-ups' && t.type !== 'follow-up') return false;
    if (view === 'actions' && t.type !== 'action') return false;
    
    return true;
  });

  const stats = {
    total: tasks.filter(t => !t.archived).length,
    mine: tasks.filter(t => t.owner === 'Me' && !t.archived).length,
    todo: tasks.filter(t => t.status === 'todo' && !t.archived).length,
    inProgress: tasks.filter(t => t.status === 'in-progress' && !t.archived).length,
    done: tasks.filter(t => t.status === 'done' && !t.archived).length,
    overdue: tasks.filter(t => new Date(t.dueDate) < new Date() && t.status !== 'done' && !t.archived).length,
    archived: tasks.filter(t => t.archived).length,
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
            <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto">
              {meetings.map(meeting => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  taskCount={tasks.filter(t => t.meetingId === meeting.id && !t.archived).length}
                  isSelected={selectedMeeting === meeting.id}
                  onClick={() => setSelectedMeeting(meeting.id === selectedMeeting ? null : meeting.id)}
                  onDelete={handleDeleteMeeting}
                />
              ))}
            </div>
          )}
          
          {/* Archive section */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-600">Archive</h3>
              {stats.archived > 0 && (
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {stats.archived}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <button
                onClick={handleArchiveDone}
                disabled={stats.done === 0}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Archive size={16} />
                Archive completed ({stats.done})
              </button>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${showArchived ? 'bg-amber-100 text-amber-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <FileText size={16} />
                {showArchived ? 'Show active tasks' : 'View archived'}
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-x-auto">
          {/* Filters */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
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
              
              {showArchived && (
                <span className="ml-2 px-3 py-1.5 rounded-full text-sm bg-slate-200 text-slate-600 font-medium">
                  Viewing Archived
                </span>
              )}
            </div>
            
            <button
              onClick={() => setShowColumnModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add Column
            </button>
          </div>

          {/* Kanban Board */}
          <div className="flex gap-4">
            {columns.sort((a, b) => a.order - b.order).map(column => (
              <div key={column.id} className="relative group">
                <Column
                  column={column}
                  tasks={filteredTasks}
                  meetings={meetings}
                  onDrop={handleDrop}
                  onDeleteTask={handleDeleteTask}
                />
                {/* Delete column button for custom columns */}
                {column.custom && (
                  <button
                    onClick={() => handleDeleteColumn(column.id)}
                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete column"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
              {error}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <PasteModal
        isOpen={showPasteModal}
        onClose={() => setShowPasteModal(false)}
        onSubmit={handlePasteSubmit}
        isProcessing={isProcessing}
      />
      
      <AddColumnModal
        isOpen={showColumnModal}
        onClose={() => setShowColumnModal(false)}
        onSubmit={handleAddColumn}
      />
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />
    </div>
  );
}
