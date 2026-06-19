import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';

describe('App', () => {
  it('renders the DrillIQ heading (login screen when unauthenticated)', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Unauthenticated: the protected "/" route redirects to /login, which also
    // renders the "DrillIQ" heading.
    const heading = screen.getByRole('heading', { name: 'DrillIQ' });
    expect(heading).toBeTruthy();
    expect(heading.textContent).toBe('DrillIQ');
  });
});
