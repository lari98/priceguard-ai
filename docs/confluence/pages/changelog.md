---
title: "Changelog"
space: "GeoGuard AI Engineering"
parent: "Governance & Process"
labels: ["governance"]
source: "CHANGELOG.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/), and versioning follows the scheme fixed
in the master project brief:

```
v1.0.0  Initial production release
v1.0.1  Bug/security fixes
v1.0.2  VPN detection fix
v1.0.3  API reliability improvements
v1.1.0  Improved travel detection
v1.2.0  New fraud-graph capabilities
v1.3.0  Additional SDK/integrations
v2.0.0  Major architecture/API/model-generation change
```

No version has shipped yet. This repository is pre-1.0.0, in active Phase 2 (MVP) development.

## [Unreleased]

### Added
- Phase 0 discovery document.
- Phase 1 architecture set: C4 diagrams, ERD, data-flow diagram, OpenAPI draft, security
  architecture, GDPR data map, STRIDE threat model.
- ADR-0001 (Phase 0 scope), ADR-0002 (technology stack), ADR-0003 (repo/module structure),
  ADR-0004 (audit-log pseudonymisation vs. erasure).
- Phase 2 MVP scaffold: NestJS API (tenant, auth, risk ingestion, rule engine, policy,
  audit, appeals modules), Next.js admin dashboard, Prisma schema, Docker Compose for
  local dev, GitHub Actions CI.
