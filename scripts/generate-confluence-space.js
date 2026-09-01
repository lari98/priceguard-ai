#!/usr/bin/env node
/**
 * Generates a self-maintained, Confluence-import-ready export of this repo's docs under
 * docs/confluence/pages/, plus a space homepage (docs/confluence/SPACE_HOME.md) listing
 * the full page tree.
 *
 * Why this exists: the project owner asked for documentation "all related workin gin
 * confluence" but explicitly declined to connect the live Atlassian/Confluence connector
 * ("or build confluence own i donot want atlassian"). This script is the alternative: it
 * does not call any Confluence API and requires no credentials. It just repackages the
 * canonical docs (docs/**\/*.md, which remain the single source of truth — this script
 * never hand-edits content) into a page tree with the metadata a Confluence import needs
 * (title, parent, labels), so that whenever the owner does want a real Confluence space,
 * either pasting these pages in by hand or scripting the REST API against this export is
 * a mechanical, low-risk step — not a rewrite.
 *
 * Usage: node scripts/generate-confluence-space.js
 * Re-run any time docs/ changes; output is fully regenerated (safe to re-run, idempotent).
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'confluence', 'pages');
const SPACE_NAME = 'PriceGuard AI Engineering';

/**
 * The intended Confluence page tree. `source` is relative to the repo root; `slug`
 * becomes both the output filename and the stable id other pages reference as `parent`.
 * This manifest is the one thing in this pipeline that IS hand-maintained — add a line
 * here whenever a new doc is added under docs/.
 */
const PAGE_TREE = [
  { slug: 'space-home', title: SPACE_NAME, parent: null, labels: ['home'] },

  { slug: 'phase-0-discovery', title: 'Phase 0 — Discovery', parent: 'space-home', source: 'docs/PHASE_0_DISCOVERY.md', labels: ['discovery', 'phase-0'] },

  { slug: 'architecture', title: 'Architecture', parent: 'space-home', labels: ['architecture'], section: true },
  { slug: 'c4-diagrams', title: 'C4 Diagrams', parent: 'architecture', source: 'docs/architecture/C4_DIAGRAMS.md', labels: ['architecture'] },
  { slug: 'data-flow', title: 'Data Flow', parent: 'architecture', source: 'docs/architecture/DATA_FLOW.md', labels: ['architecture'] },
  { slug: 'erd', title: 'Entity-Relationship Diagram', parent: 'architecture', source: 'docs/architecture/ERD.md', labels: ['architecture', 'data-model'] },
  { slug: 'security-architecture', title: 'Security Architecture', parent: 'architecture', source: 'docs/architecture/SECURITY_ARCHITECTURE.md', labels: ['security'] },
  { slug: 'threat-model', title: 'Threat Model (STRIDE)', parent: 'architecture', source: 'docs/architecture/THREAT_MODEL.md', labels: ['security'] },
  { slug: 'gdpr-data-map', title: 'GDPR Data Map', parent: 'architecture', source: 'docs/architecture/GDPR_DATA_MAP.md', labels: ['privacy', 'gdpr'] },

  { slug: 'adrs', title: 'Architecture Decision Records', parent: 'space-home', labels: ['adr'], section: true },
  { slug: 'adr-0001', title: 'ADR-0001: Phase 0 Scope and Working Name', parent: 'adrs', source: 'docs/adr/0001-phase0-scope-and-working-name.md', labels: ['adr'] },
  { slug: 'adr-0002', title: 'ADR-0002: Technology Stack', parent: 'adrs', source: 'docs/adr/0002-technology-stack.md', labels: ['adr'] },
  { slug: 'adr-0003', title: 'ADR-0003: Modular Monolith Structure', parent: 'adrs', source: 'docs/adr/0003-modular-monolith-structure.md', labels: ['adr'] },
  { slug: 'adr-0004', title: 'ADR-0004: Audit Log Pseudonymisation on Erasure', parent: 'adrs', source: 'docs/adr/0004-audit-log-pseudonymisation-on-erasure.md', labels: ['adr', 'privacy'] },
  { slug: 'adr-0005', title: 'ADR-0005: Drizzle, Not Prisma', parent: 'adrs', source: 'docs/adr/0005-drizzle-not-prisma.md', labels: ['adr'] },
  { slug: 'adr-0006', title: 'ADR-0006: ML Shadow Rollout Scope', parent: 'adrs', source: 'docs/adr/0006-ml-shadow-rollout.md', labels: ['adr', 'ml'] },
  { slug: 'adr-0007', title: 'ADR-0007: Fraud Graph on Postgres', parent: 'adrs', source: 'docs/adr/0007-fraud-graph-on-postgres.md', labels: ['adr', 'fraud-graph'] },
  { slug: 'adr-0008', title: 'ADR-0008: Phase 6 Enterprise Compliance Scope', parent: 'adrs', source: 'docs/adr/0008-enterprise-compliance-scope.md', labels: ['adr', 'enterprise', 'compliance'] },
  { slug: 'adr-0009', title: 'ADR-0009: Phase 7 SDK Ecosystem Scope', parent: 'adrs', source: 'docs/adr/0009-sdk-ecosystem-scope.md', labels: ['adr', 'sdk'] },
  { slug: 'adr-0010', title: 'ADR-0010: Phase 8 Scale Scope', parent: 'adrs', source: 'docs/adr/0010-scale-phase8-scope.md', labels: ['adr', 'scale', 'performance'] },
  { slug: 'phase-8-load-test', title: 'Phase 8 Load Test Results', parent: 'space-home', source: 'docs/performance/PHASE_8_LOAD_TEST.md', labels: ['performance'] },
  { slug: 'adr-0011', title: 'ADR-0011: Phase 9 Production Hardening Scope', parent: 'adrs', source: 'docs/adr/0011-production-hardening-scope.md', labels: ['adr', 'security'] },
  { slug: 'incident-response', title: 'Incident Response Runbooks', parent: 'space-home', source: 'docs/security/INCIDENT_RESPONSE.md', labels: ['security'] },

  { slug: 'ml', title: 'Machine Learning', parent: 'space-home', labels: ['ml'], section: true },
  { slug: 'abuse-scenario-catalogue', title: 'Abuse Scenario Catalogue', parent: 'ml', source: 'docs/ml/ABUSE_SCENARIO_CATALOGUE.md', labels: ['ml', 'phase-3', 'phase-4'] },

  { slug: 'governance', title: 'Governance & Process', parent: 'space-home', labels: ['governance'], section: true },
  { slug: 'readme', title: 'Project README', parent: 'governance', source: 'README.md', labels: ['governance'] },
  { slug: 'security-policy', title: 'Security Policy', parent: 'governance', source: 'SECURITY.md', labels: ['security', 'governance'] },
  { slug: 'privacy-policy', title: 'Privacy Policy', parent: 'governance', source: 'PRIVACY.md', labels: ['privacy', 'governance'] },
  { slug: 'contributing', title: 'Contributing Guide', parent: 'governance', source: 'CONTRIBUTING.md', labels: ['governance'] },
  { slug: 'changelog', title: 'Changelog', parent: 'governance', source: 'CHANGELOG.md', labels: ['governance'] },
];

