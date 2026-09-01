---
title: "Project README"
space: "PriceGuard AI Engineering"
parent: "Governance & Process"
labels: ["governance"]
source: "README.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# PriceGuard AI (working name — unresolved, see ADR-0001)

**Global regional-pricing integrity and subscription-abuse detection platform.**

PriceGuard AI is a multi-tenant B2B API/SDK platform that helps companies charging
region-differentiated prices (streaming, SaaS, gaming, telecom, marketplaces, memberships)
detect patterns consistent with regional-pricing abuse — **without** assuming every
country mismatch is fraud. It produces an explainable, evidence-based, confidence-scored
signal; it never issues fines or auto-terminates accounts itself. Enforcement is always
configured and owned by the customer company, subject to their own contract and applicable law.

> This repository is being built in phases, per the project's master engineering brief.
> **Current phase: Phase 2 (MVP)**, on top of a completed Phase 0 (Discovery) and Phase 1 (Architecture).
> See [`docs/PHASE_0_DISCOVERY.md`](docs/PHASE_0_DISCOVERY.md), [`docs/architecture/`](docs/architecture/), and [`docs/adr/`](docs/adr/).

## What PriceGuard AI does

- Ingests session, device, network, and (tokenized) payment-country signals from a customer's app via API/SDK.
- Combines them into an explainable 0–100 risk score **and** a separately-reported "likely primary usage country" estimate — these are never merged into a single guilt/innocence flag.
- Evaluates a tenant-configured, no-code policy (nested AND/OR/NOT rules) against that score.
- Recommends (never unilaterally executes) a configurable enforcement action — warning, re-verification, restriction, migration, suspension, manual review — and always supports human review and customer appeal for anything beyond a warning.

## What PriceGuard AI does **not** do

- It does not conclude fraud from a single signal (e.g., one VPN-flagged session).
- It does not store raw payment card data (PCI scope stays with the customer's payment processor; PriceGuard only sees tokenized/derived signals the processor is contractually able to share).
- It does not impose fines, penalties, or damages claims. Any monetary/contractual action requires the tenant's own configuration and their own legal basis — PriceGuard does not invent legal authority.
- It does not claim GDPR compliance on a tenant's behalf. It provides privacy-by-design tooling (Privacy Control Center, retention config, DSAR support scaffolding) and documentation, but each tenant's DPIA and lawful-basis analysis is the tenant's (as data controller) responsibility. See [`PRIVACY.md`](PRIVACY.md).
- It does not currently claim any specific detection accuracy (e.g., "99% VPN detection") — no such claim is made until it is backed by a documented evaluation (brief §42).

## Repository layout

```
apps/
  api/            NestJS backend (tenant mgmt, ingestion, rule engine, policy, audit, appeals)
  web/            Next.js admin dashboard
packages/
  shared-types/   TypeScript types/DTOs shared between api and web (and future SDKs)
sdk/              Client SDKs: sdk/node/ (@priceguard/sdk-node), sdk/python/ (priceguard-sdk) — Phase 7, see docs/adr/0009-sdk-ecosystem-scope.md
infra/            Docker Compose / IaC for local & deployed environments
docs/
  PHASE_0_DISCOVERY.md
  architecture/   C4 diagrams, ERD, data-flow diagrams, OpenAPI spec, security & GDPR docs
  adr/            Architecture Decision Records
  compliance/     Draft compliance documents (DPIA template, retention policy, model card, etc.)
  confluence/     Confluence-import-ready copies of the docs above (Confluence-style page tree)
tests/
  e2e/            Cross-app end-to-end tests
scripts/          Dev/ops scripts
.github/          CI workflows, issue/PR templates, CODEOWNERS, Dependabot config
```

## Getting started (local development)

Prerequisites: Node.js 22.x, Docker (for Postgres + Valkey), npm 10.x.

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d postgres valkey
cd apps/api && npm install && npm run prisma:migrate && npm run start:dev
cd apps/web && npm install && npm run dev
```

Run the automated test suite:

```bash
cd apps/api && npm test           # unit tests
cd apps/api && npm run test:e2e   # integration/API tests, incl. multi-tenant isolation
```

## Documentation index

- Product/legal/technical discovery: [`docs/PHASE_0_DISCOVERY.md`](docs/PHASE_0_DISCOVERY.md)
- Architecture (C4, ERD, data flow, threat model, GDPR data map): [`docs/architecture/`](docs/architecture/)
- Decisions and their rationale: [`docs/adr/`](docs/adr/)
- Security posture: [`SECURITY.md`](SECURITY.md)
- Privacy posture: [`PRIVACY.md`](PRIVACY.md)
- Contribution guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Release history: [`CHANGELOG.md`](CHANGELOG.md)
- Confluence-ready space export (no live Atlassian connection — see why): [`docs/confluence/`](docs/confluence/)

## Status and known limitations

This is an active, in-progress build. It is **not** production-hardened and has **not**
undergone third-party security/privacy review (Phase 9). ML pipeline (Phase 4), fraud graph
(Phase 5), enterprise SSO/RBAC/DSAR (Phase 6), and two client SDKs — Node and Python
(Phase 7, `sdk/`, see `docs/adr/0009-sdk-ecosystem-scope.md`) — are implemented with
documented scope limits; see `docs/PHASE_0_DISCOVERY.md` §O and each phase's ADR for what's
real vs. explicitly deferred. Multi-region/HA scale testing (Phase 8) and production
hardening (Phase 9) are not yet done.
Do not deploy this to handle real customer data without completing Phases 8–9.
