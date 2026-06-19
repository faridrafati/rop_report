import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  roles?: string[]; // omitted ⇒ visible to all authenticated roles
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview' },
  { to: '/rop', label: 'ROP optimization' },
  { to: '/capture', label: 'Capture' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/plans', label: 'Plans', roles: ['OFFICE_ENGINEER', 'MANAGEMENT'] },
  { to: '/reports', label: 'Reports' },
];

const roleLabel: Record<string, string> = {
  MANAGEMENT: 'Management',
  OFFICE_ENGINEER: 'Office Engineer',
  OPERATION_ENGINEER: 'Operation Engineer',
  CONTRACTOR: 'Contractor',
};

function HealthDot() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/api/health');
      if (!r.ok) throw new Error('down');
      return r.json() as Promise<{ status?: string }>;
    },
    retry: false,
    refetchInterval: 30000,
  });
  const tone = isLoading ? 'bg-slate-300' : isError ? 'bg-red-500' : 'bg-green-500';
  const title = isLoading ? 'checking' : isError ? 'API offline' : 'API ok';
  return <span className={`inline-block h-2 w-2 rounded-full ${tone}`} title={title} />;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 font-bold tracking-tight text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-xs font-extrabold text-white">DQ</span>
            DrillIQ
          </button>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <HealthDot />
            {user && (
              <span className="hidden text-right sm:block">
                <span className="block leading-tight text-slate-700">{user.email}</span>
                <span className="block text-xs leading-tight text-slate-400">{roleLabel[user.role] ?? user.role}</span>
              </span>
            )}
            <button onClick={logout} className="btn-ghost px-3 py-1.5">Sign out</button>
          </div>
        </div>
      </header>
      <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-400">Loading…</div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
