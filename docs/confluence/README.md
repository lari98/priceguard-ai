# Self-generated Confluence space (no Atlassian connector)

This folder is PriceGuard AI's documentation packaged as a ready-to-import Confluence space
tree — **without** connecting a live Atlassian/Confluence instance. That was a deliberate
choice by the project owner: work should be organised the way it would be in Confluence,
but nothing in this pipeline calls the Confluence REST API, stores an API token, or
requires an Atlassian account to exist yet.

## What's here

- `SPACE_HOME.md` — the space homepage: a nested list of every page, mirroring the
  hierarchy a Confluence space would have.
- `pages/*.md` — one file per page. Each starts with a small YAML front-matter block
  (`title`, `space`, `parent`, `labels`, `source`) — the metadata a Confluence import needs
  to place the page in the right spot in the tree and tag it — followed by the page body.

## Where the content comes from

**This folder is generated, not authored.** The actual source of truth is the plain
Markdown under `docs/`, `README.md`, `SECURITY.md`, `PRIVACY.md`, `CONTRIBUTING.md`, and
`CHANGELOG.md` at the repo root. `scripts/generate-confluence-space.js` reads a small
manifest (the intended page tree — which doc goes where, with what labels), copies each
source file's content in verbatim, and writes it out with the front-matter Confluence
metadata attached.

**Never hand-edit a file under `pages/`** — regenerating will silently overwrite it. Edit
the real source doc, then re-run:

```bash
node scripts/generate-confluence-space.js
```

This is safe to re-run any time; it fully clears and rebuilds `pages/` from the current
`docs/` content, so this folder can never drift out of sync with the source docs the way a
hand-copied wiki page can.

## When the team is ready to actually use Confluence

This export is intentionally tool-agnostic — it doesn't assume a specific import mechanism,
because that decision (which Confluence instance, which import path) belongs to the team,
not to this script. Two straightforward options once that decision is made:

1. **Manual paste-in.** Confluence's page editor accepts pasted Markdown directly for most
   of what's here (headings, lists, tables, code fences); the front-matter block tells you
   the intended title/parent/labels to set once pasted in.
2. **Scripted import via the Confluence REST API.** The front-matter's `parent` field
   already encodes the page tree, so a short script (create pages in tree order, using the
   Confluence "create content" endpoint with `storage` format converted from this Markdown)
   can walk `pages/*.md` and create the whole space in one pass. That script is not written
   yet — it's an easy follow-up specifically deferred until the team has decided to connect
   Atlassian, per the project owner's instruction not to do that now.

## Regenerating after a docs change

Add the new file to `PAGE_TREE` in `scripts/generate-confluence-space.js` (title, parent,
labels, and the `source` path), then re-run the script. CI does not run this
automatically — it's a deliberate, reviewed step so a docs PR and its Confluence-space
counterpart land in the same review, not silently diverge.
