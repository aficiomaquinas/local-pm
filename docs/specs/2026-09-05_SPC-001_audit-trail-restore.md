# Spec — Audit Trail & Restore (Payload Native Versions)

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`) |
| **ID** | SPC-001 |
| **Status** | APPROVED (2026-09-05). Implementation authorized — branch `feat/audit-trail`. |
| **Date** | 2026-09-05 |
| **Depends on** | PR anaskasmi/local-pm#1 (`fix/tsconfig-exclude-mcp-server`) — build base |
| **Related** | [REQ-002 — distinguished actor credentials & role policy](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [ADR-001](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) |
| **Scope driver** | Item 100001-adjacent of the TODO track (`~/.hermes/profiles/ttamayo/todo/TODO.md`); feature: filterable audit trail + restore, on Payload native `versions: true` |

---

## 1. Objective

Add an **audit trail + rollback** module to `local-pm` for the three collections
(`projects`, `teams`, `tickets`), using exclusively the native
[Payload CMS Versions](https://payloadcms.com/docs/versions/overview) mechanism
(`versions: true`, drafts disabled). No external versioning engines
(Dolt/TerminusDB/immudb are out of this spec), no custom event sourcing.

The visible surface is a **new frontend tab** ("name TBD", working name
`History`): an audit log filterable by parameters, where each entry is
inspectable (field-by-field diff against the previous/next state) and restorable
in one click.

## 2. Technical basis (verified against Payload 3.x docs)

What `versions: true` provides natively — this spec builds on this and nothing else:

1. **Auto-scaffold of `_slug_versions` collections** (`_projects_versions`,
   `_teams_versions`, `_tickets_versions`). Each version document stores:
   `{ _id, parent, autosave, version: {…full doc…}, createdAt, updatedAt }`
   (docs: *Database impact*).
2. **Snapshot per update** (*versions enabled, drafts disabled* mode): "Payload will
   simply create a new version of a document each time you update a document… any
   changes should *always* be treated as published". Matches local-pm's model
   (no editorial flow, no drafts).
3. **REST-exposed operations** (docs: *Version operations*), which the new tab
   consumes without writing its own backend:

   | Method | Path | Use in the module |
   |---|---|---|
   | GET | `/api/{slug}/versions?where=…&sort=-updatedAt&page=…&limit=…` | audit trail feed (native `where` query = filters) |
   | GET | `/api/{slug}/versions/:id` | entry detail |
   | POST | `/api/{slug}/versions/:id` | **restore** (one-click rollback) |

4. **Visual diff:** Payload's own Admin UI already renders diffs between versions
   (docs: *"view diffs in order to see exactly what has changed… and when"*). The new
   tab reuses the same data (version N vs N-1 compared by `parent` and date) with its
   own render: the candidate library is **jsondiffpatch** (structural diff, HTML
   diff, patch/unpatch) — evaluation in §6.
5. **Author of each change:** versions store the snapshot but the author field depends
   on the versions pipeline; see gap G-1.
6. **Access control:** versions inherit `readVersions`/`versions` ACLs. local-pm today
   has `access: read/create/update/delete: () => true` on the 3 collections →
   versions are therefore **de facto public** over REST. Gap G-3.

## 3. Scope

### In scope
1. `versions: true` on `Projects`, `Teams`, `Tickets` (+ `maxPerDoc` — §5.2).
2. New frontend tab `History` (App Router, route `/history`) with:
   - Consolidated chronological feed (3 collections) or per-collection (toggle).
   - Filters: collection, document (`parent`), date range, author (if G-1 resolved),
     free text over the versioned document's title/ticketId.
   - Expanded entry = visual diff (jsondiffpatch HTML) between the current `version`
     and the previous one of the same `parent`.
   - **Restore** action per entry (explicit confirmation → `POST …/versions/:id`).
   - Pagination (the endpoint is natively paginated).
3. Server-side route handler(s) under `/api/history` aggregating the 3 version
   collections (3 parallel `findVersions` calls via the Local API, merge + sort by
   date, pagination over the combined result). The frontend never hits the 3 version
   REST endpoints directly.
4. `readVersions` ACL + tests — **the §6 access policy, indispensable requirement**.

### Out of scope
- Drafts, autosave, publishing schedule (not applicable: local-pm has no editorial flow).
- Globals versioning (the repo has no globals).
- Lexical block-level richText diffs (v1: diff of the serialized Lexical object;
  later refinement).
- Custom retention policies (native: `maxPerDoc`).
- Sync with the upstream repo (that is the fork's work).

## 4. Design

### 4.1 Collection changes (minimal-invasive)

```ts
// src/collections/{Projects,Teams,Tickets}.ts — one line per file
  versions: {
    maxPerDoc: 100,   // §5.2
  },
