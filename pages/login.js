import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, CheckCircle2, Sparkles, ListChecks } from 'lucide-react';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { error } = router.query;
  const [theme, setTheme] = useState('system');

  // Initialize and apply theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
    applyTheme(savedTheme);

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (savedTheme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const applyTheme = (themeValue) => {
    const isDark = themeValue === 'dark' ||
      (themeValue === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  useEffect(() => {
    if (session) {
      router.push('/');
    }
  }, [session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-orange-500"></div>
      </div>
    );
  }

  const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-black dark:via-neutral-950 dark:to-neutral-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/10 dark:bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 dark:bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* Theme toggle - top right */}
      <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm rounded-lg p-1 border border-slate-200 dark:border-neutral-700">
        {themeOptions.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => changeTheme(value)}
            className={`p-2 rounded-md transition-colors ${
              theme === value
                ? 'bg-indigo-100 dark:bg-orange-500/20 text-indigo-600 dark:text-orange-500'
                : 'text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300'
            }`}
            title={label}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Main card */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/50 border border-slate-200/50 dark:border-neutral-800 p-8">
          {/* Logo and title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-orange-500 dark:via-amber-500 dark:to-yellow-500 mb-4 shadow-lg shadow-indigo-500/25 dark:shadow-orange-500/25">
              <ListChecks size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Meeting Actions
            </h1>
            <p className="text-slate-500 dark:text-neutral-400">
              Turn meeting transcripts into actionable tasks
            </p>
          </div>

          {/* Features list */}
          <div className="mb-8 space-y-3">
            {[
              'AI-powered task extraction',
              'Kanban board organization',
              'Track assignments & due dates',
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-slate-600 dark:text-neutral-300">
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                {feature}
              </div>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl">
              <p className="text-sm text-rose-700 dark:text-rose-400">
                {error === 'AccessDenied'
                  ? 'Access denied. Your email is not authorized to use this app.'
                  : 'An error occurred during sign in. Please try again.'}
              </p>
            </div>
          )}

          {/* Sign in button */}
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl text-slate-700 dark:text-neutral-200 font-medium hover:bg-slate-50 dark:hover:bg-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 transition-all shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-neutral-500">
            Access is restricted to authorized users only
          </p>
        </div>

        {/* Subtle branding */}
        <p className="mt-6 text-center text-xs text-slate-400 dark:text-neutral-600 flex items-center justify-center gap-1.5">
          <Sparkles size={12} />
          Powered by AI
        </p>
      </div>
    </div>
  );
}
