import React, { useState } from 'react';
import { History, Search, X, FileText, Calendar, Users, ChevronRight } from 'lucide-react';

export default function ImportHistoryModal({ isOpen, onClose, meetings, onSelectMeeting }) {
  const [filterQuery, setFilterQuery] = useState('');

  if (!isOpen) return null;

  const sortedMeetings = [...meetings]
    .filter((meeting) => {
      if (!filterQuery.trim()) return true;
      const query = filterQuery.toLowerCase();
      return (
        meeting.title?.toLowerCase().includes(query) ||
        meeting.sourceFileName?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const dateA = new Date(a.processedAt || a.date || 0);
      const dateB = new Date(b.processedAt || b.date || 0);
      return dateB - dateA;
    });

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const handleSelect = (meetingId) => {
    onSelectMeeting(meetingId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-lg h-[80vh] md:h-auto md:max-h-[70vh] flex flex-col border border-transparent dark:border-neutral-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <History size={20} className="text-indigo-600 dark:text-orange-500" />
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              Import History
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter by name..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              autoFocus
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

        <div className="flex-1 overflow-y-auto">
          {sortedMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-neutral-500">
              <FileText size={40} className="mb-3 opacity-50" />
              {meetings.length === 0 ? (
                <>
                  <p className="text-sm">No imports yet</p>
                  <p className="text-xs mt-1">Import a transcript to see it here</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No matches found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {sortedMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => handleSelect(meeting.id)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-orange-500 transition-colors">
                        {meeting.title}
                      </p>
                      {meeting.sourceFileName && meeting.sourceFileName !== meeting.title && (
                        <p className="text-xs text-slate-400 dark:text-neutral-500 truncate mt-0.5">
                          {meeting.sourceFileName}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-300 dark:text-neutral-600 group-hover:text-indigo-500 dark:group-hover:text-orange-500 flex-shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(meeting.processedAt || meeting.date)}
                    </span>
                    {meeting.participants?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {meeting.participants.length}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t border-slate-200 dark:border-neutral-800">
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
