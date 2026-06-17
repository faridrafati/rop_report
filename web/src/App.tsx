import { Link, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RopOptimizationTab } from './features/rop/RopOptimizationTab';

interface HealthResponse {
  status?: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}

export function HealthBadge() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  const label = isLoading
    ? 'checking…'
    : isError
      ? 'offline'
      : (data?.status ?? 'ok');

  const tone = isLoading
    ? 'bg-gray-200 text-gray-700'
    : isError
      ? 'bg-red-100 text-red-700'
      : 'bg-green-100 text-green-700';

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${tone}`}
    >
      API: {label}
    </span>
  );
}

export function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight">DrillIQ</h1>
      <HealthBadge />
      <nav className="mt-2">
        <Link
          to="/rop"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          ROP optimization →
        </Link>
      </nav>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rop" element={<RopOptimizationTab />} />
    </Routes>
  );
}
