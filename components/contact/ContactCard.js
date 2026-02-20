import React from 'react';
import { Mail, Phone, Briefcase, MessageSquare } from 'lucide-react';
import { formatContactTimestamp } from '../../lib/contact-utils';

const dim = "text-slate-300 dark:text-neutral-700";

export default function ContactCard({ contact, onClick }) {
  const lastNote = contact.notes && contact.notes.length > 0
    ? contact.notes[contact.notes.length - 1]
    : null;
  const hasRole = contact.role || contact.company;
  const hasEmail = !!contact.email;
  const hasPhone = !!contact.phone;
  const hasProjects = contact.projects && contact.projects.length > 0;
  const hasTags = contact.tags && contact.tags.length > 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-slate-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 hover:border-indigo-300 dark:hover:border-orange-500/50"
    >
      {/* Header: Name + Role/Company */}
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate leading-snug">
          {contact.name}
        </p>
        <p className={`text-xs truncate mt-0.5 ${hasRole ? 'text-slate-500 dark:text-neutral-400' : `${dim} italic`}`}>
          {hasRole ? [contact.role, contact.company].filter(Boolean).join(' at ') : 'No role or company'}
        </p>
      </div>

      {/* Divider */}
      <div className="h-px bg-slate-100 dark:bg-neutral-800 mb-3" />

      {/* Contact info — stacked for readability */}
      <div className="space-y-1.5 mb-3">
        <div className={`flex items-center gap-2 text-xs min-w-0 ${hasEmail ? 'text-slate-600 dark:text-neutral-300' : `${dim} italic`}`}>
          <Mail size={12} className={`flex-shrink-0 ${hasEmail ? 'text-slate-400 dark:text-neutral-500' : ''}`} />
          <span className="truncate">{hasEmail ? contact.email : 'No email'}</span>
        </div>
        <div className={`flex items-center gap-2 text-xs min-w-0 ${hasPhone ? 'text-slate-600 dark:text-neutral-300' : `${dim} italic`}`}>
          <Phone size={12} className={`flex-shrink-0 ${hasPhone ? 'text-slate-400 dark:text-neutral-500' : ''}`} />
          <span className="truncate">{hasPhone ? contact.phone : 'No phone'}</span>
        </div>
        <div className={`flex items-center gap-2 text-xs min-w-0 ${hasProjects ? 'text-slate-600 dark:text-neutral-300' : `${dim} italic`}`}>
          <Briefcase size={12} className={`flex-shrink-0 ${hasProjects ? 'text-slate-400 dark:text-neutral-500' : ''}`} />
          <span className="truncate">{hasProjects ? contact.projects.join(', ') : 'No projects'}</span>
        </div>
      </div>

      {/* Last note */}
      <div className="p-2.5 bg-slate-50 dark:bg-neutral-800/50 rounded-md mb-3">
        {lastNote ? (
          <>
            <div className="flex items-center gap-1.5 mb-1">
              <MessageSquare size={11} className="text-slate-400 dark:text-neutral-500" />
              <span className="text-[10px] font-medium text-slate-400 dark:text-neutral-500">Latest note</span>
              <span className="text-[10px] text-slate-300 dark:text-neutral-600 ml-auto">{formatContactTimestamp(lastNote.timestamp)}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-neutral-300 leading-relaxed line-clamp-2">{lastNote.text}</p>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <MessageSquare size={11} className={dim} />
            <span className={`text-xs ${dim} italic`}>No notes yet</span>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="flex gap-1.5 flex-wrap min-h-[20px] items-center">
        {hasTags ? (
          <>
            {contact.tags.slice(0, 3).map(tag => (
              <span key={tag} className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 dark:bg-orange-500/10 text-indigo-600 dark:text-orange-400 rounded-full">
                {tag}
              </span>
            ))}
            {contact.tags.length > 3 && (
              <span className="text-[10px] text-slate-400 dark:text-neutral-500">+{contact.tags.length - 3}</span>
            )}
          </>
        ) : (
          <span className={`text-[10px] ${dim} italic`}>No tags</span>
        )}
      </div>
    </button>
  );
}
