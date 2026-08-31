import type { NextConfig } from 'next';

/**
 * The dashboard never talks to the database or to third parties directly — every read
 * and write goes through the NestJS API at API_BASE_URL, which enforces tenant scoping,
 * RBAC and audit logging server-side. This keeps the browser bundle free of any
 * credential or connection string (see docs/architecture/SECURITY_ARCHITECTURE.md).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
};

export default nextConfig;
