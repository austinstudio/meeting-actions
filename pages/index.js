import React, { useState, useEffect, useRef } from 'react';
import { Calendar, User, Clock, CheckCircle2, ArrowRight, RefreshCw, Plus, FileText, X, Users, Trash2, Archive, MoreVertical, Settings, ChevronDown, Pencil, Search, Sparkles, Bell, Upload, File, MessageSquare, History, Send, AtSign } from 'lucide-react';

const DEFAULT_COLUMNS = [
  { id: 'uncategorized', label: 'Uncategorized', color: 'purple', order: 0 },
  { id: 'todo', label: 'To Do', color: 'slate', order: 1 },
  { id: 'in-progress', label: 'In Progress', color: 'blue', order: 2 },
  { id: 'waiting', label: 'Waiting On Others', color: 'amber', order: 3 },
  { id: 'done', label: 'Done', color: 'emerald', order: 4 },
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

// Current user configuration
const CURRENT_USER = 'Corey';
const isCurrentUser = (name) => {
  if (!name) return false;
  const normalized = name.toLowerCase().trim();
  return normalized === 'me' || normalized === 'corey';
};

function TaskCard({ task, meeting, onDelete, onEdit }) {
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [expandContext, setExpandContext] = useState(false);

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
      {/* Action buttons */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(task);
          }}
          className="p-1 text-slate-300 hover:text-indigo-500"
          title="Edit task"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="p-1 text-slate-300 hover:text-rose-500"
          title="Delete task"
        >
          <Trash2 size={14} />
        </button>
      </div>
      
      {/* Meeting source tag */}
      {meeting && (
        <div className="flex items-center gap-1.5 mb-2 -mt-1 pr-12">
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
        <p className="text-sm text-slate-800 font-medium leading-snug flex-1 pr-8">
          {task.task}
        </p>
      </div>

      {/* Context - clickable to expand */}
      {task.context && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpandContext(!expandContext);
          }}
          className={`text-xs text-slate-400 mb-2 ml-5 mr-1 italic text-left hover:text-slate-500 break-words ${expandContext ? '' : 'line-clamp-2'}`}
          style={{ maxWidth: 'calc(100% - 1.5rem)' }}
          title={expandContext ? 'Click to collapse' : 'Click to expand'}
        >
          {task.context}
        </button>
      )}

      {/* Owner / Assigned to */}
      <div className="flex items-center gap-1.5 mb-2 ml-5">
        <User size={12} className="text-slate-400" />
        <span className={`text-xs ${isCurrentUser(task.owner) ? 'text-indigo-600 font-medium' : 'text-slate-500'}`}>
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

