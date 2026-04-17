import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import {
  Mail, LogOut, Sun, Moon, Monitor, Menu, CheckCircle2
} from 'lucide-react';
import ViewSwitcher from '../components/triage/ViewSwitcher';
import FilterBar from '../components/triage/FilterBar';
import AnalyzeProgressBar from '../components/triage/AnalyzeProgressBar';
import TriageCard from '../components/triage/TriageCard';
import FocusCard from '../components/triage/FocusCard';
import BoardColumn from '../components/triage/BoardColumn';
import SnoozeMenu from '../components/triage/SnoozeMenu';
import DraftReplyModal from '../components/triage/DraftReplyModal';

export default function TriagePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState({ total: 0, analyzed: 0, needsReply: 0, waitingOn: 0, fyiOnly: 0, done: 0 });
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('queue');
  const [filters, setFilters] = useState({ priority: 'all', sender: '', minWaitDays: 0 });
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [snoozeTarget, setSnoozeTarget] = useState(null);
  const [draftTarget, setDraftTarget] = useState(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [toast, setToast] = useState(null);

  // Auth redirect
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Theme
  const applyTheme = useCallback((t) => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && prefersDark));
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'system';
    applyTheme(saved);
  }, [applyTheme]);

  // Sync mode + filters with URL
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.mode && q.mode !== mode) setMode(q.mode);
    setFilters({
      priority: q.priority || 'all',
      sender: q.sender || '',
      minWaitDays: Number(q.minWaitDays) || 0
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const updateUrl = useCallback((next) => {
    const q = {};
    if (next.mode && next.mode !== 'queue') q.mode = next.mode;
    if (next.filters?.priority && next.filters.priority !== 'all') q.priority = next.filters.priority;
    if (next.filters?.sender) q.sender = next.filters.sender;
    if (next.filters?.minWaitDays) q.minWaitDays = next.filters.minWaitDays;
    router.replace({ pathname: '/triage', query: q }, undefined, { shallow: true });
  }, [router]);

  // Fetch data
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mode,
        priority: filters.priority,
        sender: filters.sender,
        minWaitDays: String(filters.minWaitDays)
      });
      const res = await fetch(`/api/triage?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEmails(data.emails);
      setStats(data.stats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [mode, filters]);

  useEffect(() => { if (status === 'authenticated') load(); }, [load, status]);

  useEffect(() => { setFocusIndex(0); }, [mode, emails.length]);

  const board = useMemo(() => {
    const cols = { needs_reply: [], waiting_on: [], fyi_only: [], done: [] };
    for (const e of emails) {
      const s = e.triage?.triageState || 'fyi_only';
      if (cols[s]) cols[s].push(e);
    }
    return cols;
  }, [emails]);

  useEffect(() => {
    if (mode !== 'focus') return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setFocusIndex(i => Math.min(i + 1, emails.length - 1));
      if (e.key === 'ArrowLeft') setFocusIndex(i => Math.max(0, i - 1));
      if (e.key === 'Escape') {
        setMode('queue');
        updateUrl({ mode: 'queue', filters });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, emails.length, updateUrl, filters]);

  // Actions
  const patchTriage = async (id, patch) => {
    await fetch(`/api/triage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    load();
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const res = await fetch('/api/triage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'unanalyzed' })
      });
      const data = await res.json();
      setAnalyzeResult(data);
      load();
    } catch (err) {
      setAnalyzeResult({ analyzed: 0, skipped: 0, errors: 1 });
    } finally {
      setAnalyzing(false);
    }
  };

  const changeMode = (m) => { setMode(m); updateUrl({ mode: m, filters }); };
  const changeFilters = (f) => { setFilters(f); updateUrl({ mode, filters: f }); };

  const onDraftReply = (email) => setDraftTarget(email);
  const onSnooze = (email) => setSnoozeTarget(email);
  const onPickSnooze = (email, iso) => { setSnoozeTarget(null); patchTriage(email.outlook_id, { snoozeUntil: iso }); };
  const onDismiss = (email) => patchTriage(email.outlook_id, { triageState: 'dismissed' });
  const onMarkDone = (email) => patchTriage(email.outlook_id, { triageState: 'done' });
  const onCreateTask = async (email) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: `Follow up: ${email.subject || '(no subject)'}`,
          type: 'follow-up',
          person: email.sender_name || email.sender_email || null,
          context: `From email: ${email.sender_name || email.sender_email || ''} · ${email.sent_at || ''}`,
          priority: email.triage?.priority || 'medium'
        })
      });
      if (!res.ok) throw new Error('Failed');
      const { task } = await res.json();
      await patchTriage(email.outlook_id, { linkedTaskId: task.id });
      setToast({ kind: 'success', text: `Task created: ${task.task}` });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ kind: 'error', text: 'Failed to create task' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setMobileMenuOpen(v => !v)} className="md:hidden"><Menu size={18} /></button>
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-indigo-600 dark:text-orange-500" />
          <h1 className="font-semibold text-slate-900 dark:text-white">Follow-ups</h1>
          <span className="text-xs text-slate-500 dark:text-neutral-400">
            {stats.needsReply} need reply · {stats.waitingOn} waiting · {stats.analyzed}/{stats.total} analyzed
          </span>
        </div>
        <div className="flex-1" />
        <ViewSwitcher mode={mode} onChange={changeMode} />
        <nav className="hidden md:flex items-center gap-3 text-sm text-slate-600 dark:text-neutral-400 ml-4">
          <a href="/" className="hover:text-slate-900 dark:hover:text-white">Tasks</a>
          <a href="/contacts" className="hover:text-slate-900 dark:hover:text-white">Contacts</a>
          <button onClick={() => signOut()} className="hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
            <LogOut size={14} /> Sign out
          </button>
        </nav>
      </header>

      <FilterBar filters={filters} onChange={changeFilters} onAnalyze={handleAnalyze} analyzing={analyzing} />
      <AnalyzeProgressBar result={analyzeResult} onDismiss={() => setAnalyzeResult(null)} />

      <main className={`p-4 ${mode === 'board' ? '' : 'max-w-3xl mx-auto'}`}>
        {loading ? (
          <div className="text-sm text-slate-500 dark:text-neutral-400">Loading…</div>
        ) : emails.length === 0 ? (
          <EmptyState stats={stats} onAnalyze={handleAnalyze} analyzing={analyzing} />
        ) : mode === 'queue' ? (
          emails.map(email => (
            <TriageCard
              key={email.outlook_id}
              email={email}
              onDraftReply={onDraftReply}
              onSnooze={onSnooze}
              onDismiss={onDismiss}
              onMarkDone={onMarkDone}
              onCreateTask={onCreateTask}
            />
          ))
        ) : mode === 'focus' ? (
          <FocusCard
            email={emails[focusIndex]}
            index={focusIndex}
            total={emails.length}
            onPrev={() => setFocusIndex(i => Math.max(0, i - 1))}
            onNext={() => setFocusIndex(i => Math.min(i + 1, emails.length - 1))}
            onDraftReply={onDraftReply}
            onSnooze={onSnooze}
            onDismiss={(email) => { onDismiss(email); setFocusIndex(i => Math.min(i, emails.length - 2)); }}
            onMarkDone={(email) => { onMarkDone(email); setFocusIndex(i => Math.min(i, emails.length - 2)); }}
          />
        ) : mode === 'board' ? (
          <div className="max-w-6xl mx-auto flex gap-3">
            {(['needs_reply', 'waiting_on', 'fyi_only', 'done']).map(state => (
              <BoardColumn
                key={state}
                state={state}
                emails={board[state]}
                onDrop={(outlookId, nextState) => patchTriage(outlookId, { triageState: nextState })}
              />
            ))}
          </div>
        ) : null}
      </main>

      {snoozeTarget && (
        <SnoozeMenu email={snoozeTarget} onPick={onPickSnooze} onClose={() => setSnoozeTarget(null)} />
      )}
      {draftTarget && (
        <DraftReplyModal email={draftTarget} onClose={() => setDraftTarget(null)} />
      )}
      {toast && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md shadow-lg text-sm ${
          toast.kind === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function EmptyState({ stats, onAnalyze, analyzing }) {
  if (stats.total === 0) {
    return (
      <div className="text-center py-16">
        <Mail size={32} className="mx-auto text-slate-300 dark:text-neutral-700" />
        <p className="text-sm text-slate-500 dark:text-neutral-400 mt-3">No emails in Redis yet.</p>
        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">Run the Outlook extractor locally to populate.</p>
      </div>
    );
  }
  if (stats.analyzed === 0) {
    return (
      <div className="text-center py-16">
        <Mail size={32} className="mx-auto text-slate-300 dark:text-neutral-700" />
        <p className="text-sm text-slate-500 dark:text-neutral-400 mt-3">
          {stats.total} emails ready for analysis.
        </p>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="mt-3 bg-indigo-600 dark:bg-orange-500 text-white rounded px-4 py-2 text-sm disabled:opacity-60"
        >
          {analyzing ? 'Analyzing…' : 'Run AI analysis'}
        </button>
      </div>
    );
  }
  return (
    <div className="text-center py-16">
      <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
      <p className="text-sm text-slate-500 dark:text-neutral-400 mt-3">Nothing needs your follow-up right now.</p>
    </div>
  );
}
