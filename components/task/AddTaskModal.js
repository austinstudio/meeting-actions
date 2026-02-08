import React, { useState, useEffect } from 'react';
import { X, Plus, RefreshCw } from 'lucide-react';

export default function AddTaskModal({ isOpen, columnId, columns, onClose, onSave, currentUser }) {
  const [formData, setFormData] = useState({
    task: '',
    owner: currentUser || 'User',
    person: '',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    priority: 'medium',
    type: 'action',
    context: '',
    status: 'todo'
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        task: '',
        context: '',
        owner: currentUser || 'User',
        status: columnId || prev.status
      }));
    }
  }, [isOpen, columnId, currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(formData);
    setIsSaving(false);
    setFormData({
      task: '',
      owner: currentUser || 'User',
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
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-lg h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden border border-transparent dark:border-neutral-600 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Add Task to {columnName}</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Task Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={formData.task}
              onChange={(e) => setFormData({ ...formData, task: e.target.value })}
              rows={2}
              required
              autoFocus
              placeholder="What needs to be done?"
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
              Context / Notes
            </label>
            <textarea
              value={formData.context}
              onChange={(e) => setFormData({ ...formData, context: e.target.value })}
              rows={2}
              placeholder="Additional context about this task..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none dark:bg-neutral-950 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
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
