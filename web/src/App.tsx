import { lazy } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './auth/LoginPage';

// Code-split feature tabs so the heavy Plotly/Recharts bundles load on demand
// (keeps the initial app — login + overview — light and fast).
const RopOptimizationTab = lazy(() => import('./features/rop/RopOptimizationTab').then((m) => ({ default: m.RopOptimizationTab })));
const CaptureTab = lazy(() => import('./features/capture/CaptureTab').then((m) => ({ default: m.CaptureTab })));
const DashboardTab = lazy(() => import('./features/dashboard/DashboardTab').then((m) => ({ default: m.DashboardTab })));
const PlansTab = lazy(() => import('./features/plans/PlansTab').then((m) => ({ default: m.PlansTab })));
const ReportsTab = lazy(() => import('./features/reports/ReportsTab').then((m) => ({ default: m.ReportsTab })));

interface Tile {
  to: string;
  title: string;
  desc: string;
  accent: string;
  roles?: string[];
}

const TILES: Tile[] = [
  { to: '/rop', title: 'ROP optimization', desc: 'WOB×RPM drill-off maps, MSE, hydraulics and economics over captured bit runs.', accent: 'bg-blue-600' },
  { to: '/capture', title: 'Capture', desc: 'Log bit runs (8-position IADC dull grade, dysfunction flags) and daily reports.', accent: 'bg-emerald-600' },
  { to: '/dashboard', title: 'Management dashboard', desc: 'Fleet KPIs: cost/m, NPT %, MSE, founder rate, bit leaderboard, cross-plots.', accent: 'bg-violet-600' },
  { to: '/plans', title: 'Plans & approvals', desc: 'Bit/parameter recommendations with an approval workflow.', accent: 'bg-amber-600', roles: ['OFFICE_ENGINEER', 'MANAGEMENT'] },
  { to: '/reports', title: 'Reports & exports', desc: 'Generate PDF and Excel reports of bit runs and DDRs — scoped to your client.', accent: 'bg-rose-600' },
];

export function Overview() {
  const { user } = useAuth();
  const tiles = TILES.filter((t) => !t.roles || (user && t.roles.includes(user.role)));
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome to DrillIQ</h1>
      <p className="mt-1 text-sm text-slate-500">Plan → capture → analyze → report. Pick a workspace below.</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="card group flex flex-col gap-2 p-5 transition-shadow hover:shadow-md">
            <span className={`h-1.5 w-10 rounded-full ${t.accent}`} />
            <h2 className="text-base font-semibold text-slate-900 group-hover:text-blue-700">{t.title}</h2>
            <p className="text-sm text-slate-500">{t.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Overview />} />
        <Route path="/rop" element={<RopOptimizationTab />} />
        <Route path="/capture" element={<CaptureTab />} />
        <Route path="/dashboard" element={<DashboardTab />} />
        <Route path="/plans" element={<PlansTab />} />
        <Route path="/reports" element={<ReportsTab />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
