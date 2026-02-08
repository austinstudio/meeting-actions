import React, { useState, useEffect } from 'react';
import { X, Pencil, Tag, ListChecks, MessageSquare, History, CheckCircle2, RefreshCw, Send, Github, ExternalLink, Link, AlertTriangle } from 'lucide-react';
import { priorityColors, TAG_COLORS, PREDEFINED_TAGS } from '../constants';
import { TagBadge, SubtaskProgress } from './TaskCard';

export default function EditTaskModal({ isOpen, task, onClose, onSave, columns, onAddComment, githubStatus, onRefreshGithubStatus }) {
  const [formData, setFormData] = useState({
    task: '',
    owner: '',
    person: '',
    dueDate: '',
    priority: 'medium',
    type: 'action',
    context: '',
    status: 'todo',
    tags: [],
    subtasks: [],
    githubIssueUrl: null,
    githubIssueNumber: null
  });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [issueStatus, setIssueStatus] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Fetch GitHub issue status when issue exists
  useEffect(() => {
    if (!isOpen || !task?.githubIssueNumber) {
      setIssueStatus(null);
      return;
    }

    const fetchStatus = async () => {
      setIsLoadingStatus(true);
      try {
        const response = await fetch(`/api/github/issue-status?issueNumber=${task.githubIssueNumber}`);
        if (response.ok) {
          const data = await response.json();
          setIssueStatus(data);
        }
      } catch (error) {
        console.error('Failed to fetch issue status:', error);
      } finally {
        setIsLoadingStatus(false);
      }
    };

    fetchStatus();

    const interval = setInterval(() => {
      if (issueStatus?.status === 'pending' || issueStatus?.status === 'in-progress') {
        fetchStatus();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isOpen, task?.githubIssueNumber, issueStatus?.status]);

  useEffect(() => {
    if (task && isOpen) {
      const isNewTask = task.id !== currentTaskId;

      if (isNewTask) {
        setFormData({
          task: task.task || '',
          owner: task.owner || '',
          person: task.person || '',
          dueDate: task.dueDate || '',
          priority: task.priority || 'medium',
          type: task.type || 'action',
          context: task.context || '',
          status: task.status || 'todo',
          tags: task.tags || [],
          subtasks: task.subtasks || [],
          githubIssueUrl: task.githubIssueUrl || null,
          githubIssueNumber: task.githubIssueNumber || null
        });
        setActiveTab('details');
        setNewComment('');
        setNewTag('');
        setNewSubtask('');
        setCurrentTaskId(task.id);
      }
    }
  }, [task, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentTaskId(null);
    }
  }, [isOpen]);

  const addTag = (tag) => {
    const normalizedTag = tag.toLowerCase().trim().replace(/^#/, '');
    if (normalizedTag && !formData.tags.includes(normalizedTag)) {
      setFormData({ ...formData, tags: [...formData.tags, normalizedTag] });
    }
    setNewTag('');
  };

  const removeTag = (tagToRemove) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tagToRemove) });
  };

  const saveSubtasksUpdate = async (updatedSubtasks) => {
    const updatedFormData = { ...formData, subtasks: updatedSubtasks };
    setFormData(updatedFormData);
    await onSave(task.id, updatedFormData);
  };

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    const subtask = {
      id: `st_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: newSubtask.trim(),
      completed: false
    };
    setNewSubtask('');
    await saveSubtasksUpdate([...formData.subtasks, subtask]);
  };

  const toggleSubtask = async (subtaskId) => {
    const updatedSubtasks = formData.subtasks.map(st =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    await saveSubtasksUpdate(updatedSubtasks);
  };

  const removeSubtask = async (subtaskId) => {
    await saveSubtasksUpdate(formData.subtasks.filter(st => st.id !== subtaskId));
  };

  const startEditingSubtask = (subtask) => {
    setEditingSubtaskId(subtask.id);
    setEditingSubtaskText(subtask.text);
  };

  const saveSubtaskEdit = async () => {
    if (!editingSubtaskId) return;
    if (!editingSubtaskText.trim()) {
      await removeSubtask(editingSubtaskId);
    } else {
      const updatedSubtasks = formData.subtasks.map(st =>
        st.id === editingSubtaskId ? { ...st, text: editingSubtaskText.trim() } : st
      );
      await saveSubtasksUpdate(updatedSubtasks);
    }
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(task.id, formData);
    setIsSaving(false);
    onClose();
  };

  const handleMarkAsDone = async () => {
    setIsSaving(true);
    await onSave(task.id, { ...formData, status: 'done' });
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

    if (activity.type === 'created') {
      return activity.source ? `extracted from "${activity.source}"` : 'task created';
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
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-2xl h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col border border-transparent dark:border-neutral-600">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Edit Task</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-neutral-800 px-4 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'details'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <Pencil size={16} />
            Details
          </button>
          <button
            onClick={() => setActiveTab('tags')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'tags'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <Tag size={16} />
            Tags
            {formData.tags.length > 0 && (
              <span className="bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">
                {formData.tags.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('subtasks')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'subtasks'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <ListChecks size={16} />
            Subtasks
            {formData.subtasks.length > 0 && (
              <span className="bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">
                {formData.subtasks.filter(s => s.completed).length}/{formData.subtasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'comments'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <MessageSquare size={16} />
            Comments
            {comments.length > 0 && (
              <span className="bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">
                {comments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'activity'
                ? 'border-indigo-500 text-indigo-600 dark:text-orange-500'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200'
            }`}
          >
            <History size={16} />
            Activity
            {activity.length > 0 && (
              <span className="bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">
                {activity.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <form id="edit-task-form" onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Task Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={formData.task}
                  onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                  rows={2}
                  required
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none dark:bg-neutral-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Owner / Assigned To
                </label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Me, John, Sarah, etc."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                  >
                    <option value="action">Action</option>
                    <option value="follow-up">Follow-up</option>
                    <option value="enhancement">Enhancement</option>
                    <option value="bug">Bug</option>
                  </select>
                </div>
                {formData.type === 'follow-up' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                      Follow-up With
                    </label>
                    <input
                      type="text"
                      value={formData.person}
                      onChange={(e) => setFormData({ ...formData, person: e.target.value })}
                      placeholder="Person name"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                >
                  {columns.map(col => (
                    <option key={col.id} value={col.id}>{col.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Context / Notes
                </label>
                <textarea
                  value={formData.context}
                  onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                  rows={3}
                  placeholder="Additional context about this task..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none dark:bg-neutral-950 dark:text-white"
                />
              </div>

              {/* GitHub Integration */}
              {(formData.type === 'enhancement' || formData.type === 'bug') && (
                <div className="border border-slate-200 dark:border-neutral-700 rounded-lg p-4 bg-slate-50 dark:bg-neutral-900/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Github size={18} className="text-slate-600 dark:text-neutral-400" />
                    <span className="font-medium text-slate-700 dark:text-neutral-300">GitHub Integration</span>
                  </div>

                  {formData.githubIssueUrl ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {isLoadingStatus ? (
                          <RefreshCw size={16} className="text-slate-400 animate-spin" />
                        ) : issueStatus?.status === 'success' ? (
                          <CheckCircle2 size={16} className="text-emerald-500" />
                        ) : issueStatus?.status === 'in-progress' || issueStatus?.status === 'pending' ? (
                          <RefreshCw size={16} className="text-blue-500 animate-spin" />
                        ) : issueStatus?.status === 'needs-approval' ? (
                          <AlertTriangle size={16} className="text-amber-500" />
                        ) : issueStatus?.status === 'failed' ? (
                          <X size={16} className="text-rose-500" />
                        ) : (
                          <Github size={16} className="text-slate-400" />
                        )}
                        <span className="text-sm text-slate-600 dark:text-neutral-400">
                          Issue #{formData.githubIssueNumber}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          issueStatus?.status === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                          issueStatus?.status === 'in-progress' || issueStatus?.status === 'pending' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                          issueStatus?.status === 'needs-approval' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                          issueStatus?.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                          'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}>
                          {issueStatus?.statusMessage || 'Checking...'}
                        </span>
                      </div>

                      {issueStatus?.status === 'needs-approval' && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 p-2 rounded">
                          This change needs new dependencies. Add the <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">allow-deps</code> label on GitHub to proceed.
                        </p>
                      )}

                      <a
                        href={formData.githubIssueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-200 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-lg hover:bg-slate-300 dark:hover:bg-neutral-700 transition-colors"
                      >
                        View on GitHub
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  ) : githubStatus?.connected ? (
                    <div>
                      <p className="text-sm text-slate-500 dark:text-neutral-500 mb-2">
                        Connected as <span className="font-medium text-slate-700 dark:text-neutral-300">@{githubStatus.username}</span>
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsCreatingIssue(true);
                          try {
                            const response = await fetch('/api/github/create-issue', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                task: formData.task,
                                owner: formData.owner,
                                dueDate: formData.dueDate,
                                priority: formData.priority,
                                type: formData.type,
                                context: formData.context,
                              }),
                            });
                            const data = await response.json();
                            if (data.success) {
                              setFormData({
                                ...formData,
                                githubIssueUrl: data.issueUrl,
                                githubIssueNumber: data.issueNumber,
                              });
                              await onSave(task.id, {
                                ...formData,
                                githubIssueUrl: data.issueUrl,
                                githubIssueNumber: data.issueNumber,
                              });
                            } else {
                              alert('Failed to create issue: ' + (data.error || 'Unknown error'));
                            }
                          } catch (error) {
                            console.error('Create issue error:', error);
                            alert('Failed to create issue');
                          } finally {
                            setIsCreatingIssue(false);
                          }
                        }}
                        disabled={isCreatingIssue || !formData.task.trim()}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-neutral-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isCreatingIssue ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Github size={16} />
                            Create GitHub Issue
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-slate-500 dark:text-neutral-500 mb-3">
                        Connect your GitHub account to create issues directly.
                      </p>
                      <a
                        href="/api/github/connect"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-neutral-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-neutral-600 transition-colors"
                      >
                        <Link size={16} />
                        Connect GitHub
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-between pt-2">
                {formData.status !== 'done' ? (
                  <button
                    type="button"
                    disabled={!formData.task.trim() || isSaving}
                    onClick={handleMarkAsDone}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    Mark as Done
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium"
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
              </div>
            </form>
          )}

          {/* Tags Tab */}
          {activeTab === 'tags' && (
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-2">
                  Quick Add Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      disabled={formData.tags.includes(tag)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        formData.tags.includes(tag)
                          ? 'bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border-slate-200 dark:border-neutral-700 cursor-not-allowed'
                          : `${TAG_COLORS[tag]?.bg || TAG_COLORS.default.bg} ${TAG_COLORS[tag]?.text || TAG_COLORS.default.text} ${TAG_COLORS[tag]?.border || TAG_COLORS.default.border} hover:opacity-80`
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Add Custom Tag
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(newTag);
                      }
                    }}
                    placeholder="Type a tag name..."
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => addTag(newTag)}
                    disabled={!newTag.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-2">
                  Current Tags ({formData.tags.length})
                </label>
                {formData.tags.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-neutral-500 italic">No tags added yet</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map(tag => (
                      <TagBadge key={tag} tag={tag} onRemove={removeTag} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Subtasks Tab */}
          {activeTab === 'subtasks' && (
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                  Add Subtask
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSubtask();
                      }
                    }}
                    placeholder="Enter subtask..."
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={addSubtask}
                    disabled={!newSubtask.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {formData.subtasks.length > 0 && (
                <div className="mb-4">
                  <SubtaskProgress subtasks={formData.subtasks} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-2">
                  Subtasks ({formData.subtasks.length})
                </label>
                {formData.subtasks.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-neutral-500 italic">No subtasks added yet</p>
                ) : (
                  <div className="space-y-2">
                    {formData.subtasks.map(subtask => (
                      <div
                        key={subtask.id}
                        className={`flex items-center gap-3 p-2 rounded-lg border ${
                          subtask.completed
                            ? 'bg-slate-50 dark:bg-neutral-900 border-slate-200 dark:border-neutral-800'
                            : 'bg-white dark:bg-neutral-950 border-slate-200 dark:border-neutral-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSubtask(subtask.id)}
                          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            subtask.completed
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-slate-300 dark:border-neutral-700 hover:border-emerald-500'
                          }`}
                        >
                          {subtask.completed && <CheckCircle2 size={12} />}
                        </button>
                        {editingSubtaskId === subtask.id ? (
                          <input
                            type="text"
                            value={editingSubtaskText}
                            onChange={(e) => setEditingSubtaskText(e.target.value)}
                            onBlur={saveSubtaskEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveSubtaskEdit();
                              } else if (e.key === 'Escape') {
                                setEditingSubtaskId(null);
                                setEditingSubtaskText('');
                              }
                            }}
                            autoFocus
                            className="flex-1 text-sm px-2 py-1 border border-indigo-300 dark:border-indigo-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-white"
                          />
                        ) : (
                          <span
                            onClick={() => startEditingSubtask(subtask)}
                            className={`flex-1 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-neutral-800 px-2 py-1 rounded ${subtask.completed ? 'text-slate-400 dark:text-neutral-500 line-through' : 'text-slate-700 dark:text-neutral-300'}`}
                          >
                            {subtask.text}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSubtask(subtask.id)}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && (
            <div className="p-4 flex flex-col h-full">
              <div className="mb-4">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment... (use @name to mention someone)"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm dark:bg-neutral-950 dark:text-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          handleAddComment();
                        }
                      }}
                    />
                    <div className="absolute right-2 bottom-2 text-xs text-slate-400 dark:text-neutral-500">
                      {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to send
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

              <div className="flex-1 overflow-y-auto space-y-3">
                {comments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                    <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No comments yet</p>
                    <p className="text-xs mt-1">Add a comment to keep track of updates</p>
                  </div>
                ) : (
                  [...comments].reverse().map(comment => (
                    <div key={comment.id} className="bg-slate-50 dark:bg-neutral-950 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{comment.user}</span>
                        <span className="text-xs text-slate-400 dark:text-neutral-500">{formatTimestamp(comment.timestamp)}</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-neutral-300">{renderCommentText(comment.text)}</p>
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
                <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                  <History size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Changes to this task will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...activity].reverse().map(item => (
                    <div key={item.id} className="flex gap-3 text-sm">
                      <div className="flex-shrink-0 w-8 h-8 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center">
                        {item.type === 'comment' ? (
                          <MessageSquare size={14} className="text-slate-500 dark:text-neutral-400" />
                        ) : (
                          <History size={14} className="text-slate-500 dark:text-neutral-400" />
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-slate-600 dark:text-neutral-300">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{item.user}</span>
                          {' '}{getActivityDescription(item)}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">{formatTimestamp(item.timestamp)}</p>
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
