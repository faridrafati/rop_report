import { Suspense, useState } from 'react';
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
  void data;
  const tone = isLoading ? 'bg-slate-300' : isError ? 'bg-red-500' : 'bg-green-500';
  const title = isLoading ? 'checking' : isError ? 'API offline' : 'API ok';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone}`} title={title} />;
}

const navClass = (isActive: boolean) =>
  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <button
            onClick={() => { navigate('/'); setMenuOpen(false); }}
            className="flex shrink-0 items-center gap-2 font-bold tracking-tight text-slate-900"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-xs font-extrabold text-white">DQ</span>
            <span>DrillIQ</span>
          </button>

          {/* Desktop / tablet nav */}
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => navClass(isActive)}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-3 text-sm md:flex-none">
            <HealthDot />
            {user && (
              <span className="hidden text-right lg:block">
                <span className="block leading-tight text-slate-700">{user.email}</span>
                <span className="block text-xs leading-tight text-slate-400">{roleLabel[user.role] ?? user.role}</span>
              </span>
            )}
            <button onClick={logout} className="btn-ghost hidden px-3 py-1.5 md:inline-flex">Sign out</button>
            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="btn-ghost px-2 py-1.5 md:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? <path d="M6 6l12 12M6 18L18 6" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="border-t border-slate-200 bg-white px-3 py-2 md:hidden">
            <nav className="flex flex-col gap-1">
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => navClass(isActive)}
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              {user && <span className="truncate text-xs text-slate-500">{user.email} · {roleLabel[user.role] ?? user.role}</span>}
              <button onClick={() => { logout(); setMenuOpen(false); }} className="btn-ghost px-3 py-1">Sign out</button>
            </div>
          </div>
        )}
      </header>

      <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-400">Loading…</div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
