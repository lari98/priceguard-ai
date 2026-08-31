'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.push('/overview');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reach the GeoGuard API.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={onSubmit} className="gg-panel w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-semibold">GeoGuard AI</h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--gg-muted)' }}>
          Tenant admin console
        </p>

        <label className="mb-1 block text-sm" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border px-3 py-2"
          style={{ backgroundColor: 'var(--gg-bg)', borderColor: 'var(--gg-border)' }}
        />

        <label className="mb-1 block text-sm" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border px-3 py-2"
          style={{ backgroundColor: 'var(--gg-bg)', borderColor: 'var(--gg-border)' }}
        />

        {error ? (
          <p className="mb-4 text-sm" style={{ color: 'var(--gg-danger)' }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md py-2 font-medium disabled:opacity-60"
          style={{ backgroundColor: 'var(--gg-accent)', color: 'white' }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
