import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface LocationState {
  from?: { pathname?: string };
}

const DEMO_LOGINS = [
  'management@demo.drilliq',
  'office@demo.drilliq',
  'operation@demo.drilliq',
  'contractor-a@demo.drilliq',
];

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const target = (location.state as LocationState | null)?.from?.pathname ?? '/';

  // Already signed in? Skip the form.
  if (isAuthenticated) {
    navigate(target, { replace: true });
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">DrillIQ</h1>
        <p className="mt-1 text-sm text-gray-500">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <details className="mt-6 text-xs text-gray-500">
          <summary className="cursor-pointer select-none">Demo logins (password: demo-password)</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {DEMO_LOGINS.map((demo) => (
              <li key={demo}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(demo);
                    setPassword('demo-password');
                  }}
                  className="text-blue-600 hover:underline"
                >
                  {demo}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </main>
  );
}
