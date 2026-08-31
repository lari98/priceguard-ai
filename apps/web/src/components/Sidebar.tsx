'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import clsx from 'clsx';

const NAV = [
  { href: '/overview', label: 'Overview' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/ml', label: 'ML' },
  { href: '/fraud-graph', label: 'Fraud Graph' },
  { href: '/risk-events', label: 'Risk Events' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/investigations', label: 'Investigations' },
  { href: '/appeals', label: 'Appeals' },
  { href: '/policy', label: 'Policy & Rules' },
  { href: '/audit-log', label: 'Audit Log' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="gg-panel flex h-screen w-60 flex-col p-4">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">PriceGuard AI</h1>
        <p className="text-xs" style={{ color: 'var(--gg-muted)' }}>
          {user?.email}
          {user ? ` · ${user.role}` : null}
        </p>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx('block rounded-md px-3 py-2 text-sm', pathname?.startsWith(item.href) && 'font-semibold')}
            style={{
              backgroundColor: pathname?.startsWith(item.href) ? 'var(--gg-border)' : 'transparent',
              color: 'var(--gg-text)',
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        onClick={logout}
        className="rounded-md px-3 py-2 text-left text-sm"
        style={{ color: 'var(--gg-muted)' }}
      >
        Sign out
      </button>
    </aside>
  );
}