function Column({ column, tasks, meetings, onDrop, onDeleteTask, onEditTask, onAddTask, onColumnDragStart, onColumnDragEnd, onColumnDragOver, onColumnDrop, isDraggingColumn, showSkeletons }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isColumnDragOver, setIsColumnDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    const dragType = e.dataTransfer.types.includes('taskid') ? 'task' : 'column';
    if (dragType === 'task' || e.dataTransfer.getData('taskId')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setIsColumnDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    setIsColumnDragOver(false);
    
    const taskId = e.dataTransfer.getData('taskId');
    const columnId = e.dataTransfer.getData('columnId');
    
    if (taskId) {
      onDrop(taskId, column.id);
    } else if (columnId && onColumnDrop) {
      onColumnDrop(columnId, column.id);
    }
  };

  const handleColumnDragStart = (e) => {
    e.dataTransfer.setData('columnId', column.id);
    if (onColumnDragStart) onColumnDragStart(column.id);
  };

  const handleColumnDragEnd = () => {
    if (onColumnDragEnd) onColumnDragEnd();
  };

  const columnTasks = tasks.filter(t => t.status === column.id);
  const colors = COLUMN_COLORS[column.color] || COLUMN_COLORS.slate;

  return (
    <div
      draggable
      onDragStart={handleColumnDragStart}
      onDragEnd={handleColumnDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 min-w-[280px] max-w-[320px] rounded-xl ${colors.bg} border-2 ${isDragOver ? colors.accent : 'border-transparent'} transition-colors ${isDraggingColumn ? 'opacity-50' : ''}`}
    >
      <div className="p-3 border-b border-slate-200/50 cursor-grab active:cursor-grabbing">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">{column.label}</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddTask(column.id);
              }}
              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white/50 rounded transition-colors"
              title="Add task to this column"
            >
              <Plus size={16} />
            </button>
            <span className={`text-xs ${colors.badge} text-slate-600 px-2 py-0.5 rounded-full`}>
              {columnTasks.length}
            </span>
          </div>
        </div>
      </div>
      <div className="p-2 space-y-2 min-h-[400px] max-h-[calc(100vh-280px)] overflow-y-auto">
        {/* Show skeletons when processing in background */}
        {showSkeletons && column.id === 'uncategorized' && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {columnTasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            meeting={meetings.find(m => m.id === task.meetingId)}
            onDelete={onDeleteTask}
            onEdit={onEditTask}
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

function ProcessingOverlay({ onProcessInBackground, canNotify }) {
  return (
    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
      {/* AI Processing Animation */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 animate-spin-slow opacity-20 absolute inset-0" />
        <div className="w-20 h-20 rounded-full bg-gradient-to-bl from-indigo-500 via-purple-500 to-pink-500 animate-spin-slow-reverse opacity-20 absolute inset-0" />
        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center relative">
          <Sparkles className="w-10 h-10 text-indigo-600 animate-pulse" />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-slate-800 mb-2">AI is analyzing your transcript</h3>
      <p className="text-sm text-slate-500 mb-6 text-center max-w-xs">
        Extracting action items, identifying owners, and setting priorities...
      </p>

      {/* Animated dots */}
      <div className="flex gap-1 mb-6">
        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      <button
        onClick={onProcessInBackground}
        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <Bell size={16} />
        {canNotify ? 'Process in background' : 'Enable notifications & continue'}
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 animate-pulse">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-3 h-3 rounded bg-indigo-200" />
        <div className="h-3 bg-indigo-100 rounded w-24" />
      </div>
      <div className="flex items-start gap-2 mb-2">
        <div className="w-4 h-4 rounded bg-slate-200 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-full" />
          <div className="h-4 bg-slate-200 rounded w-3/4" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-2 ml-6">
        <div className="w-3 h-3 rounded bg-slate-200" />
        <div className="h-3 bg-slate-100 rounded w-16" />
      </div>
      <div className="flex items-center justify-between ml-6">
        <div className="h-5 bg-slate-100 rounded-full w-14" />
        <div className="h-3 bg-slate-100 rounded w-12" />
      </div>
    </div>
  );
}

function PasteModal({ isOpen, onClose, onSubmit, isProcessing, onProcessInBackground, canNotify }) {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // Clear form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setTranscript('');
      setUploadedFile(null);
      setUploadError(null);
    }
  }, [isOpen]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'text/plain'];
    const validExtensions = ['.pdf', '.txt'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setUploadError('Please upload a PDF or TXT file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Read file as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Send to API for parsing
      const response = await fetch('/api/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: base64,
          filename: file.name,
          type: file.type
        })
      });

      const data = await response.json();

      if (data.success) {
        setTranscript(data.text);
        setUploadedFile(file.name);
        // Try to extract title from filename
        if (!title) {
          const nameWithoutExt = file.name.replace(/\.(pdf|txt)$/i, '');
          setTitle(nameWithoutExt);
        }
      } else {
        setUploadError(data.error || 'Failed to parse file');
      }
    } catch (err) {
      console.error('File upload error:', err);
      setUploadError('Failed to upload file');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (transcript.trim()) {
      onSubmit({ title: title.trim() || 'Untitled Meeting', transcript: transcript.trim() });
    }
  };

  const handleClose = () => {
    setTitle('');
    setTranscript('');
    setUploadedFile(null);
    setUploadError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden relative">
        {/* Processing Overlay */}
        {isProcessing && (
          <ProcessingOverlay
            onProcessInBackground={onProcessInBackground}
            canNotify={canNotify}
          />
        )}

        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Add Meeting Transcript</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600" disabled={isProcessing}>
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
              disabled={isProcessing}
            />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">
                Transcript <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                {uploadedFile && (
                  <span className="text-xs text-emerald-600 flex items-center gap-1">
                    <File size={12} />
                    {uploadedFile}
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isProcessing || isUploading}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing || isUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Upload PDF or TXT
                    </>
                  )}
                </button>
              </div>
            </div>
            {uploadError && (
              <p className="text-xs text-rose-500 mb-2">{uploadError}</p>
            )}
            <textarea
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                if (uploadedFile) setUploadedFile(null);
              }}
              placeholder="Paste your meeting transcript here, or upload a PDF/TXT file..."
              rows={12}
              required
              disabled={isProcessing || isUploading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm disabled:bg-slate-50"
            />
            <p className="text-xs text-slate-400 mt-1">
              Paste the full transcript or upload a file. The AI will extract genuine action items and commitments.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isProcessing}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!transcript.trim() || isProcessing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Sparkles size={16} />
              Extract Action Items
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

function EditTaskModal({ isOpen, task, onClose, onSave, columns, onAddComment }) {
  const [formData, setFormData] = useState({
    task: '',
    owner: '',
    person: '',
    dueDate: '',
    priority: 'medium',
    type: 'action',
    context: '',
    status: 'todo'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);

  useEffect(() => {
    if (task && isOpen) {
      setFormData({
        task: task.task || '',
        owner: task.owner || '',
        person: task.person || '',
        dueDate: task.dueDate || '',
        priority: task.priority || 'medium',
        type: task.type || 'action',
        context: task.context || '',
        status: task.status || 'todo'
      });
      setActiveTab('details');
      setNewComment('');
    }
  }, [task, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(task.id, formData);
    setIsSaving(false);
    onClose();
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || isAddingComment) return;

    setIsAddingComment(true);
    try {
      await onAddComment(task.id, newComment.trim());
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setIsAddingComment(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getActivityDescription = (activity) => {
    const fieldLabels = {
      status: 'status',
      priority: 'priority',
      task: 'description',
      owner: 'owner',
      person: 'follow-up person',
      dueDate: 'due date',
      context: 'context',
      type: 'type',
      archived: 'archived status'
    };

    if (activity.type === 'comment') {
      return 'added a comment';
    }

    const fieldLabel = fieldLabels[activity.field] || activity.field;
    if (activity.oldValue && activity.newValue) {
      return `changed ${fieldLabel} from "${activity.oldValue}" to "${activity.newValue}"`;
    }
    if (activity.newValue) {
      return `set ${fieldLabel} to "${activity.newValue}"`;
    }
    return `updated ${fieldLabel}`;
  };

  // Parse @mentions in comment text
  const renderCommentText = (text) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className="text-indigo-600 font-medium bg-indigo-50 px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (!isOpen || !task) return null;

  const comments = task.comments || [];
  const activity = task.activity || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Edit Task</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Pencil size={16} />
            Details
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'comments'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <MessageSquare size={16} />
            Comments
            {comments.length > 0 && (
              <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">
                {comments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'activity'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <History size={16} />
            Activity
            {activity.length > 0 && (
              <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">
                {activity.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Task Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Task Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={formData.task}
                  onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                  rows={2}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Owner */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Owner / Assigned To
                </label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Me, John, Sarah, etc."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Type and Person (for follow-ups) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="action">Action</option>
                    <option value="follow-up">Follow-up</option>
                  </select>
                </div>
                {formData.type === 'follow-up' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Follow-up With
                    </label>
                    <input
                      type="text"
                      value={formData.person}
                      onChange={(e) => setFormData({ ...formData, person: e.target.value })}
                      placeholder="Person name"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Due Date and Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {columns.map(col => (
                    <option key={col.id} value={col.id}>{col.label}</option>
                  ))}
                </select>
              </div>

              {/* Context */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Context / Notes
                </label>
                <textarea
                  value={formData.context}
                  onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                  rows={3}
                  placeholder="Additional context about this task..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formData.task.trim() || isSaving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && (
            <div className="p-4 flex flex-col h-full">
              {/* Comment Input */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment... (use @name to mention someone)"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          handleAddComment();
                        }
                      }}
                    />
                    <div className="absolute right-2 bottom-2 text-xs text-slate-400">
                      {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to send
                    </div>
                  </div>
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || isAddingComment}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
                  >
                    {isAddingComment ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </div>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto space-y-3">
                {comments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No comments yet</p>
                    <p className="text-xs mt-1">Add a comment to keep track of updates</p>
                  </div>
                ) : (
                  [...comments].reverse().map(comment => (
                    <div key={comment.id} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">{comment.user}</span>
                        <span className="text-xs text-slate-400">{formatTimestamp(comment.timestamp)}</span>
                      </div>
                      <p className="text-sm text-slate-600">{renderCommentText(comment.text)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="p-4">
              {activity.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <History size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Changes to this task will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...activity].reverse().map(item => (
                    <div key={item.id} className="flex gap-3 text-sm">
                      <div className="flex-shrink-0 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                        {item.type === 'comment' ? (
                          <MessageSquare size={14} className="text-slate-500" />
                        ) : (
                          <History size={14} className="text-slate-500" />
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-slate-600">
                          <span className="font-medium text-slate-700">{item.user}</span>
                          {' '}{getActivityDescription(item)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatTimestamp(item.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddTaskModal({ isOpen, columnId, columns, onClose, onSave }) {
  const [formData, setFormData] = useState({
    task: '',
    owner: CURRENT_USER,
    person: '',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    priority: 'medium',
    type: 'action',
    context: '',
    status: 'todo'
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && columnId) {
      setFormData(prev => ({
        ...prev,
        task: '',
        context: '',
        status: columnId
      }));
    }
  }, [isOpen, columnId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(formData);
    setIsSaving(false);
    setFormData({
      task: '',
      owner: CURRENT_USER,
      person: '',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority: 'medium',
      type: 'action',
      context: '',
      status: columnId || 'todo'
    });
    onClose();
  };

  if (!isOpen) return null;

  const columnName = columns.find(c => c.id === columnId)?.label || 'To Do';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Add Task to {columnName}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Task Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Task Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={formData.task}
              onChange={(e) => setFormData({ ...formData, task: e.target.value })}
              rows={2}
              required
              autoFocus
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Owner */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Owner / Assigned To
            </label>
            <input
              type="text"
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              placeholder="Me, John, Sarah, etc."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Type and Person */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="action">Action</option>
                <option value="follow-up">Follow-up</option>
              </select>
            </div>
            {formData.type === 'follow-up' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Follow-up With
                </label>
                <input
                  type="text"
                  value={formData.person}
                  onChange={(e) => setFormData({ ...formData, person: e.target.value })}
                  placeholder="Person name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Due Date and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Context */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Context / Notes
            </label>
            <textarea
              value={formData.context}
              onChange={(e) => setFormData({ ...formData, context: e.target.value })}
              rows={2}
              placeholder="Additional context about this task..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.task.trim() || isSaving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Add Task
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SearchInput({ value, onChange, resultCount }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onChange('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChange]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={value ? `${resultCount} results` : "Search tasks... (\u2318K)"}
        className="pl-9 pr-8 py-1.5 w-64 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      )}
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
  const [editingTask, setEditingTask] = useState(null);
  const [addingToColumn, setAddingToColumn] = useState(null);
  const [draggingColumn, setDraggingColumn] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingInBackground, setProcessingInBackground] = useState(false);
  const [canNotify, setCanNotify] = useState(false);
  const processingDataRef = useRef(null);

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setCanNotify(Notification.permission === 'granted');
    }
  }, []);

  // Request notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setCanNotify(permission === 'granted');
      return permission === 'granted';
    }
    return false;
  };

  // Send browser notification
  const sendNotification = (title, body) => {
    if (canNotify && 'Notification' in window) {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'meeting-actions'
      });
    }
  };

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

    // Store the request data in case we switch to background processing
    processingDataRef.current = { title, transcript };

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

        // Send notification if processing was in background
        if (processingInBackground) {
          sendNotification(
            'Meeting processed!',
            `Extracted ${data.tasks.length} action items from "${data.meeting.title}"`
          );
        }
      } else {
        setError(data.error || 'Failed to process transcript');
        if (processingInBackground) {
          sendNotification('Processing failed', data.error || 'Failed to process transcript');
        }
      }
    } catch (err) {
      setError('Failed to process transcript');
      console.error(err);
      if (processingInBackground) {
        sendNotification('Processing failed', 'Failed to process transcript');
      }
    } finally {
      setIsProcessing(false);
      setProcessingInBackground(false);
      processingDataRef.current = null;
    }
  };

  // Handle switching to background processing
  const handleProcessInBackground = async () => {
    // Request notification permission if not already granted
    if (!canNotify) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        // Still allow background processing, just won't get notification
        console.log('Notifications not granted, continuing without');
      }
    }

    // Close modal and show skeletons
    setShowPasteModal(false);
    setProcessingInBackground(true);
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

  const handleEditTask = async (taskId, updatedData) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, ...updatedData } : t
    ));

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });

      const data = await response.json();
      if (data.success) {
        // Update with server response to get activity log
        setTasks(prev => prev.map(t =>
          t.id === taskId ? data.task : t
        ));
        // Update editingTask if it's the same task
        if (editingTask?.id === taskId) {
          setEditingTask(data.task);
        }
      }
    } catch (err) {
      console.error('Failed to update task:', err);
      fetchData(); // Refresh on error
    }
  };

  const handleAddComment = async (taskId, comment) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment, user: CURRENT_USER })
      });

      const data = await response.json();
      if (data.success) {
        // Update the task in state with new comment
        setTasks(prev => prev.map(t =>
          t.id === taskId ? data.task : t
        ));
        // Update editingTask to show new comment
        if (editingTask?.id === taskId) {
          setEditingTask(data.task);
        }
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const handleAddTask = async (taskData) => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTasks(prev => [data.task, ...prev]);
      } else {
        setError(data.error || 'Failed to add task');
      }
    } catch (err) {
      console.error('Failed to add task:', err);
      setError('Failed to add task');
    }
  };

  const handleColumnDrop = async (draggedColumnId, targetColumnId) => {
    if (draggedColumnId === targetColumnId) return;
    
    // Find indices
    const draggedIndex = columns.findIndex(c => c.id === draggedColumnId);
    const targetIndex = columns.findIndex(c => c.id === targetColumnId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder columns
    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);
    
    // Update order property
    const reorderedColumns = newColumns.map((col, idx) => ({ ...col, order: idx }));
    
    // Optimistic update
    setColumns(reorderedColumns);
    
    // Save to API
    try {
      await fetch('/api/columns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: reorderedColumns })
      });
    } catch (err) {
      console.error('Failed to reorder columns:', err);
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
    if (view === 'mine' && !isCurrentUser(t.owner)) return false;
    if (view === 'follow-ups' && t.type !== 'follow-up') return false;
    if (view === 'actions' && t.type !== 'action') return false;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const meeting = meetings.find(m => m.id === t.meetingId);

      const searchFields = [
        t.task,
        t.owner,
        t.person,
        t.context,
        meeting?.title,
        meeting?.participants?.join(' ')
      ].filter(Boolean).join(' ').toLowerCase();

      if (!searchFields.includes(query)) {
        return false;
      }
    }

    return true;
  });

  const stats = {
    total: tasks.filter(t => !t.archived).length,
    mine: tasks.filter(t => isCurrentUser(t.owner) && !t.archived).length,
    overdue: tasks.filter(t => new Date(t.dueDate) < new Date() && t.status !== 'done' && !t.archived).length,
    archived: tasks.filter(t => t.archived).length,
  };

  // Build column stats dynamically
  const columnStats = columns.sort((a, b) => a.order - b.order).map(col => ({
    ...col,
    count: tasks.filter(t => t.status === col.id && !t.archived).length
  }));

  // Color mapping for stats display
  const statColors = {
    slate: 'text-slate-800',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    purple: 'text-purple-600',
    rose: 'text-rose-600',
    indigo: 'text-indigo-600',
    teal: 'text-teal-600',
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
              {columnStats.map(col => (
                <div key={col.id} className="text-center">
                  <div className={`text-2xl font-bold ${statColors[col.color] || 'text-slate-800'}`}>{col.count}</div>
                  <div className="text-xs text-slate-500">{col.label}</div>
                </div>
              ))}
              {stats.overdue > 0 && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600">{stats.overdue}</div>
                  <div className="text-xs text-slate-500">Overdue</div>
                </div>
              )}
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
                disabled={(columnStats.find(c => c.id === 'done')?.count || 0) === 0}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Archive size={16} />
                Archive completed ({columnStats.find(c => c.id === 'done')?.count || 0})
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
            <div className="flex items-center gap-3">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                resultCount={filteredTasks.length}
              />
              <div className="w-px h-6 bg-slate-200" />
              <span className="text-sm text-slate-500">Show:</span>
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
              
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-2 px-3 py-1.5 rounded-full text-sm bg-indigo-100 text-indigo-700 font-medium flex items-center gap-1"
                >
                  "{searchQuery.slice(0, 15)}{searchQuery.length > 15 ? '...' : ''}"
                  <X size={14} />
                </button>
              )}

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
                  onEditTask={(task) => setEditingTask(task)}
                  onAddTask={(columnId) => setAddingToColumn(columnId)}
                  onColumnDragStart={(columnId) => setDraggingColumn(columnId)}
                  onColumnDragEnd={() => setDraggingColumn(null)}
                  onColumnDrop={handleColumnDrop}
                  isDraggingColumn={draggingColumn === column.id}
                  showSkeletons={processingInBackground}
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
        onProcessInBackground={handleProcessInBackground}
        canNotify={canNotify}
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
      
      <EditTaskModal
        isOpen={!!editingTask}
        task={editingTask}
        columns={columns}
        onClose={() => setEditingTask(null)}
        onSave={handleEditTask}
        onAddComment={handleAddComment}
      />
      
      <AddTaskModal
        isOpen={!!addingToColumn}
        columnId={addingToColumn}
        columns={columns}
        onClose={() => setAddingToColumn(null)}
        onSave={handleAddTask}
      />
    </div>
  );
}
