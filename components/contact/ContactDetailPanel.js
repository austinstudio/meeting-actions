import React, { useState, useEffect } from 'react';
import { X, Pencil, Trash2, MessageSquare, Calendar, CheckCircle2, History, Mail, Phone, Building2, Briefcase, Users, Link2, Tag, FolderOpen, Handshake, UserPlus, ExternalLink } from 'lucide-react';
import { getInitials, formatContactTimestamp } from '../../lib/contact-utils';
import ContactNotesTab from './ContactNotesTab';
import ContactActivityTab from './ContactActivityTab';
import ContactLinkedMeetings from './ContactLinkedMeetings';
import ContactLinkedTasks from './ContactLinkedTasks';

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-purple-500', 'bg-teal-500', 'bg-blue-500', 'bg-orange-500'
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const TABS = [
  { id: 'details', label: 'Details', icon: Pencil },
  { id: 'notes', label: 'Notes', icon: MessageSquare },
  { id: 'meetings', label: 'Meetings', icon: Calendar },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle2 },
  { id: 'activity', label: 'Activity', icon: History }
];

export default function ContactDetailPanel({
  isOpen,
  contact,
  linkedMeetings,
  linkedTasks,
  linkedLoading,
  onClose,
  onEdit,
  onDelete,
  onAddNote
}) {
  const [activeTab, setActiveTab] = useState('details');

  // Reset tab when contact changes
  useEffect(() => {
    setActiveTab('details');
  }, [contact?.id]);

  if (!isOpen || !contact) return null;

  const initials = getInitials(contact.name);
  const avatarColor = getAvatarColor(contact.name);

  const hasContact = contact.email || contact.phone || contact.linkedInUrl;
  const hasOrg = contact.company || contact.role || contact.team;
  const hasMeta = (contact.aliases && contact.aliases.length > 0) || (contact.tags && contact.tags.length > 0) || (contact.projects && contact.projects.length > 0);
  const hasContext = contact.howWeMet || contact.relationshipContext;
  const hasAnyDetails = hasContact || hasOrg || hasMeta || hasContext;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-2xl h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col border border-transparent dark:border-neutral-600">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white text-sm font-semibold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white truncate">{contact.name}</h3>
              {(contact.role || contact.company) && (
                <p className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                  {[contact.role, contact.company].filter(Boolean).join(' at ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(contact)}
              className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              title="Edit contact"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => onDelete(contact)}
              className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              title="Delete contact"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="ml-1 p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-neutral-700 px-4 overflow-x-auto flex-shrink-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            let count = null;
            if (tab.id === 'notes') count = (contact.notes || []).length;
            if (tab.id === 'activity') count = (contact.activity || []).length;
            if (tab.id === 'meetings') count = (linkedMeetings || []).length;
            if (tab.id === 'tasks') count = (linkedTasks || []).length;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-500 dark:border-orange-500 text-indigo-600 dark:text-orange-500'
                    : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-300'
                }`}
              >
                <Icon size={15} />
                {tab.label}
                {count !== null && count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-400'
                      : 'bg-slate-100 dark:bg-neutral-700 text-slate-500 dark:text-neutral-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'details' && (
            <div className="p-4 space-y-4">
              {!hasAnyDetails ? (
                <div className="text-center py-8 text-slate-400 dark:text-neutral-500">
                  <Pencil size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No details added yet</p>
                  <p className="text-xs mt-1">Click edit to add contact information</p>
                </div>
              ) : (
                <>
                  {/* Contact Info Section */}
                  {hasContact && (
                    <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900/50 p-4">
                      <h4 className="text-xs font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-3">Contact</h4>
                      <div className="space-y-2.5">
                        {contact.email && (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                              <Mail size={14} className="text-blue-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-400 dark:text-neutral-500">Email</p>
                              <a href={`mailto:${contact.email}`} className="text-sm text-indigo-600 dark:text-orange-500 hover:underline truncate block">{contact.email}</a>
                            </div>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                              <Phone size={14} className="text-emerald-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-400 dark:text-neutral-500">Phone</p>
                              <a href={`tel:${contact.phone}`} className="text-sm text-slate-800 dark:text-white truncate block">{contact.phone}</a>
                            </div>
                          </div>
                        )}
                        {contact.linkedInUrl && (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                              <Link2 size={14} className="text-sky-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-slate-400 dark:text-neutral-500">LinkedIn</p>
                              <a
                                href={contact.linkedInUrl.startsWith('http') ? contact.linkedInUrl : `https://${contact.linkedInUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-indigo-600 dark:text-orange-500 hover:underline truncate block flex items-center gap-1"
                              >
                                {contact.linkedInUrl.replace(/^https?:\/\/(www\.)?/, '')}
                                <ExternalLink size={11} className="flex-shrink-0 opacity-50" />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Organization Section */}
                  {hasOrg && (
                    <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900/50 p-4">
                      <h4 className="text-xs font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-3">Organization</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {contact.company && (
                          <div className="flex items-center gap-2.5">
                            <Building2 size={14} className="text-slate-400 dark:text-neutral-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-400 dark:text-neutral-500">Company</p>
                              <p className="text-sm text-slate-800 dark:text-white truncate">{contact.company}</p>
                            </div>
                          </div>
                        )}
                        {contact.role && (
                          <div className="flex items-center gap-2.5">
                            <Briefcase size={14} className="text-slate-400 dark:text-neutral-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-400 dark:text-neutral-500">Role</p>
                              <p className="text-sm text-slate-800 dark:text-white truncate">{contact.role}</p>
                            </div>
                          </div>
                        )}
                        {contact.team && (
                          <div className="flex items-center gap-2.5">
                            <Users size={14} className="text-slate-400 dark:text-neutral-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-400 dark:text-neutral-500">Team</p>
                              <p className="text-sm text-slate-800 dark:text-white truncate">{contact.team}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tags, Projects, Aliases */}
                  {hasMeta && (
                    <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900/50 p-4 space-y-3">
                      {contact.tags && contact.tags.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Tag size={12} className="text-slate-400 dark:text-neutral-500" />
                            <p className="text-[11px] font-medium text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Tags</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {contact.tags.map(tag => (
                              <span key={tag} className="px-2.5 py-1 text-xs font-medium bg-indigo-50 dark:bg-orange-500/10 text-indigo-600 dark:text-orange-400 rounded-full border border-indigo-100 dark:border-orange-500/20">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {contact.projects && contact.projects.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <FolderOpen size={12} className="text-slate-400 dark:text-neutral-500" />
                            <p className="text-[11px] font-medium text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Projects</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {contact.projects.map(p => (
                              <span key={p} className="px-2.5 py-1 text-xs font-medium bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-full border border-purple-100 dark:border-purple-500/20">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {contact.aliases && contact.aliases.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <UserPlus size={12} className="text-slate-400 dark:text-neutral-500" />
                            <p className="text-[11px] font-medium text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Aliases</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {contact.aliases.map(a => (
                              <span key={a} className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 rounded-full border border-slate-200 dark:border-neutral-700">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Context Section */}
                  {hasContext && (
                    <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900/50 p-4 space-y-3">
                      <h4 className="text-xs font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Context</h4>
                      {contact.howWeMet && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Handshake size={12} className="text-slate-400 dark:text-neutral-500" />
                            <p className="text-[11px] text-slate-400 dark:text-neutral-500">How we met</p>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-neutral-200 pl-[18px]">{contact.howWeMet}</p>
                        </div>
                      )}
                      {contact.relationshipContext && (
                        <div>
                          <p className="text-[11px] text-slate-400 dark:text-neutral-500 mb-1">Relationship notes</p>
                          <p className="text-sm text-slate-700 dark:text-neutral-200 leading-relaxed">{contact.relationshipContext}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer meta */}
                  <div className="text-[11px] text-slate-400 dark:text-neutral-600 flex items-center justify-between pt-1">
                    <span>Added {formatContactTimestamp(contact.createdAt)}</span>
                    {contact.updatedAt !== contact.createdAt && (
                      <span>Updated {formatContactTimestamp(contact.updatedAt)}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <ContactNotesTab contact={contact} onAddNote={onAddNote} />
          )}

          {activeTab === 'meetings' && (
            <ContactLinkedMeetings meetings={linkedMeetings} loading={linkedLoading} />
          )}

          {activeTab === 'tasks' && (
            <ContactLinkedTasks tasks={linkedTasks} loading={linkedLoading} />
          )}

          {activeTab === 'activity' && (
            <ContactActivityTab contact={contact} />
          )}
        </div>
      </div>
    </div>
  );
}
