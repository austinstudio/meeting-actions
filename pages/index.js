import React, { useState, useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { Calendar, Clock, CheckCircle2, RefreshCw, Plus, FileText, X, Users, Trash2, Archive, Pencil, Search, Sparkles, Bell, History, Sun, Moon, Monitor, Tag, Rows3, Rows4, LayoutList, PanelLeftClose, PanelLeft, Menu, SlidersHorizontal, Gift, Bot, Github, Unlink } from 'lucide-react';
import { APP_VERSION, FEATURES, getNewFeatures, getAllFeatures } from '../lib/features';

import { DEFAULT_COLUMNS, COLUMN_COLORS, priorityColors, PREDEFINED_TAGS, isCurrentUser } from '../components/constants';
import Column from '../components/task/Column';
import MeetingCard from '../components/meeting/MeetingCard';
import EditMeetingModal from '../components/meeting/EditMeetingModal';
import TranscriptModal from '../components/meeting/TranscriptModal';
import ImportHistoryModal from '../components/meeting/ImportHistoryModal';
import PasteModal from '../components/meeting/PasteModal';
import EditTaskModal from '../components/task/EditTaskModal';
import AddTaskModal from '../components/task/AddTaskModal';
import AskAIModal from '../components/ai/AskAIModal';
import SmartSuggestionsBar from '../components/ai/SmartSuggestionsBar';
// PeopleGlossaryModal removed — replaced by /contacts page
import WhatsNewModal from '../components/ui/WhatsNewModal';
import ConfirmModal from '../components/ui/ConfirmModal';
import AddColumnModal from '../components/ui/AddColumnModal';
import FilterDropdown from '../components/ui/FilterDropdown';
import MobileFilterSheet from '../components/ui/MobileFilterSheet';
import SearchInput from '../components/ui/SearchInput';
import useIsMobile from '../hooks/useIsMobile';
import MobileTriage from '../components/mobile/MobileTriage';
import MobileBoard from '../components/mobile/MobileBoard';

export default function MeetingKanban() {
  const { data: session } = useSession();
  const currentUser = session?.user?.name?.split(' ')[0] || 'User';
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [view, setView] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showEmptyMeetings, setShowEmptyMeetings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState(null);
  const [error, setError] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });
  const [editingTask, setEditingTask] = useState(null);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [viewingTranscript, setViewingTranscript] = useState(null);
  const [addingToColumn, setAddingToColumn] = useState(null);
  const [draggingColumn, setDraggingColumn] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingInBackground, setProcessingInBackground] = useState(false);
  const [canNotify, setCanNotify] = useState(false);
  const processingDataRef = useRef(null);

  // New state for features
  const [theme, setTheme] = useState('system'); // 'light', 'dark', 'system'
  const [tagFilter, setTagFilter] = useState([]); // Array of tags to filter by
  const [dueDateFilter, setDueDateFilter] = useState(null); // 'overdue', 'today', 'this-week', 'upcoming', null
  const [viewDensity, setViewDensity] = useState('normal'); // 'compact', 'normal', 'spacious'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Collapsible sidebar
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Mobile sidebar drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false); // Mobile filter sheet
  const [showImportHistory, setShowImportHistory] = useState(false); // Import history modal
  // showGlossary removed — replaced by /contacts page
  const [showWhatsNew, setShowWhatsNew] = useState(false); // What's New modal
  const [newFeatures, setNewFeatures] = useState([]); // Features to display in What's New
  const [showAllFeatures, setShowAllFeatures] = useState(false); // Show all features vs just new
  const [showAskAI, setShowAskAI] = useState(false); // AI Assistant modal
  const [githubStatus, setGithubStatus] = useState(null); // GitHub connection status
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState('triage'); // 'triage' | 'board'

  // Fetch GitHub connection status
  const fetchGithubStatus = async () => {
    try {
      const response = await fetch('/api/github/status');
      if (response.ok) {
        const data = await response.json();
        setGithubStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch GitHub status:', error);
    }
  };

  // Check for GitHub connection result from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('github_connected') === 'true') {
      fetchGithubStatus();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('github_error')) {
      console.error('GitHub connection error:', params.get('github_error'));
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Fetch GitHub status on mount
  useEffect(() => {
    if (session) {
      fetchGithubStatus();
    }
  }, [session]);

  // Initialize theme from localStorage and system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    const savedDensity = localStorage.getItem('viewDensity') || 'normal';
    const savedSidebarState = localStorage.getItem('sidebarCollapsed') === 'true';
    setTheme(savedTheme);
    setViewDensity(savedDensity);
    setSidebarCollapsed(savedSidebarState);

    // Apply theme
    applyTheme(savedTheme);

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (savedTheme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);

    // Keyboard shortcut for sidebar toggle (Cmd/Ctrl + B)
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => {
          const newState = !prev;
          localStorage.setItem('sidebarCollapsed', String(newState));
          return newState;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const applyTheme = (themeValue) => {
    const isDark = themeValue === 'dark' ||
      (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  const changeViewDensity = (density) => {
    setViewDensity(density);
    localStorage.setItem('viewDensity', density);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebarCollapsed', String(newState));
      return newState;
    });
  };

  // Check for overdue tasks and send notification on page load
  useEffect(() => {
    const lastNotified = localStorage.getItem('lastOverdueNotification');
    const today = new Date().toDateString();

    if (lastNotified !== today && tasks.length > 0) {
      const overdueTasks = tasks.filter(t => {
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return dueDate < now && t.status !== 'done' && !t.archived && !t.deleted;
      });

      if (overdueTasks.length > 0 && canNotify) {
        sendNotification(
          'Overdue Tasks',
          `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} that need attention.`
        );
        localStorage.setItem('lastOverdueNotification', today);
      }
    }
  }, [tasks, canNotify]);

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
      setLastSynced(new Date());
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

  // Check for new features on mount
  useEffect(() => {
    const checkNewFeatures = async () => {
      try {
        const response = await fetch('/api/user-preferences');
        if (!response.ok) return;

        const data = await response.json();
        const features = getNewFeatures(data.lastSeenVersion);

        if (features.length > 0) {
          setNewFeatures(features);
          setShowWhatsNew(true);
        }
      } catch (err) {
        console.error('Failed to check for new features:', err);
      }
    };

    checkNewFeatures();
  }, []);

  // Handle What's New modal dismiss
  const handleWhatsNewDismiss = async () => {
    setShowWhatsNew(false);
    setShowAllFeatures(false);

    // Only update lastSeenVersion if we were showing new features (not release history)
    if (!showAllFeatures) {
      try {
        await fetch('/api/user-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastSeenVersion: APP_VERSION })
        });
      } catch (err) {
        console.error('Failed to update last seen version:', err);
      }
    }
  };

  // Open release history modal
  const handleShowReleaseHistory = () => {
    setNewFeatures(getAllFeatures());
    setShowAllFeatures(true);
    setShowWhatsNew(true);
  };

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

  // Bulk import handler - processes multiple files sequentially
  const handleBulkSubmit = async (files) => {
    setIsProcessing(true);
    setProcessingInBackground(true); // Auto-enable background mode for bulk
    setShowPasteModal(false);
    setError(null);

    let successCount = 0;
    let totalTasks = 0;

    for (const file of files) {
      try {
        const response = await fetch('/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: file.transcript,
            title: file.title,
            date: new Date().toISOString().split('T')[0]
          })
        });

        const data = await response.json();

        if (data.success) {
          setMeetings(prev => [data.meeting, ...prev]);
          setTasks(prev => [...data.tasks, ...prev]);
          successCount++;
          totalTasks += data.tasks.length;
        }
      } catch (err) {
        console.error(`Failed to process ${file.title}:`, err);
      }
    }

    setIsProcessing(false);
    setProcessingInBackground(false);

    // Send completion notification
    if (canNotify) {
      sendNotification(
        'Bulk import complete!',
        `Processed ${successCount}/${files.length} files, extracted ${totalTasks} action items`
      );
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

  const handleDrop = async (taskId, newStatus, targetIndex) => {
    // Get tasks in the target column, sorted by current order
    const columnTasks = tasks
      .filter(t => t.status === newStatus && t.id !== taskId && !t.deleted)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
      });

    // Insert at target position
    const updatedTasks = [...columnTasks];
    const movingTask = tasks.find(t => t.id === taskId);
    if (targetIndex !== undefined && targetIndex >= 0) {
      updatedTasks.splice(targetIndex, 0, { ...movingTask, status: newStatus });
    } else {
      updatedTasks.push({ ...movingTask, status: newStatus });
    }

    // Recalculate order values
    const updates = updatedTasks.map((t, idx) => ({ id: t.id, order: idx }));

    // Optimistic update
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newOrder = updates.find(u => u.id === taskId)?.order ?? t.order;
        return { ...t, status: newStatus, order: newOrder };
      }
      const orderUpdate = updates.find(u => u.id === t.id);
      if (orderUpdate) {
        return { ...t, order: orderUpdate.order };
      }
      return t;
    }));

    try {
      // Update the dragged task's status
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, order: updates.find(u => u.id === taskId)?.order })
      });

      // Bulk update order for all tasks in the column
      if (updates.length > 1) {
        await fetch('/api/tasks/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reorder', updates })
        });
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handlePinTask = async (taskId, pinned) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, pinned, pinnedAt: pinned ? new Date().toISOString() : null } : t
    ));

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned })
      });
    } catch (err) {
      console.error('Failed to pin task:', err);
      fetchData();
    }
  };

  const handleDeleteTask = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setConfirmModal({
      isOpen: true,
      title: 'Delete Task',
      message: `Are you sure you want to delete this task?`,
      subMessage: task.task?.slice(0, 100) + (task.task?.length > 100 ? '...' : ''),
      confirmLabel: 'Move to Trash',
      onConfirm: async () => {
        // Optimistic update - mark as deleted
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, deleted: true, deletedAt: new Date().toISOString() } : t
        ));

        setConfirmModal({ isOpen: false });

        try {
          await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permanent: false })
          });
        } catch (err) {
          console.error('Failed to delete task:', err);
          fetchData();
        }
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    });
  };

  const handleRestoreTask = async (taskId) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, deleted: false, deletedAt: null } : t
    ));

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true })
      });
    } catch (err) {
      console.error('Failed to restore task:', err);
      fetchData();
    }
  };

  const handlePermanentDelete = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setConfirmModal({
      isOpen: true,
      title: 'Permanently Delete',
      message: 'This will permanently delete the task. This action cannot be undone.',
      subMessage: task.task?.slice(0, 100) + (task.task?.length > 100 ? '...' : ''),
      confirmLabel: 'Delete Forever',
      onConfirm: async () => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setConfirmModal({ isOpen: false });

        try {
          await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permanent: true })
          });
        } catch (err) {
          console.error('Failed to permanently delete task:', err);
          fetchData();
        }
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    });
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
        body: JSON.stringify({ comment, user: currentUser })
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

  const handleUpdateMeeting = async (meetingId, updates) => {
    // Optimistic update
    setMeetings(prev => prev.map(m =>
      m.id === meetingId ? { ...m, ...updates } : m
    ));

    try {
      const response = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to update meeting');
      }
    } catch (err) {
      console.error('Failed to update meeting:', err);
      fetchData(); // Revert on error
    }
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

  const handleSortColumn = async (columnId) => {
    // Get all non-deleted tasks in this column
    const columnTasks = tasks.filter(t => t.status === columnId && !t.deleted && !t.archived);

    if (columnTasks.length === 0) return;

    // Sort tasks by: 1) pinned, 2) priority (high > medium > low), 3) due date (earliest first)
    const priorityMap = { high: 0, medium: 1, low: 2 };

    const sortedTasks = [...columnTasks].sort((a, b) => {
      // Pinned tasks first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // Then by priority
      const priorityA = priorityMap[a.priority] ?? 1;
      const priorityB = priorityMap[b.priority] ?? 1;
      if (priorityA !== priorityB) return priorityA - priorityB;

      // Then by due date (earliest first, tasks without dates go to end)
      const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return dateA - dateB;
    });

    // Calculate new order values
    const updates = sortedTasks.map((task, index) => ({
      id: task.id,
      order: index
    }));

    // Optimistic update
    setTasks(prev => prev.map(t => {
      const update = updates.find(u => u.id === t.id);
      if (update) {
        return { ...t, order: update.order };
      }
      return t;
    }));

    try {
      // Bulk update order
      await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', updates })
      });
    } catch (err) {
      console.error('Failed to reorder tasks:', err);
      fetchData(); // Refresh on error
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
    // Trash filter - if viewing trash, only show deleted tasks
    if (showTrash) {
      return t.deleted === true;
    }

    // Exclude deleted tasks from normal views
    if (t.deleted) return false;

    // Archived filter
    if (!showArchived && t.archived) return false;
    if (showArchived && !t.archived) return false;

    // Meeting filter
    if (selectedMeeting && t.meetingId !== selectedMeeting) return false;

    // Type/owner filters
    if (view === 'mine' && !isCurrentUser(t.owner, currentUser)) return false;
    if (view === 'follow-ups' && t.type !== 'follow-up') return false;
    if (view === 'actions' && t.type !== 'action') return false;

    // Tag filter
    if (tagFilter.length > 0) {
      const taskTags = t.tags || [];
      if (!tagFilter.some(tag => taskTags.includes(tag))) {
        return false;
      }
    }

    // Due date filter
    if (dueDateFilter) {
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      switch (dueDateFilter) {
        case 'overdue':
          if (dueDate >= today || t.status === 'done') return false;
          break;
        case 'today':
          if (dueDate.getTime() !== today.getTime()) return false;
          break;
        case 'this-week':
          if (dueDate < today || dueDate > nextWeek) return false;
          break;
        case 'upcoming':
          if (dueDate < today) return false;
          break;
      }
    }

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
        meeting?.participants?.join(' '),
        ...(t.tags || [])
      ].filter(Boolean).join(' ').toLowerCase();

      if (!searchFields.includes(query)) {
        return false;
      }
    }

    return true;
  });

  const unfiledTasks = tasks.filter(t => t.status === 'uncategorized' && !t.deleted && !t.archived);

  // Auto-switch to board when no unfiled tasks on mobile
  useEffect(() => {
    if (isMobile && mobileView === 'triage' && unfiledTasks.length === 0) {
      setMobileView('board');
    }
  }, [isMobile, unfiledTasks.length, mobileView]);

  const stats = {
    total: tasks.filter(t => !t.archived && !t.deleted).length,
    mine: tasks.filter(t => isCurrentUser(t.owner, currentUser) && !t.archived && !t.deleted).length,
    overdue: tasks.filter(t => new Date(t.dueDate) < new Date() && t.status !== 'done' && !t.archived && !t.deleted).length,
    archived: tasks.filter(t => t.archived && !t.deleted).length,
    trash: tasks.filter(t => t.deleted).length,
  };

  // Build column stats dynamically
  const columnStats = columns.sort((a, b) => a.order - b.order).map(col => ({
    ...col,
    count: tasks.filter(t => t.status === col.id && !t.archived && !t.deleted).length
  }));

  // Color mapping for stats display
  const statColors = {
    slate: 'text-slate-800 dark:text-neutral-200',
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    purple: 'text-purple-600 dark:text-purple-400',
    rose: 'text-rose-600 dark:text-rose-400',
    indigo: 'text-indigo-600 dark:text-orange-500',
    teal: 'text-teal-600 dark:text-teal-400',
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800 px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg md:hidden"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Meeting Actions</h1>
              <p className="text-sm text-slate-500 dark:text-neutral-400 mt-0.5 hidden md:block">Extract and track action items from your meetings</p>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-6">
            {/* Refresh with last synced */}
            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                className="p-2 text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title={lastSynced ? `Last synced: ${lastSynced.toLocaleTimeString()}` : 'Refresh'}
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
              {lastSynced && (
                <div className="text-xs text-slate-400 dark:text-neutral-500 hidden lg:block">
                  <div className="text-[10px] uppercase tracking-wide">Last Updated</div>
                  <div>{lastSynced.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                </div>
              )}
            </div>

            {/* Divider - hidden on mobile */}
            <div className="w-px h-10 bg-slate-200 dark:bg-neutral-800 hidden lg:block" />

            {/* Stats - hidden on mobile, show on lg+ */}
            <div className="hidden lg:flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600 dark:text-orange-500">{stats.mine}</div>
                <div className="text-xs text-slate-500 dark:text-neutral-400">My Tasks</div>
              </div>
              {columnStats.map(col => (
                <div key={col.id} className="text-center">
                  <div className={`text-2xl font-bold ${statColors[col.color] || 'text-slate-800 dark:text-slate-200'}`}>{col.count}</div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400">{col.label}</div>
                </div>
              ))}
              {stats.overdue > 0 && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.overdue}</div>
                  <div className="text-xs text-slate-500 dark:text-neutral-400">Overdue</div>
                </div>
              )}
            </div>

            {/* User Menu */}
            {session && (
              <div className="relative group">
                <button
                  className="flex items-center gap-2 p-1.5 text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                  title={session.user?.email}
                >
                  {session.user?.image ? (
                    <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-orange-500/20 flex items-center justify-center text-sm font-medium text-indigo-600 dark:text-orange-500">
                      {session.user?.email?.[0].toUpperCase()}
                    </div>
                  )}
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[240px]">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="text-sm font-medium text-slate-700 dark:text-neutral-200 truncate">{session.user?.name || 'User'}</div>
                    <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">{session.user?.email}</div>
                  </div>

                  {/* Theme Options */}
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="text-xs text-slate-400 dark:text-neutral-500 mb-1.5">Theme</div>
                    <div className="flex gap-1">
                      {[
                        { id: 'light', icon: Sun },
                        { id: 'dark', icon: Moon },
                        { id: 'system', icon: Monitor },
                      ].map(option => (
                        <button
                          key={option.id}
                          onClick={() => changeTheme(option.id)}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded ${theme === option.id ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-500' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                          title={option.id.charAt(0).toUpperCase() + option.id.slice(1)}
                        >
                          <option.icon size={14} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* View Density Options */}
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="text-xs text-slate-400 dark:text-neutral-500 mb-1.5">Card Density</div>
                    <div className="flex gap-1">
                      {[
                        { id: 'compact', icon: Rows4 },
                        { id: 'normal', icon: Rows3 },
                        { id: 'spacious', icon: LayoutList },
                      ].map(option => (
                        <button
                          key={option.id}
                          onClick={() => changeViewDensity(option.id)}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded ${viewDensity === option.id ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-500' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                          title={option.id.charAt(0).toUpperCase() + option.id.slice(1)}
                        >
                          <option.icon size={14} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* What's New Link */}
                  <button
                    onClick={handleShowReleaseHistory}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 border-b border-slate-200 dark:border-neutral-800"
                  >
                    <Gift size={16} />
                    What's New
                  </button>

                  {/* GitHub Connection */}
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-neutral-300">
                        <Github size={16} title="GitHub Integration" />
                        {githubStatus?.connected ? (
                          <span>@{githubStatus.username}</span>
                        ) : (
                          <span>GitHub</span>
                        )}
                      </div>
                      {githubStatus?.connected ? (
                        <button
                          onClick={async () => {
                            if (confirm('Disconnect your GitHub account?')) {
                              try {
                                await fetch('/api/github/status', { method: 'DELETE' });
                                fetchGithubStatus();
                              } catch (error) {
                                console.error('Failed to disconnect GitHub:', error);
                              }
                            }
                          }}
                          className="p-1 text-slate-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-slate-100 dark:hover:bg-neutral-800"
                          title="Disconnect GitHub"
                        >
                          <Unlink size={14} />
                        </button>
                      ) : (
                        <a
                          href="/api/github/connect"
                          className="text-xs text-indigo-600 dark:text-orange-500 hover:text-indigo-700 dark:hover:text-orange-400"
                        >
                          Connect
                        </a>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 rounded-b-lg"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex pb-20">
        {/* Mobile sidebar backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar - drawer on mobile, fixed on desktop */}
        <aside className={`
          ${sidebarCollapsed ? 'md:w-16' : 'md:w-80'}
          fixed md:relative inset-y-0 left-0 z-50 md:z-auto
          w-64
          transform ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          border-r border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950
          h-full md:h-[calc(100vh-93px)]
          transition-all duration-300 ease-in-out flex flex-col overflow-hidden
        `}>
          {sidebarCollapsed ? (
            /* Collapsed Sidebar */
            <div className="flex flex-col items-center gap-2 p-2 pt-4">
              {/* Expand button */}
              <button
                onClick={toggleSidebar}
                className="p-2 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title="Expand sidebar (⌘B)"
              >
                <PanelLeft size={20} />
              </button>

              {/* Add Meeting Button - Icon only */}
              <button
                onClick={() => setShowPasteModal(true)}
                className="w-10 h-10 flex items-center justify-center border border-emerald-600 dark:border-orange-500 text-emerald-600 dark:text-orange-500 rounded-lg hover:bg-emerald-50 dark:hover:bg-orange-500/10 transition-colors"
                title="Add Meeting Transcript"
              >
                <Plus size={18} />
              </button>

              {/* Meetings count badge */}
              <button
                onClick={toggleSidebar}
                className="w-10 h-10 flex flex-col items-center justify-center text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title={`${meetings.length} meetings - Click to expand`}
              >
                <FileText size={16} />
                <span className="text-[10px] mt-0.5">{meetings.length}</span>
              </button>

              {/* Import History Button */}
              <button
                onClick={() => setShowImportHistory(true)}
                className="w-10 h-10 flex items-center justify-center text-slate-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title="Import History"
              >
                <History size={16} />
              </button>

              {/* Contacts Link */}
              <a
                href="/contacts"
                className="w-10 h-10 flex items-center justify-center text-slate-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                title="Contacts"
              >
                <Users size={16} />
              </a>

              {/* Divider */}
              <div className="w-8 h-px bg-slate-200 dark:bg-neutral-800 my-1" />

              {/* Archive button */}
              <button
                onClick={() => {
                  setShowArchived(!showArchived);
                  if (showTrash) setShowTrash(false);
                }}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors ${showArchived ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                title={showArchived ? 'Show active tasks' : `View archived (${stats.archived})`}
              >
                <Archive size={16} />
                {stats.archived > 0 && <span className="text-[10px] mt-0.5">{stats.archived}</span>}
              </button>

              {/* Trash button */}
              <button
                onClick={() => {
                  setShowTrash(!showTrash);
                  if (showArchived) setShowArchived(false);
                }}
                className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors ${showTrash ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                title={showTrash ? 'Back to tasks' : `View trash (${stats.trash})`}
              >
                <Trash2 size={16} />
                {stats.trash > 0 && <span className="text-[10px] mt-0.5">{stats.trash}</span>}
              </button>
            </div>
          ) : (
            /* Expanded Sidebar */
            <div className="flex-1 flex flex-col min-h-0">
              {/* Fixed Header Section */}
              <div className="px-4 pt-4 pb-2 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  {/* Mobile close button */}
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors md:hidden"
                  >
                    <X size={18} />
                  </button>
                  <h2 className="font-semibold text-slate-700 dark:text-slate-200">Meetings</h2>
                  <button
                    onClick={() => { setShowPasteModal(true); setMobileMenuOpen(false); }}
                    className="flex items-center gap-1 px-2 py-1 text-xs border border-emerald-600 dark:border-orange-500 text-emerald-600 dark:text-orange-500 rounded-md font-medium hover:bg-emerald-50 dark:hover:bg-orange-500/10 transition-colors"
                    title="Add Meeting Transcript"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                  <button
                    onClick={() => { setShowImportHistory(true); setMobileMenuOpen(false); }}
                    className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                    title="Import History"
                  >
                    <History size={16} />
                  </button>
                  <a
                    href="/contacts"
                    className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                    title="Contacts"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Users size={16} />
                  </a>
                  <div className="flex-1" />
                  <button
                    onClick={toggleSidebar}
                    className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors hidden md:block"
                    title="Collapse sidebar (⌘B)"
                  >
                    <PanelLeftClose size={18} />
                  </button>
                </div>

                <button
                  onClick={() => { setSelectedMeeting(null); setMobileMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedMeeting ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium' : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                >
                  All Meetings ({meetings.length})
                </button>
              </div>

              {/* Scrollable Meetings List */}
              <div className="flex-1 overflow-y-auto px-4 min-h-0">
                {loading && meetings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                    <p className="text-sm">Loading...</p>
                  </div>
                ) : meetings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm mb-2">No meetings yet</p>
                    <p className="text-xs">Click "Add Meeting Transcript" to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2 pb-2">
                    {meetings
                      .map(meeting => {
                        const meetingTasks = tasks.filter(t => t.meetingId === meeting.id && !t.archived && !t.deleted);
                        return {
                          ...meeting,
                          taskCount: meetingTasks.length,
                          uncategorizedCount: meetingTasks.filter(t => t.status === 'uncategorized').length
                        };
                      })
                      .filter(meeting => showEmptyMeetings || meeting.taskCount > 0)
                      .map(meeting => (
                        <MeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          taskCount={meeting.taskCount}
                          isSelected={selectedMeeting === meeting.id}
                          onClick={() => { setSelectedMeeting(meeting.id === selectedMeeting ? null : meeting.id); setMobileMenuOpen(false); }}
                          onDelete={handleDeleteMeeting}
                          onEdit={setEditingMeeting}
                          onViewTranscript={setViewingTranscript}
                          isEmpty={meeting.taskCount === 0}
                          hasUncategorized={meeting.uncategorizedCount > 0}
                        />
                      ))}
                    {/* Show empty meetings toggle */}
                    {meetings.some(m => tasks.filter(t => t.meetingId === m.id && !t.archived && !t.deleted).length === 0) && (
                      <button
                        onClick={() => setShowEmptyMeetings(!showEmptyMeetings)}
                        className="w-full text-xs text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-slate-400 py-2 flex items-center justify-center gap-1"
                      >
                        {showEmptyMeetings ? (
                          <>Hide empty meetings</>
                        ) : (
                          <>Show {meetings.filter(m => tasks.filter(t => t.meetingId === m.id && !t.archived && !t.deleted).length === 0).length} empty meetings</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Fixed Bottom Section - Archive & Trash */}
              <div className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 space-y-1">
                <button
                  onClick={handleArchiveDone}
                  disabled={(columnStats.find(c => c.id === 'done')?.count || 0) === 0}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Archive size={16} />
                  Archive completed ({columnStats.find(c => c.id === 'done')?.count || 0})
                </button>
                <button
                  onClick={() => {
                    setShowArchived(!showArchived);
                    if (showTrash) setShowTrash(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg ${showArchived ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                >
                  <FileText size={16} />
                  {showArchived ? 'Show active tasks' : `View archived${stats.archived > 0 ? ` (${stats.archived})` : ''}`}
                </button>
                <button
                  onClick={() => {
                    setShowTrash(!showTrash);
                    if (showArchived) setShowArchived(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg ${showTrash ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                >
                  <Trash2 size={16} />
                  {showTrash ? 'Back to tasks' : `View trash${stats.trash > 0 ? ` (${stats.trash})` : ''}`}
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className={`flex-1 h-[calc(100vh-73px)] md:h-[calc(100vh-93px)] flex flex-col ${isMobile ? '' : 'p-3 md:p-6 overflow-x-auto'}`}>
          {isMobile ? (
            mobileView === 'triage' && unfiledTasks.length > 0 ? (
              <MobileTriage
                tasks={unfiledTasks}
                columns={columns}
                meetings={meetings}
                onAssign={handleDrop}
                onDelete={handleDeleteTask}
                onViewBoard={() => setMobileView('board')}
                onEditTask={handleEditTask}
              />
            ) : (
              <MobileBoard
                tasks={filteredTasks}
                columns={columns}
                meetings={meetings}
                onEditTask={(task) => setEditingTask(task)}
                onViewTriage={() => setMobileView('triage')}
                unfiledCount={unfiledTasks.length}
              />
            )
          ) : (
          <>
          {/* Filters - Compact single row with dropdowns */}
          <div className="flex items-center justify-between gap-2 md:gap-4 mb-4 md:mb-6">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                resultCount={filteredTasks.length}
              />

              {/* Mobile filter button */}
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="flex md:hidden items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800"
              >
                <SlidersHorizontal size={16} />
                Filters
                {(tagFilter.length > 0 || dueDateFilter || view !== 'all') && (
                  <span className="w-5 h-5 rounded-full bg-indigo-600 dark:bg-orange-500 text-white text-xs flex items-center justify-center">
                    {(tagFilter.length > 0 ? 1 : 0) + (dueDateFilter ? 1 : 0) + (view !== 'all' ? 1 : 0)}
                  </span>
                )}
              </button>

              {/* Desktop filters */}
              <div className="hidden md:contents">
                <div className="w-px h-6 bg-slate-200 dark:bg-neutral-800" />

                {/* View Dropdown */}
                <FilterDropdown
                  label={view === 'all' ? 'View' : view === 'mine' ? 'My Tasks' : view === 'actions' ? 'Actions' : 'Follow-ups'}
                  options={[
                    { id: 'all', label: 'All Items', count: filteredTasks.length },
                    { id: 'mine', label: 'My Tasks', count: stats.mine },
                    { id: 'actions', label: 'Actions' },
                    { id: 'follow-ups', label: 'Follow-ups' },
                  ]}
                  value={view}
                  onChange={setView}
                />

                {/* Due Date Dropdown */}
                <FilterDropdown
                  label={dueDateFilter ? dueDateFilter === 'overdue' ? 'Overdue' : dueDateFilter === 'today' ? 'Today' : dueDateFilter === 'this-week' ? 'This Week' : 'Upcoming' : 'Due'}
                  icon={Clock}
                  options={[
                    { id: null, label: 'Any time' },
                    { id: 'overdue', label: 'Overdue', color: 'text-rose-500' },
                    { id: 'today', label: 'Due Today', color: 'text-amber-500' },
                    { id: 'this-week', label: 'This Week', color: 'text-blue-500' },
                    { id: 'upcoming', label: 'Upcoming' },
                  ]}
                  value={dueDateFilter}
                  onChange={setDueDateFilter}
                />

                {/* Tags Dropdown */}
                <FilterDropdown
                  label="Tags"
                  icon={Tag}
                  badge={tagFilter.length > 0 ? tagFilter.length : null}
                  options={PREDEFINED_TAGS.map(tag => ({
                    id: tag,
                    label: `#${tag}`,
                  }))}
                  value={tagFilter}
                  onChange={setTagFilter}
                  multiple
                />
              </div>

              {/* Active Filters as Chips - hidden on mobile */}
              {(searchQuery || selectedMeeting || showArchived || tagFilter.length > 0 || dueDateFilter || view !== 'all') && (
                <div className="hidden md:contents">
                  <div className="w-px h-6 bg-slate-200 dark:bg-neutral-800" />

                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-2 py-1 rounded-full text-xs bg-indigo-100 dark:bg-orange-500/20 text-indigo-700 dark:text-orange-500 font-medium flex items-center gap-1"
                    >
                      &quot;{searchQuery.slice(0, 12)}{searchQuery.length > 12 ? '...' : ''}&quot;
                      <X size={12} />
                    </button>
                  )}

                  {selectedMeeting && (
                    <button
                      onClick={() => setSelectedMeeting(null)}
                      className="px-2 py-1 rounded-full text-xs bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1"
                    >
                      <FileText size={10} />
                      {meetings.find(m => m.id === selectedMeeting)?.title?.slice(0, 15)}...
                      <X size={12} />
                    </button>
                  )}

                  {showArchived && (
                    <span className="px-2 py-1 rounded-full text-xs bg-slate-200 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 font-medium flex items-center gap-1">
                      <Archive size={10} />
                      Archived
                    </span>
                  )}

                  {/* Clear all filters button */}
                  {(tagFilter.length > 0 || dueDateFilter || view !== 'all' || searchQuery || selectedMeeting) && (
                    <button
                      onClick={() => {
                        setView('all');
                        setDueDateFilter(null);
                        setTagFilter([]);
                        setSearchQuery('');
                        setSelectedMeeting(null);
                      }}
                      className="px-2 py-1 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowAskAI(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-orange-500 dark:to-amber-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 dark:hover:from-orange-600 dark:hover:to-amber-600 transition-all shadow-sm whitespace-nowrap"
            >
              <Bot size={16} />
              <span className="hidden sm:inline">Ask AI</span>
            </button>

            <button
              onClick={() => setShowColumnModal(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus size={16} />
              Add Column
            </button>
          </div>

          {/* Kanban Board */}
          <div className="flex gap-3 md:gap-4 flex-1 min-h-0 overflow-x-auto snap-x snap-mandatory md:snap-none pb-2 -mx-3 px-3 md:mx-0 md:px-0">
            {columns.sort((a, b) => a.order - b.order).map(column => (
              <div key={column.id} className="relative group snap-start w-[85vw] md:w-auto">
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
                  isTrashView={showTrash}
                  onRestoreTask={handleRestoreTask}
                  onPermanentDelete={handlePermanentDelete}
                  onPinTask={handlePinTask}
                  viewDensity={viewDensity}
                  onSortColumn={handleSortColumn}
                  currentUser={currentUser}
                />
                {/* Delete column button for custom columns */}
                {column.custom && (
                  <button
                    onClick={() => handleDeleteColumn(column.id)}
                    className="absolute top-2 right-2 p-1 text-slate-400 dark:text-neutral-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete column"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-700 dark:text-rose-400 text-sm">
              {error}
            </div>
          )}
          </>
          )}
        </main>
      </div>

      {/* Modals */}
      <PasteModal
        isOpen={showPasteModal}
        onClose={() => setShowPasteModal(false)}
        onSubmit={handlePasteSubmit}
        onBulkSubmit={handleBulkSubmit}
        isProcessing={isProcessing}
        onProcessInBackground={handleProcessInBackground}
        canNotify={canNotify}
        meetings={meetings}
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
        githubStatus={githubStatus}
        onRefreshGithubStatus={fetchGithubStatus}
      />

      <EditMeetingModal
        isOpen={!!editingMeeting}
        meeting={editingMeeting}
        onClose={() => setEditingMeeting(null)}
        onSave={handleUpdateMeeting}
      />

      <TranscriptModal
        isOpen={!!viewingTranscript}
        meeting={viewingTranscript}
        onClose={() => setViewingTranscript(null)}
      />

      <ImportHistoryModal
        isOpen={showImportHistory}
        onClose={() => setShowImportHistory(false)}
        meetings={meetings}
        onSelectMeeting={(meetingId) => {
          setSelectedMeeting(meetingId);
          setMobileMenuOpen(false);
        }}
      />

      {/* PeopleGlossaryModal removed — replaced by /contacts page */}

      <AddTaskModal
        isOpen={!!addingToColumn}
        columnId={addingToColumn}
        columns={columns}
        onClose={() => setAddingToColumn(null)}
        onSave={handleAddTask}
        currentUser={currentUser}
      />

      {/* Mobile Filter Sheet */}
      <MobileFilterSheet
        isOpen={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        view={view}
        setView={setView}
        dueDateFilter={dueDateFilter}
        setDueDateFilter={setDueDateFilter}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        stats={stats}
      />

      {/* What's New Modal */}
      <WhatsNewModal
        isOpen={showWhatsNew}
        onClose={handleWhatsNewDismiss}
        features={newFeatures}
        showAll={showAllFeatures}
      />

      {/* AI Assistant Modal */}
      <AskAIModal
        isOpen={showAskAI}
        onClose={() => setShowAskAI(false)}
        onEditTask={(task) => setEditingTask(task)}
        tasks={tasks}
        meetings={meetings}
      />

      {/* Floating AI Suggestions Bar — hidden on mobile to avoid covering triage/board actions */}
      {!isMobile && (
        <SmartSuggestionsBar
          tasks={tasks}
          meetings={meetings}
          loading={loading}
          onEditTask={(task) => setEditingTask(task)}
        />
      )}
    </div>
  );
}
