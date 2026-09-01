---
title: "Contributing Guide"
space: "PriceGuard AI Engineering"
parent: "Governance & Process"
labels: ["governance"]
source: "CONTRIBUTING.md"
generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"
---
# Contributing

## Workflow

1. Branch from `main` using `type/short-description` (e.g., `feat/rule-engine-not-operator`).
2. Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit message
   (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `security:`), since `CHANGELOG.md`
   generation and semantic-version bumps are derived from these.
3. Every PR must pass CI (`.github/workflows/ci.yml`: lint, typecheck, unit tests, integration
   tests, `npm audit`) before merge, per `.github/PULL_REQUEST_TEMPLATE.md`.
4. No PR may disable or skip a failing test to make CI green — fix the code or fix the test,
   per the master engineering brief's explicit rule against hiding failures.
5. Any new personal-data field added to the Drizzle schema (`apps/api/src/db/schema.ts`) must be added to
   `docs/architecture/GDPR_DATA_MAP.md` in the same PR, with a stated purpose and retention
   tier — enforced in code review, not tooling, for now.
6. Any non-trivial architectural decision gets an ADR in `docs/adr/` (see `docs/adr/0001-*.md`
   for the template/shape).

## Local setup

See `README.md` → "Getting started."

## Definition of Done (per master brief §53)

A change is not done because code compiles. It is done when: tests exist and pass,
security implications have been considered (note them in the PR description if non-obvious),
privacy implications have been considered (data map updated if applicable), documentation
is updated, failure modes are considered, and — for API changes — the OpenAPI spec in
`docs/architecture/openapi.yaml` is updated to match.
