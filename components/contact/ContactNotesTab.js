import React, { useState } from 'react';
import { Send, RefreshCw, MessageSquare } from 'lucide-react';
import { formatContactTimestamp } from '../../lib/contact-utils';

export default function ContactNotesTab({ contact, onAddNote }) {
  const [newNote, setNewNote] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!newNote.trim() || isAdding) return;
    setIsAdding(true);
    try {
      await onAddNote(newNote.trim());
      setNewNote('');
    } finally {
      setIsAdding(false);
    }
  };

  const notes = contact.notes || [];

  // Render text with @mention highlighting
  const renderText = (text) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className="text-indigo-600 dark:text-orange-500 font-medium bg-indigo-50 dark:bg-orange-500/10 px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Input */}
      <div className="p-4 border-b border-slate-100 dark:border-neutral-800">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note... (use @name to mention someone)"
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent resize-none text-sm dark:bg-neutral-950 dark:text-white"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleAdd();
                }
              }}
            />
            <div className="absolute right-2 bottom-2 text-xs text-slate-400 dark:text-neutral-500">
              {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to send
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={!newNote.trim() || isAdding}
            className="px-3 py-2 bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            {isAdding ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notes.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notes yet</p>
            <p className="text-xs mt-1">Add a note to keep track of interactions</p>
          </div>
        ) : (
          [...notes].reverse().map(note => (
            <div key={note.id} className="bg-slate-50 dark:bg-neutral-950 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{note.user}</span>
                <span className="text-xs text-slate-400 dark:text-neutral-500">{formatContactTimestamp(note.timestamp)}</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-neutral-300">{renderText(note.text)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
