// pages/triage/ignored.js
// Manage ignored senders / domains, and ignore in bulk from a "top senders" view.

import React, { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import { Ban, Building2, Mail, User, Trash2, ArrowLeft, LogOut, Check } from 'lucide-react';

export default function IgnoredPage() {
  const { status } = useSession();
  const router = useRouter();

  const [ignored, setIgnored] = useState([]);
  const [senders, setSenders] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'system';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', saved === 'dark' || (saved === 'system' && prefersDark));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, sRes] = await Promise.all([
        fetch('/api/triage/ignored'),
        fetch('/api/triage/sender-stats')
      ]);
      const iData = iRes.ok ? await iRes.json() : { ignored: [] };
      const sData = sRes.ok ? await sRes.json() : { senders: [], domains: [] };
      setIgnored(iData.ignored || []);
      setSenders(sData.senders || []);
      setDomains(sData.domains || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (status === 'authenticated') load(); }, [load, status]);

  const addIgnore = async (type, pattern) => {
    setBusy(`${type}:${pattern}`);
    try {
      await fetch('/api/triage/ignored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, pattern, sweep: true })
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const removeIgnore = async (type, pattern) => {
    setBusy(`remove:${type}:${pattern}`);
    try {
      await fetch('/api/triage/ignored', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, pattern })
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950">
      <header className="bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800 px-4 py-3 flex items-center gap-3">
        <a href="/triage" className="flex items-center gap-1 text-sm text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft size={14} /> Back
        </a>
        <div className="flex items-center gap-2">
          <Ban size={18} className="text-indigo-600 dark:text-orange-500" />
          <h1 className="font-semibold text-slate-900 dark:text-white">Ignored senders</h1>
        </div>
        <div className="flex-1" />
        <nav className="hidden md:flex items-center gap-3 text-sm text-slate-600 dark:text-neutral-400">
          <a href="/" className="hover:text-slate-900 dark:hover:text-white">Tasks</a>
          <a href="/contacts" className="hover:text-slate-900 dark:hover:text-white">Contacts</a>
          <a href="/triage" className="hover:text-slate-900 dark:hover:text-white">Follow-ups</a>
          <button onClick={() => signOut()} className="hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
            <LogOut size={14} /> Sign out
          </button>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto p-4 grid md:grid-cols-2 gap-6">
        {/* Active ignore list */}
        <section>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Your ignore list ({ignored.length})</h2>
          {loading ? (
            <div className="text-xs text-slate-500 dark:text-neutral-400">Loading…</div>
          ) : ignored.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 border border-dashed border-slate-200 dark:border-neutral-800 rounded p-4">
              Nothing ignored yet. Use the panel on the right to bulk-ignore top senders, or click the Ignore button on any triage card.
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded divide-y divide-slate-200 dark:divide-neutral-800">
              {ignored.map(e => {
                const k = `remove:${e.type}:${e.pattern}`;
                return (
                  <div key={`${e.type}:${e.pattern}`} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      {e.type === 'domain' ? <Building2 size={12} className="text-slate-400" /> : <User size={12} className="text-slate-400" />}
                      <span className="font-mono text-slate-900 dark:text-neutral-100">
                        {e.type === 'domain' ? `@${e.pattern}` : e.pattern}
                      </span>
                    </div>
                    <button
                      onClick={() => removeIgnore(e.type, e.pattern)}
                      disabled={busy === k}
                      className="text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Top senders + domains */}
        <section>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Top domains in your inbox</h2>
          <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded divide-y divide-slate-200 dark:divide-neutral-800 mb-4">
            {domains.slice(0, 10).map(d => {
              const k = `domain:${d.domain}`;
              return (
                <div key={d.domain} className="px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-900 dark:text-neutral-100">@{d.domain}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 dark:text-neutral-400">{d.count}</span>
                      {d.ignored ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check size={11} /> Ignored</span>
                      ) : (
                        <button
                          onClick={() => addIgnore('domain', d.domain)}
                          disabled={busy === k}
                          className="text-indigo-600 dark:text-orange-500 hover:underline flex items-center gap-1 disabled:opacity-50"
                        >
                          <Ban size={11} /> Ignore
                        </button>
                      )}
                    </div>
                  </div>
                  {d.samples?.length > 0 && (
                    <div className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1 line-clamp-1">
                      e.g. {d.samples[0]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Top senders in your inbox</h2>
          <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded divide-y divide-slate-200 dark:divide-neutral-800 max-h-96 overflow-auto">
            {senders.map(s => {
              const k = `email:${s.addr}`;
              return (
                <div key={s.addr} className="px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-white truncate">
                        {s.name || s.addr}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 dark:text-neutral-400 truncate">{s.addr}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-500 dark:text-neutral-400">{s.count}</span>
                      {s.ignored ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check size={11} /> Ignored</span>
                      ) : (
                        <button
                          onClick={() => addIgnore('email', s.addr)}
                          disabled={busy === k}
                          className="text-indigo-600 dark:text-orange-500 hover:underline flex items-center gap-1 disabled:opacity-50"
                        >
                          <Ban size={11} /> Ignore
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