```

No `drafts`. No data-shape changes (docs: *"They don't change the shape of
your data at all"*). The `_projects_versions`, `_teams_versions`,
`_tickets_versions` collections appear automatically on the first write after
deploy. Existing data: no retroactive versions — the trail starts at deploy
(accepted gap, G-4).

### 4.2 New structure (App Router, existing `(frontend)` convention)

```
src/app/(frontend)/history/
  page.tsx                  # server component: metadata + initial fetch
  HistoryClient.tsx         # client component: filters, feed, expansion, restore
src/app/api/history/
  route.ts                  # GET: consolidated aggregation of the 3 version collections
src/components/history/
  VersionDiff.tsx           # jsondiffpatch wrapper (HTML render + repo styles)
  VersionRow.tsx            # collapsible feed row (meta + Restore action)
  HistoryFilters.tsx        # filter bar
docs/specs/
  2026-09-05_SPC-001_audit-trail-restore.md   # este archivo
```

### 4.3 Aggregation endpoint `GET /api/history`

Query params: `collection=tickets|projects|teams|all` (default `all`),
`parent=<id>`, `from=ISO`, `to=ISO`, `q=<text>`, `page`, `limit` (default 20, cap 100).

Contrato de respuesta:

```jsonc
{
  "docs": [
    {
      "id": "<version id>",
      "collection": "tickets",
      "parent": "<doc id>",
      "parentLabel": "TICK-0042 · Fix pool PHP-FPM",   // resolved server-side
      "autosave": false,
      "createdAt": "…",
      "diff": { …jsondiffpatch delta vs the same parent's previous version… }  // optional, ?withDiff=1
    }
  ],
  "page": 1, "limit": 20, "totalDocs": 87
}
```

Restore does **not** go through this endpoint: the client calls the native REST
`POST /api/{slug}/versions/:id` (same origin, session cookies — no extra auth).

### 4.4 Visual diff

- **Engine:** `jsondiffpatch` (github.com/benjamine/jsondiffpatch). JS object diff,
  serializable delta, `html()` for render, `unpatch()` for programmatic revert
  (not required in v1 — native restore is by full version).
- Comparison: `version[N]` vs `version[N-1]` of the same `parent`, ordered by
  `updatedAt`. A `parent`'s first record (creation) → diff against `{}`.
- Render: "changelog" format (field → before → after), styled with the repo's
  conventions (Tailwind v4 present; semantic colors: green=added, red=removed, amber=changed).
- Arrays (`labels`, `subtasks`, `blockedBy`): jsondiffpatch with `objectHash`
  (by `name` in labels, by `title` in subtasks) for stable diffs.

### 4.5 UI/UX (v1, minimally evident)

```
┌ History ────────────────────────────────────────────────────────┐
│ [collection: all ▾] [doc: — ▾] [date range] [q________] [Filter] │
├──────────────────────────────────────────────────────────────────┤
│ ▸ 2026-09-05 14:32 · tickets · TICK-0042 Fix pool · by u1  [⟲]  │
│ ▸ 2026-09-05 13:58 · projects · omega-pcf ·            [⟲]      │
│ ▾ 2026-09-05 13:41 · tickets · TICK-0041 …                       │
│     status:  todo → in-progress                                  │
│     priority: medium (sin cambio)                                │
│     subtasks: + "revisar logs"                                   │
│     [Restore this version]  ← confirm modal                      │
└──────────────────────────────────────────────────────────────────┘
```

- Collapsible rows; expanded shows the diff (requirement: "more visual detail of what
  changed and where, and a UI where that is evident").
- Restore with confirmation; post-restore the row shows a "restored" badge and the feed
  refreshes (restore creates a new version — immediate feedback in the trail itself).

## 5. Open decisions and gaps (resolved before implementing)

- **D-1 · `maxPerDoc`:** proposal 100 (Payload's default is 100; fixed explicitly).
  Productive retention requirement pending from the user.
- **G-1 · Change author:** versions document `autosave` and dates; the author lives in
  `req.user` at update time. Verify at runtime whether the snapshot stores an author
  field; if not, minimal option: a `beforeChange` hook stamping `_lastChangedBy` onto
  the document (it enters the next snapshot). Does not block v1 (the trail works
  without author; the "by author" filter activates once resolved).
- **G-2 · Aggregation performance:** 3 parallel `findVersions` + in-memory merge;
  pagination over the merge. Sufficient at local-pm scale (v1). If it grows, move to a
  Mongo pipeline over the 3 `_versions` collections.
- **G-3 · Exposure:** resolved by decision — **ADR-001** (D1/D2): loopback-only
  binding in local mode and two-identity provisioning (master user + master agent
  user, distinguished credentials). The perimeter closes at the application layer
  with those two identities; the §6 policy restricts the trail by role.
- **G-4 · Retroactive trail:** does not exist for data predating deploy (by Payload
  design). Accepted in this spec.
- **G-5 · Tab name:** TBD by the user (`History` is the working name).

## 6. Access policy (NORMATIVE, indispensable requirement — xref REQ-002)

Per **REQ-002.4** ([distinguished actor credentials & role policy](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md)) and **ADR-001 (D2)**:

1. Provisioning is **two identities**: a single master user (human) and a single master agent user (automation), with distinguished credentials.
2. **The agent identity has NO access — by policy (role/ACL), not by convention — to audit trails or rollbacks:**
   - Version reads (`readVersions`, REST `GET …/versions*`, versions Admin UI): **denied to the agent**.
   - Restore/rollback (`POST …/versions/:id`): **denied to the agent**.
   - The audit trail and reversion capability are **exclusive to the master user** ("must be inaccessible to anyone but the user").
3. Corresponding minimal implementation: per-identity `readVersions` ACL; the restore operation is covered by the same exclusion (`update`/restore master user only). An agent attempt must respond denied (verification §7.7).

The agent exclusion is **policy**: even with a valid credential, trail/restore operations are barred by role. An agent able to rewrite history nullifies the audit trail's purpose (role separation = operational tamper-evidence).

## 7. Verification (acceptance criteria)

1. `docker compose up -d --build` green after the changes (PR #1 already fixes the base build).
2. CRUD from the Kanban generates entries in `_tickets_versions` (verified in Mongo).
3. `/history` lists the consolidated feed; every filter produces correct results against
   the test dataset (`npm run seed`).
4. Expanding an entry shows the field-by-field diff (added/removed/changed).
5. Restore from the tab leaves the document in the chosen version's state and creates a
   new version (visible in the feed itself).
6. No regression: board/projects/teams operate identically.
7. **Policy:** the agent identity receives DENIED on `GET …/versions` and `POST …/versions/:id`; the master user receives 200/success on both. Attribution: every version records the identity (agent vs user) of the change that produced it (xref REQ-002.2).

## 8. References

- Payload Versions (config, `_slug_versions`, REST/GraphQL/Local ops, ACL `readVersions`):
  payloadcms.com/docs/versions/overview
- [REQ-002 — distinguished actor credentials & role policy](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) (§6 normative basis)
- [REQ-001 — loopback-only binding](../requirements/2026-09-05_REQ-001_loopback-only-binding.md) · [ADR-001 — local-first, loopback-only, two-identity provisioning](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md)
- Payload Drafts (why it does NOT apply): payloadcms.com/docs/versions/drafts
- jsondiffpatch: github.com/benjamine/jsondiffpatch
- Build base: anaskasmi/local-pm@9848720 (+ PR #1 tsconfig fix)
