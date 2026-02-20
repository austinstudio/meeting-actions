import React, { useState, useEffect } from 'react';
import { X, Users } from 'lucide-react';

const EMPTY_FORM = {
  name: '', aliases: '', email: '', phone: '', company: '', role: '', team: '',
  linkedInUrl: '', tags: '', projects: '', howWeMet: '', relationshipContext: ''
};

export default function AddContactModal({ isOpen, onClose, onSave, editingContact }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingContact) {
        setForm({
          name: editingContact.name || '',
          aliases: (editingContact.aliases || []).join(', '),
          email: editingContact.email || '',
          phone: editingContact.phone || '',
          company: editingContact.company || '',
          role: editingContact.role || '',
          team: editingContact.team || '',
          linkedInUrl: editingContact.linkedInUrl || '',
          tags: (editingContact.tags || []).join(', '),
          projects: (editingContact.projects || []).join(', '),
          howWeMet: editingContact.howWeMet || '',
          relationshipContext: editingContact.relationshipContext || ''
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [isOpen, editingContact]);

  const handleSave = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(form, editingContact);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const isEditing = !!editingContact;

  const inputClass = "w-full px-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent";
  const labelClass = "block text-xs font-medium text-slate-500 dark:text-neutral-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-lg max-h-[90vh] flex flex-col border border-transparent dark:border-neutral-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-indigo-600 dark:text-orange-500" />
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              {isEditing ? 'Edit Contact' : 'Add Contact'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Name */}
          <div>
            <label className={labelClass}>Name <span className="text-rose-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Full name"
              className={inputClass}
              autoFocus
            />
          </div>

          {/* Aliases */}
          <div>
            <label className={labelClass}>Aliases</label>
            <input
              type="text"
              value={form.aliases}
              onChange={(e) => setForm(prev => ({ ...prev, aliases: e.target.value }))}
              placeholder="Ion, Ian, Ayen"
              className={inputClass}
            />
            <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1">
              Comma-separated phonetic variants the AI might hear
            </p>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="name@company.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 123-4567"
                className={inputClass}
              />
            </div>
          </div>

          {/* Company + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Company</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm(prev => ({ ...prev, company: e.target.value }))}
                placeholder="Acme Inc."
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
                placeholder="Engineering Lead"
                className={inputClass}
              />
            </div>
          </div>

          {/* Team + LinkedIn */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Team</label>
              <input
                type="text"
                value={form.team}
                onChange={(e) => setForm(prev => ({ ...prev, team: e.target.value }))}
                placeholder="Platform"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>LinkedIn URL</label>
              <input
                type="url"
                value={form.linkedInUrl}
                onChange={(e) => setForm(prev => ({ ...prev, linkedInUrl: e.target.value }))}
                placeholder="linkedin.com/in/..."
                className={inputClass}
              />
            </div>
          </div>

          {/* Tags + Projects */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tags</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="client, partner"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Projects</label>
              <input
                type="text"
                value={form.projects}
                onChange={(e) => setForm(prev => ({ ...prev, projects: e.target.value }))}
                placeholder="Project Alpha, Beta"
                className={inputClass}
              />
            </div>
          </div>

          {/* How we met */}
          <div>
            <label className={labelClass}>How we met</label>
            <input
              type="text"
              value={form.howWeMet}
              onChange={(e) => setForm(prev => ({ ...prev, howWeMet: e.target.value }))}
              placeholder="Conference, intro from Sarah, etc."
              className={inputClass}
            />
          </div>

          {/* Relationship context */}
          <div>
            <label className={labelClass}>Relationship context</label>
            <textarea
              value={form.relationshipContext}
              onChange={(e) => setForm(prev => ({ ...prev, relationshipContext: e.target.value }))}
              placeholder="Key things to remember about this person..."
              rows={2}
              className={inputClass + ' resize-none'}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-800 rounded-lg hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || saving}
            className="px-4 py-2 text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}