function readSource(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`generate-confluence-space: manifest references missing file "${relPath}"`);
  }
  return fs.readFileSync(abs, 'utf8');
}

function frontMatter(page) {
  const lines = ['---', `title: "${page.title}"`, `space: "${SPACE_NAME}"`];
  if (page.parent) lines.push(`parent: "${byId(page.parent).title}"`);
  if (page.labels?.length) lines.push(`labels: [${page.labels.map((l) => `"${l}"`).join(', ')}]`);
  if (page.source) lines.push(`source: "${page.source}"`, 'generated_by: "scripts/generate-confluence-space.js — do not hand-edit, edit the source file instead"');
  lines.push('---', '');
  return lines.join('\n');
}

const byIdMap = new Map(PAGE_TREE.map((p) => [p.slug, p]));
function byId(slug) {
  const page = byIdMap.get(slug);
  if (!page) throw new Error(`generate-confluence-space: manifest references unknown parent slug "${slug}"`);
  return page;
}

function buildTree(parentSlug, depth) {
  return PAGE_TREE.filter((p) => p.parent === parentSlug)
    .map((p) => `${'  '.repeat(depth)}- [${p.title}](pages/${p.slug}.md)\n${buildTree(p.slug, depth + 1)}`)
    .join('');
}

function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const page of PAGE_TREE) {
    const body = page.source ? readSource(page.source) : `# ${page.title}\n\nSection page — see child pages below.\n`;
    const content = frontMatter(page) + body;
    fs.writeFileSync(path.join(OUT_DIR, `${page.slug}.md`), content, 'utf8');
  }

  const homeContent = [
    `# ${SPACE_NAME}`,
    '',
    `Self-generated Confluence-space export — see \`docs/confluence/README.md\` for what this is and how to import it. Regenerate with \`node scripts/generate-confluence-space.js\` any time \`docs/\` changes.`,
    '',
    '## Page tree',
    '',
    buildTree(null, 0).trimEnd(),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REPO_ROOT, 'docs', 'confluence', 'SPACE_HOME.md'), homeContent, 'utf8');

  console.log(`Generated ${PAGE_TREE.length} Confluence-ready pages into docs/confluence/pages/, plus SPACE_HOME.md.`);
}

main();
