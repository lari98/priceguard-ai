import type { Metadata } from 'next';
import { AppProviders } from '@/components/AppProviders';
import './globals.css';

export const metadata: Metadata = {
  title: 'GeoGuard AI — Admin Console',
  description: 'Regional-pricing integrity and subscription-abuse detection — tenant admin console.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
