import React, { useState, useEffect } from 'react';
import { Users, X, Plus, Pencil, Trash2, Search } from 'lucide-react';

export default function PeopleGlossaryModal({ isOpen, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [editing, setEditing] = useState(null); // null = list view, 'new' = adding, entry object = editing
  const [formData, setFormData] = useState({ name: '', aliases: '', role: '', team: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchEntries();
      setEditing(null);
      setFilterQuery('');
    }
  }, [isOpen]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/glossary');
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (err) {
      console.error('Failed to fetch glossary:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({ name: '', aliases: '', role: '', team: '' });
    setEditing('new');
  };

  const handleEdit = (entry) => {
    setFormData({
      name: entry.name,
      aliases: entry.aliases.join(', '),
      role: entry.role || '',
      team: entry.team || ''
    });
    setEditing(entry);
  };

  const handleCancel = () => {
    setEditing(null);
    setFormData({ name: '', aliases: '', role: '', team: '' });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    try {
      const isNew = editing === 'new';
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? formData
        : { ...formData, id: editing.id };

      const res = await fetch('/api/glossary', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.success) {
        if (isNew) {
          setEntries(prev => [...prev, data.entry]);
        } else {
          setEntries(prev => prev.map(e => e.id === data.entry.id ? data.entry : e));
        }
        setEditing(null);
        setFormData({ name: '', aliases: '', role: '', team: '' });
      }
    } catch (err) {
      console.error('Failed to save glossary entry:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch('/api/glossary', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });

      const data = await res.json();
      if (data.success) {
        setEntries(prev => prev.filter(e => e.id !== id));
        if (editing && editing !== 'new' && editing.id === id) {
          setEditing(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete glossary entry:', err);
    }
  };

  if (!isOpen) return null;

  const filteredEntries = entries.filter(e => {
    if (!filterQuery.trim()) return true;
    const query = filterQuery.toLowerCase();
    return (
      e.name.toLowerCase().includes(query) ||
      e.aliases.some(a => a.toLowerCase().includes(query)) ||
      e.role?.toLowerCase().includes(query) ||
      e.team?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-lg h-[80vh] md:h-auto md:max-h-[70vh] flex flex-col border border-transparent dark:border-neutral-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-indigo-600 dark:text-orange-500" />
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              People Glossary
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button
                onClick={handleAdd}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-indigo-600 dark:border-orange-500 text-indigo-600 dark:text-orange-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-orange-500/10 transition-colors"
              >
                <Plus size={14} />
                Add Person
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search */}
        {!editing && entries.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search people..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              />
              {filterQuery && (
                <button
                  onClick={() => setFilterQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {editing ? (
            /* Add/Edit Form */
            <div className="p-4 space-y-4">
              <h4 className="text-sm font-medium text-slate-700 dark:text-neutral-200">
                {editing === 'new' ? 'Add Person' : `Edit ${editing.name}`}
              </h4>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-1">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Correct spelling of name"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-1">
                  Aliases
                </label>
                <input
                  type="text"
                  value={formData.aliases}
                  onChange={(e) => setFormData(prev => ({ ...prev, aliases: e.target.value }))}
                  placeholder="Ion, Ian, Ayen"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
                />
                <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1">
                  Comma-separated phonetic variants the AI might hear
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-1">
                    Role
                  </label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                    placeholder="Engineering Lead"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-1">
                    Team
                  </label>
                  <input
                    type="text"
                    value={formData.team}
                    onChange={(e) => setFormData(prev => ({ ...prev, team: e.target.value }))}
                    placeholder="Platform"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-800 rounded-lg hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.name.trim() || saving}
                  className="px-4 py-2 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {saving ? 'Saving...' : editing === 'new' ? 'Add Person' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-neutral-500">
              <div className="w-6 h-6 border-2 border-slate-300 dark:border-neutral-600 border-t-indigo-600 dark:border-t-orange-500 rounded-full animate-spin mb-3" />
              <p className="text-sm">Loading...</p>
            </div>
          ) : entries.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-neutral-500">
              <Users size={40} className="mb-3 opacity-50" />
              <p className="text-sm">No people added yet</p>
              <p className="text-xs mt-1 mb-4">Add people so the AI spells their names correctly</p>
              <button
                onClick={handleAdd}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors"
              >
                <Plus size={16} />
                Add First Person
              </button>
            </div>
          ) : (
            /* Entry List */
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {filteredEntries.map(entry => (
                <div key={entry.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-800 dark:text-white">
                        {entry.name}
                      </p>
                      {entry.aliases.length > 0 && (
                        <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                          aka: {entry.aliases.join(', ')}
                        </p>
                      )}
                      {(entry.role || entry.team) && (
                        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">
                          {[entry.role, entry.team].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(entry)}
                        className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filterQuery && filteredEntries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-neutral-500">
                  <p className="text-sm">No matches found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-slate-200 dark:border-neutral-800">
          {entries.length > 0 && !editing && (
            <p className="text-xs text-slate-400 dark:text-neutral-500">
              {entries.length} {entries.length === 1 ? 'person' : 'people'}
            </p>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-lg hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
