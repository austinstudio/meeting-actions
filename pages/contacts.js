import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import {
  Users, Plus, Search, X, LogOut, Sun, Moon, Monitor,
  CheckCircle2, Menu, ArrowUpDown, Filter, Download,
  Gift, Github, Unlink
} from 'lucide-react';
import { APP_VERSION, getAllFeatures } from '../lib/features';
import ContactCard from '../components/contact/ContactCard';
import ContactDetailPanel from '../components/contact/ContactDetailPanel';
import AddContactModal from '../components/contact/AddContactModal';
import WhatsNewModal from '../components/ui/WhatsNewModal';

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Core state
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [linkedData, setLinkedData] = useState({ meetings: [], tasks: [] });
  const [linkedLoading, setLinkedLoading] = useState(false);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [filterTag, setFilterTag] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Theme
  const [theme, setTheme] = useState('system');

  // What's New
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Migration
  const [migrationResult, setMigrationResult] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // GitHub
  const [githubStatus, setGithubStatus] = useState(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Theme management
  const applyTheme = useCallback((selectedTheme) => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = selectedTheme === 'dark' || (selectedTheme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
    applyTheme(savedTheme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (localStorage.getItem('theme') === 'system') applyTheme('system');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [applyTheme]);

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/contacts');
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) fetchContacts();
  }, [session, fetchContacts]);

  // Fetch GitHub status
  useEffect(() => {
    if (session) {
      fetch('/api/github/status').then(r => r.ok ? r.json() : null).then(d => d && setGithubStatus(d)).catch(() => {});
    }
  }, [session]);

  // Fetch linked data when contact selected
  useEffect(() => {
    if (!selectedContactId) {
      setLinkedData({ meetings: [], tasks: [] });
      return;
    }
    setLinkedLoading(true);
    fetch(`/api/contacts/${selectedContactId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setLinkedData({
            meetings: data.linkedMeetings || [],
            tasks: data.linkedTasks || []
          });
          setContacts(prev => prev.map(c => c.id === selectedContactId ? data.contact : c));
        }
      })
      .catch(err => console.error('Failed to fetch contact details:', err))
      .finally(() => setLinkedLoading(false));
  }, [selectedContactId]);

  // Handlers
  const handleCreateOrUpdate = async (formData, existingContact) => {
    if (existingContact) {
      const res = await fetch(`/api/contacts/${existingContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setContacts(prev => prev.map(c => c.id === existingContact.id ? data.contact : c));
      }
    } else {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setContacts(prev => [...prev, data.contact]);
        setSelectedContactId(data.contact.id);
      }
    }
  };

  const handleDelete = async (contact) => {
    if (!confirm(`Delete ${contact.name}?`)) return;
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permanent: false })
    });
    const data = await res.json();
    if (data.success) {
      setContacts(prev => prev.filter(c => c.id !== contact.id));
      if (selectedContactId === contact.id) {
        setSelectedContactId(null);
      }
    }
  };

  const handleAddNote = async (noteText) => {
    if (!selectedContactId) return;
    const res = await fetch(`/api/contacts/${selectedContactId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteText })
    });
    const data = await res.json();
    if (data.success) {
      setContacts(prev => prev.map(c => c.id === selectedContactId ? data.contact : c));
    }
  };

  const handleMigrate = async () => {
    if (isMigrating) return;
    setIsMigrating(true);
    try {
      const res = await fetch('/api/contacts/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setMigrationResult(data.message);
      if (data.migrated > 0) {
        await fetchContacts();
      }
      setTimeout(() => setMigrationResult(null), 5000);
    } catch (err) {
      setMigrationResult('Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  // Filter + sort contacts
  const filteredContacts = contacts
    .filter(c => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          c.name, c.email, c.company, c.role, c.team,
          ...(c.aliases || []), ...(c.tags || []), ...(c.projects || [])
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (filterTag) {
        if (!(c.tags || []).includes(filterTag)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'recent') return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (sortBy === 'company') return (a.company || '').localeCompare(b.company || '');
      return 0;
    });

  const allTags = [...new Set(contacts.flatMap(c => c.tags || []))].sort();
  const selectedContact = contacts.find(c => c.id === selectedContactId);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 dark:border-neutral-600 border-t-indigo-600 dark:border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800 px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg md:hidden"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Meeting Actions</h1>
              <p className="text-sm text-slate-500 dark:text-neutral-400 mt-0.5 hidden md:block">Contact Relationship Manager</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session && (
              <div className="relative group">
                <button
                  className="flex items-center gap-2 p-1.5 text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                  title={session.user?.email}
                >
                  {session.user?.image ? (
                    <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-orange-500/20 flex items-center justify-center text-sm font-medium text-indigo-600 dark:text-orange-500">
                      {session.user?.email?.[0].toUpperCase()}
                    </div>
                  )}
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[240px]">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="text-sm font-medium text-slate-700 dark:text-neutral-200 truncate">{session.user?.name || 'User'}</div>
                    <div className="text-xs text-slate-500 dark:text-neutral-400 truncate">{session.user?.email}</div>
                  </div>
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="text-xs text-slate-400 dark:text-neutral-500 mb-1.5">Theme</div>
                    <div className="flex gap-1">
                      {[
                        { id: 'light', icon: Sun },
                        { id: 'dark', icon: Moon },
                        { id: 'system', icon: Monitor },
                      ].map(option => (
                        <button
                          key={option.id}
                          onClick={() => changeTheme(option.id)}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded ${theme === option.id ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-500' : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                          title={option.id.charAt(0).toUpperCase() + option.id.slice(1)}
                        >
                          <option.icon size={14} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowWhatsNew(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 border-b border-slate-200 dark:border-neutral-800"
                  >
                    <Gift size={16} />
                    What's New
                  </button>
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-neutral-300">
                        <Github size={16} />
                        {githubStatus?.connected ? <span>@{githubStatus.username}</span> : <span>GitHub</span>}
                      </div>
                      {githubStatus?.connected ? (
                        <button
                          onClick={async () => {
                            if (confirm('Disconnect your GitHub account?')) {
                              try {
                                await fetch('/api/github/status', { method: 'DELETE' });
                                setGithubStatus(null);
                              } catch (e) {}
                            }
                          }}
                          className="p-1 text-slate-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-slate-100 dark:hover:bg-neutral-800"
                          title="Disconnect GitHub"
                        >
                          <Unlink size={14} />
                        </button>
                      ) : (
                        <a href="/api/github/connect" className="text-xs text-indigo-600 dark:text-orange-500 hover:text-indigo-700 dark:hover:text-orange-400">Connect</a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 rounded-b-lg"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Mobile sidebar backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar Navigation */}
        <aside className={`${mobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 w-64' : 'hidden'} md:block md:w-16 bg-white dark:bg-neutral-950 border-r border-slate-200 dark:border-neutral-800 flex-shrink-0`}>
          <div className="flex flex-col h-full py-4 items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors md:hidden mb-2"
            >
              <X size={18} />
            </button>
            <a
              href="/"
              className="w-10 h-10 flex items-center justify-center text-slate-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              title="Tasks"
            >
              <CheckCircle2 size={18} />
            </a>
            <div
              className="w-10 h-10 flex items-center justify-center bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-500 rounded-lg"
              title="Contacts"
            >
              <Users size={18} />
            </div>
            <div className="md:hidden mt-auto flex flex-col gap-2 items-center">
              {[
                { id: 'light', icon: Sun },
                { id: 'dark', icon: Moon },
                { id: 'system', icon: Monitor },
              ].map(option => (
                <button
                  key={option.id}
                  onClick={() => changeTheme(option.id)}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${theme === option.id ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-500' : 'text-slate-400 dark:text-neutral-500 hover:bg-slate-100 dark:hover:bg-neutral-800'}`}
                >
                  <option.icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content — Card Grid */}
        <div className="flex-1 overflow-y-auto">
          {/* Toolbar */}
          <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-black/95 backdrop-blur-sm border-b border-slate-200 dark:border-neutral-800 px-4 md:px-6 py-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">
                Contacts
                <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-neutral-500">
                  {filteredContacts.length}
                </span>
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleMigrate}
                  disabled={isMigrating}
                  className="p-1.5 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                  title="Import from People Glossary"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={() => { setEditingContact(null); setShowAddModal(true); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-indigo-600 dark:border-orange-500 text-indigo-600 dark:text-orange-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-orange-500/10 transition-colors"
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            </div>

            {migrationResult && (
              <div className="mb-3 px-3 py-2 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg">
                {migrationResult}
              </div>
            )}

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1 text-xs">
                <ArrowUpDown size={12} className="text-slate-400 dark:text-neutral-500" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-xs bg-transparent text-slate-600 dark:text-neutral-300 border-none focus:outline-none cursor-pointer"
                >
                  <option value="name">Name</option>
                  <option value="recent">Recent</option>
                  <option value="company">Company</option>
                </select>
              </div>

              {/* Tag filter */}
              {allTags.length > 0 && (
                <div className="flex items-center gap-1 text-xs">
                  <Filter size={12} className="text-slate-400 dark:text-neutral-500" />
                  <select
                    value={filterTag || ''}
                    onChange={(e) => setFilterTag(e.target.value || null)}
                    className="text-xs bg-transparent text-slate-600 dark:text-neutral-300 border-none focus:outline-none cursor-pointer"
                  >
                    <option value="">All tags</option>
                    {allTags.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Card Grid */}
          <div className="p-4 md:p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-neutral-500">
                <div className="w-6 h-6 border-2 border-slate-300 dark:border-neutral-600 border-t-indigo-600 dark:border-t-orange-500 rounded-full animate-spin mb-3" />
                <p className="text-sm">Loading contacts...</p>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-neutral-500">
                <Users size={48} className="mb-3 opacity-50" />
                {contacts.length === 0 ? (
                  <>
                    <p className="text-sm">No contacts yet</p>
                    <p className="text-xs mt-1 mb-4 text-center">Add contacts to track relationships, or import from the People Glossary</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingContact(null); setShowAddModal(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 dark:bg-orange-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors"
                      >
                        <Plus size={16} />
                        Add Contact
                      </button>
                      <button
                        onClick={handleMigrate}
                        disabled={isMigrating}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-slate-300 dark:border-neutral-600 text-slate-600 dark:text-neutral-300 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <Download size={16} />
                        Import Glossary
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm">No matches found</p>
                    <p className="text-xs mt-1">Try a different search or filter</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredContacts.map(contact => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onClick={() => setSelectedContactId(contact.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact Detail Modal */}
      <ContactDetailPanel
        isOpen={!!selectedContactId}
        contact={selectedContact}
        linkedMeetings={linkedData.meetings}
        linkedTasks={linkedData.tasks}
        linkedLoading={linkedLoading}
        onClose={() => setSelectedContactId(null)}
        onEdit={(c) => { setEditingContact(c); setShowAddModal(true); }}
        onDelete={handleDelete}
        onAddNote={handleAddNote}
      />

      {/* Add/Edit Contact Modal */}
      <AddContactModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingContact(null); }}
        onSave={handleCreateOrUpdate}
        editingContact={editingContact}
      />

      {/* What's New Modal */}
      <WhatsNewModal
        isOpen={showWhatsNew}
        onClose={() => setShowWhatsNew(false)}
        features={getAllFeatures()}
        showAll={true}
      />
    </div>
  );
}
