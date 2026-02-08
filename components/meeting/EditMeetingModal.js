import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function EditMeetingModal({ isOpen, meeting, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [participants, setParticipants] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meeting) {
      setTitle(meeting.title || '');
      setDate(meeting.date || '');
      setParticipants((meeting.participants || []).join(', '));
    }
  }, [meeting]);

  if (!isOpen || !meeting) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const participantsArray = participants
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      await onSave(meeting.id, {
        title: title.trim(),
        date,
        participants: participantsArray
      });
      onClose();
    } catch (error) {
      console.error('Failed to save meeting:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-xl md:max-w-md w-full border border-slate-200 dark:border-neutral-600">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Edit Meeting</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-neutral-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-neutral-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              Participants
            </label>
            <input
              type="text"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="John, Jane, Bob"
              className="w-full px-3 py-2 border border-slate-200 dark:border-neutral-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Separate names with commas</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
