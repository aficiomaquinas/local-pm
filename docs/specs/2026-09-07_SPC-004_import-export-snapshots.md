# Spec — Import/Export & Named Snapshots (Payload native `@payloadcms/plugin-import-export`)

| | | |
|---|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`, branch `master`) |
| **ID** | SPC-004 |
| **Date** | 2026-09-07 |
| **Status** | APPROVED (2026-09-07) — operator decisions recorded (§6 D-1…D-5). Implementation authorized: branch `feat/auth-upgrade-datamanagement` (spine: upgrade → auth bridge → plugin → reset tool → frontend panel) + `feat/ui-fixes-soft-delete` (parallel UI wave). |
| **Type** | Specification (resolves [REQ-004](../requirements/2026-09-06_REQ-004_import-export-snapshots.md)) |
| **Depends on** | Payload upgrade 3.68.4 → ≥ 3.85 (hard requirement, §3.2) · ADR-002 auth wiring (functional prerequisite, §3.4) |
| **Related** | [REQ-002 — distinguished actor credentials](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [ADR-001 — loopback-only, two identities](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) · [ADR-002 — OIDC authentication](../adr/2026-09-05_ADR-002_oidc-authentication.md) · [SPC-001 — audit trail & restore](../specs/2026-09-05_SPC-001_audit-trail-restore.md) · [SPC-002 — workspace restructure](../specs/2026-09-05_SPC-002_workspace-restructure.md) · [SPC-003 — testing strategy](../specs/2026-09-06_SPC-003_testing-strategy.md) |
| **Scope driver** | Operator delegation (wave-2, post-SPC-003): research + this spec only. Implementation NOT authorized here. |

Reference markers `[n]` cite §8. Evidence marked **[verified]** was produced by direct inspection (npm registry, package tarballs, repo files) during this research; `[unverified]` items are flagged inline.

---

## 1. Objective

Resolve REQ-004: file-based import/export for the business collections (`projects`,
`teams`, `tickets`) with **named snapshots** (dated, listable, re-downloadable),
on **both surfaces** (superadmin frontend + backend/API), using the official
[`@payloadcms/plugin-import-export`](https://payloadcms.com/docs/plugins/import-export) [1]
rather than custom machinery (operator instruction, REQ-004 delimitations).

Delimitations resolved here: native coverage vs gaps (per-collection vs whole-DB,
archive formats), Jobs Queue requirement, ACL superadmin-only, frontend vs admin
surface, backend/MCP exposure, and import merge semantics over existing data.

## 2. Current state (repo evidence)

Verified against the working tree at `744b9cc` (post wave-1):

1. **The plugin is not present anywhere**: zero matches for
   `plugin-import-export` in source and in `pnpm-lock.yaml` [12].
2. **No `plugins` array** in `apps/web/src/payload.config.ts` — collections are
   exactly `Projects, Teams, Tickets`; mongooseAdapter/Mongo; no auth-enabled
   collection exists (no `users` collection → `req.user` is always `undefined`
   today, as ADR-002 is pending) [12].
3. **Payload stack pinned at 3.68.4** (`payload` + `@payloadcms/*` in
   `apps/web/package.json`, exact-resolved in the lockfile) [12].
4. **Business schema** (`Tickets.ts` as the richest case): `richText`
   (Lexical) `description`, `select` status/priority, relationships `project`/
   `team`, self-referencing `hasMany` `blockedBy`, arrays `labels`
   (`name`+`color`) and `subtasks`, `date` `dueDate` [12].
5. **ACL precedent**: `apps/web/src/access/actorPolicy.ts` (SPC-001 §6) —
   `resolveActorType`/`isMasterUser` with deny-by-default for anonymous and hard
   denial for the agent identity. This is the pattern SPC-004 reuses (§4e) [12].
6. **Persistence**: docker-compose mounts a volume only for Mongo
   (`local-pm-mongodb-data`); the web service has **no volume** — container FS
   is ephemeral across rebuilds [12]. Relevant to where saved snapshots live (§6 R-3).
7. **Quality gate**: `pnpm verify` (build + tests, 107 tests) and the docker
   build gate exist (SPC-003) [12].

## 3. Research findings

### 3.1 The plugin has TWO API generations — the docs describe only the new one

The official docs [1] describe the current API (per-collection `ExportConfig`/
`ImportConfig`, import with preview and modes, hooks, `exports`/`imports`
upload collections, jobs queue integration, dynamic limits). Direct inspection
of the published tarballs shows local-pm's pinned version predates all of that:

| | `plugin-import-export@3.68.4` (repo-pinned) | `plugin-import-export@3.88.0` (npm `latest`) |
|---|---|---|
| Import capability | **Absent** — export-only | Present (`ImportListMenuItem`, `ImportPreview`, `ImportSaveButton`, `dist/import/*`, `imports` collection) **[verified: tarball]** |
| Plugin config type | `collections?: string[]`, `debug`, `disableDownload`, `disableJobsQueue`, `disableSave`, `format`, `overrideExportCollection` — flat, export-only **[verified: `dist/types.d.ts`]** | Per-collection `export?: boolean \| ExportConfig`, `import?: boolean \| ImportConfig` with `batchSize`, `disableJobsQueue`, `hooks`, `limit`, `overrideCollection`; top-level `overrideExportCollection`/`overrideImportCollection` **[verified: `dist/types.d.ts`]** |
| Admin UI | Export drawer only | Export + Import drawers, preview, selection modes **[verified: components list]** |
| Per-collection targets / hidden group | No | Yes (`exports`/`imports` collections, `admin.group: false` by default) **[verified: `getExportCollection.js`]** |

Corroborating history: issue #13259 ("Where is import guys?", plugin 3.46.0,
Jul 2025) documents the plugin was export-only and asks for import [3]; the
maintainer thread on CSV relationship/array export quirks (discussion #11979)
shows the `toCSV` hook landing at v3.42.0 [10]; issue #15526 references the
plugin refactor that shipped between Payload 3.57→3.74 [9]; the official
release post announces **out of beta in Payload 3.85.0** with collection-level
and field-level hooks [2]. npm `dist-tags`: `latest = 3.88.0` (exact peer
`payload: 3.68.4` exists for the pinned line — verified via `npm view`) [4][5].

**Consequence:** on the current pin (3.68.4), REQ-004.2 (import) is
**unachievable natively**. The upgrade to ≥ 3.85 is a hard requirement for this
spec. Recommended target: `3.88.x` (same monorepo versioning as `payload` —
upgrade `payload` and every `@payloadcms/*` in lockstep).

### 3.2 Version compatibility

`@payloadcms/plugin-import-export` is versioned in the Payload monorepo and its
peerDependencies pin the exact `payload`/`@payloadcms/ui` versions (verified for
3.68.4: `peerDependencies = { payload: '3.68.4', '@payloadcms/ui': '3.68.4' }`)
[4][5]. Therefore: upgrade all Payload packages to the same `3.88.x` line and
install the plugin at the matching version. The repo already pins exact
versions via the lockfile, so this stays deterministic.

### 3.3 Snapshots with date in the name is native-adjacent

Verified in the 3.88.0 tarball [6]:

- The `exports` collection is an upload collection with `useAsTitle: 'name'`,
  `admin.group: false` (hidden by default; routes remain reachable), custom
  endpoints `POST /download` and `POST /export-preview`, and
  `access: { update: () => false }` (saved exports are immutable).
- The export document's `name` field **defaults to a native timestamp
  generator** `getFilename()` → `YYYY-MM-DD_HH-MM-SS` (filesystem-safe), and
  the export input accepts an explicit `name` (the drawer lets the operator
  name the saved export).
- Formats carry proper mime/extension (`text/csv` / `application/json`).

So REQ-004.3 (dated named snapshot, listable, re-downloadable) is satisfied by
the native `name` default + the `exports` list view. Native quirk worth
recording: `getFilename()` mixes UTC date (`toISOString`) with local time
(`toTimeString`) [6] — cosmetic only; the naming convention in §4b absorbs it.

### 3.4 Auth is a functional prerequisite (not just an ACL concern)

Verified in 3.88.0 `dist/export/createExport.js`: `createExport` **throws**
`'User authentication is required to create exports.'` when no user resolves
[6]. The primary surface is the admin UI, which requires login, which requires
an auth-enabled collection — local-pm has none (§2.2). **Until ADR-002 wiring
lands (or a minimal bridge exists, D-2), the plugin installs but cannot
function for anyone.** This spec proposes the ACL to be deny-by-default in the
meantime, which is safe and consistent with SPC-001's decision.

### 3.5 Jobs Queue — decision input

Docs [1]: the plugin uses the Jobs Queue by default; without a configured
runner (`jobs.autoRun`, bin script, or API endpoint) queued imports/exports
**stay pending forever**; `disableJobsQueue: true` (per-collection, post-3.74
API) runs operations synchronously, blocking the request until done. Jobs
Queue overview [7]: `autoRun` targets dedicated servers and runs a cron loop
inside the Next.js process. local-pm is a single-user local deployment at
127.0.0.1:3010 (ADR-001) — the sync path is strictly simpler and there is no
worker infrastructure to leverage.

### 3.6 What the plugin does NOT cover

- **Whole-DB snapshot**: the plugin is strictly **per-collection** [1]. There
  is no single whole-database export. A "full snapshot" is a set of
  per-collection exports sharing a moment (§4b).
- **Archive formats** (zip/tar): not supported — `format` is `csv | json` [1].
  REQ-004's "archive" clause is therefore out of native scope (§6 G-2).
- **Whole-DB disaster recovery** is an infra concern better served by
  `mongodump` against the existing `local-pm-mongodb-data` volume; community
  guidance for Payload backups points the same way [8]. Out of this spec's scope.

### 3.7 Import semantics over existing data (duplicates question)

Docs [1]: import modes are `create` (fails on existing IDs), `update`
(requires matching IDs), `upsert` (create-or-update by `id`, with optional
`matchField` for natural keys). Post-import the `imports` document records
`status` and a `summary` (`total/imported/updated/issues/issueDetails`).
**Answering REQ-004's delimitation**: re-importing a snapshot over live data
does not blindly duplicate rows — `upsert` overwrites by ID. Snapshot restore
(per-collection, file-driven) is distinct from SPC-001's per-document versions
restore; both may coexist.

Known defect relevant to local-pm's schema: **#17110** (open against 3.85.1)
reports that a collection exported with a `hasMany` relationship imports with
those columns ignored (empty relation) [11]. `tickets.blockedBy` is exactly
such a field → risk R-2, with acceptance test (§7.4) and fallback (§6).

## 4. Design

### (a) Plugin configuration (`payload.config.ts`, post-upgrade)

```ts
import { importExportPlugin } from '@payloadcms/plugin-import-export'
import { dataManagementAccess } from './access/dataManagementPolicy'

// inside buildConfig({ ... })
plugins: [
  importExportPlugin({
    collections: [
      { slug: 'projects', export: { format: 'json', disableJobsQueue: true }, import: { disableJobsQueue: true } },
      { slug: 'teams',    export: { format: 'json', disableJobsQueue: true }, import: { disableJobsQueue: true } },
      { slug: 'tickets',  export: { format: 'json', disableJobsQueue: true }, import: { disableJobsQueue: true } },
    ],
    overrideExportCollection: ({ collection }) => ({
      ...collection,
      access: { ...collection.access, read: dataManagementAccess, create: dataManagementAccess },
      admin: { ...collection.admin, group: 'Data Management' },
    }),
    overrideImportCollection: ({ collection }) => ({
      ...collection,
      access: { ...collection.access, read: dataManagementAccess, create: dataManagementAccess },
      admin: { ...collection.admin, group: 'Data Management' },
    }),
  }),
],
```

**Format = `json` for the three collections (decided).** Justification: the
schema is structurally rich — Lexical `richText` descriptions, nested arrays
(`labels`, `subtasks`), `hasMany` self-relation (`blockedBy`). JSON export
preserves nested structure, Lexical bodies and relationship references exactly
[1]; CSV flattens to `array_0_name`-style columns, auto-coerces values
(`null`/`true`/numerics) and is the lossy path for exactly these shapes
[1][10]. `format` forces the format and hides the dropdown [1]; if a
spreadsheet workflow appears later, per-collection CSV can be revisited (D-4).
The shared default `exports`/`imports` collections serve all three slugs (no
per-collection slug overrides needed) → one tidy "Data Management" group.

**`disableJobsQueue: true` per collection, export and import (decided).**
Justification: the queued path requires a runner (`autoRun` cron inside Next or
an external trigger) or jobs sit `pending` forever [1][7] — infrastructure
local-pm deliberately does not run (local-first, single process, ADR-001). At
local data scale the synchronous request is instant and matches the
export→download UX. The trade-off (request blocks; no background durability)
is acceptable below ~10⁴ docs (§6 R-6 threshold to revisit).

### (b) Named snapshots (REQ-004.3) on the native `exports` collection

- **Naming**: the native `name` default is already a dated filename,
  `YYYY-MM-DD_HH-MM-SS` (§3.3) — it satisfies "date embedded in the name".
  A full snapshot moment = the operator saves the three per-collection exports
  in one sitting; the shared timestamp groups them naturally in the list.
  Recommended manual convention when an explicit label is wanted:
  `snapshot-YYYY-MM-DD_HH-MM-SS-<collection>` typed into the export drawer's
  name field. **No custom code is introduced for naming** (operator preference
  for standard components; a `beforeChange` rename hook is a rejected
  alternative — it adds machinery for a cosmetic prefix).
- **Listing / re-download**: `exports` appears under the "Data Management"
  admin group (via `overrideExportCollection`), ordered by `name`/`createdAt`
  (`useAsTitle: 'name'`); opening a saved export offers the file download
  (native `disableDownload: false`) [1][6]. `access.update: () => false`
  makes saved snapshots immutable [6] — a property, not a limitation
  (re-saving creates a new dated entry).

### (c) Frontend surface — recommendation: native admin panel (no custom tab)

The plugin ships the complete admin experience: Export drawer (format,
selection modes: all/filtered/selected, field picker, preview), Import drawer
with preview before commit, and the `exports`/`imports` list views [1]. A
custom `(frontend)/history`-style tab (SPC-001 pattern) is **not justified
here**: SPC-001 built a custom tab because the audit trail is a *product
feature* of the Kanban; import/export is an operator maintenance function, and
the admin panel is the standard, well-supported surface for it (REQ-004
delimitation: "preferably the officially supported plugin, rather than
custom-built machinery"). **Recommendation: admin panel only.** A custom
frontend tab remains a future option if the operator wants snapshot
management inside the user-facing app (D-5).

### (d) Backend/MCP exposure — decision: none by default

REQ-004.4 asks for a backend surface "respecting the actor/channel attribution
model of REQ-002". The plugin technically exposes REST (create on the
`exports`/`imports` upload collections, `POST /api/exports/download`,
`POST /api/exports/export-preview` [1][6]), so no custom endpoints are needed
*if* it were ever enabled. **Decision: agents get NO import/export access, and
`packages/mcp-server` (19 REST tools) gains no new tools in this spec.**
Rationale (consistent with REQ-002/ADR-002/SPC-001 §6): an agent that can
export exfiltrates the full dataset bypassing channel attribution; an agent
that can import performs mass mutation outside the audit trail — both nullify
the role separation that SPC-001 established as tamper-evidence. The backend
surface exists (native REST, superadmin-credentialed, e.g. for scripted
backups by the operator) but is out of scope for agent tooling unless the
operator later decides otherwise explicitly.

### (e) ACL — superadmin-only via the `actorPolicy` pattern (4 surfaces)

New module `apps/web/src/access/dataManagementPolicy.ts`, imitating
`actorPolicy.ts` (§2.5) and extending its semantics with the ADR-002 role:

```ts
import type { Access } from 'payload'
import { resolveActorType } from './actorPolicy'

/**
 * SPC-004 §4e — NORMATIVE (xref REQ-002, ADR-002, SPC-001 §6).
 * Import/export and the saved-snapshot collections are superadmin-only.
 * Pre-OIDC (ADR-002 pending) the master user IS the superadmin identity.
 * No user → denied (deny-by-default, same decision as SPC-001 §6).
 * The agent identity is barred BY POLICY, not by convention.
 */
export const dataManagementAccess: Access = ({ req }) => {
  const t = resolveActorType(req?.user)
  if (t === 'agent') return false   // REQ-002/ADR-002: no agent import/export
  if (!t) return false              // no auth yet → deny-by-default
  const role = (req.user as { role?: unknown })?.role
  if (typeof role === 'string') return role === 'superadmin'  // post-ADR-002 claims
  return true                       // master user, pre-claims
}
```

Applied to **four surfaces**: `exports.read`, `exports.create`,
`imports.read`, `imports.create` (the plugin's operations run through these
collections' create flow and their custom endpoints [1][6]). While auth does
not exist this resolves to `false` for everyone — the surfaces are wired,
configured, and safely inert (§3.4). Docs warning honored: read access to the
exports collection means ability to download the data it holds [1], hence it
is gated identically. `[unverified]`: whether the plugin's custom endpoints
(`/download`, `/export-preview`) enforce the collection access on every code
path — acceptance §7.5 probes all four routes plus these endpoints; if a leak
is found, the fix is an upstream issue + local endpoint-level access override.

### (f) TypeScript typing

- Post-upgrade, typed plugin options come from the package:
  `ExportConfig`/`ImportConfig`/`ImportExportPluginConfig` (verified present in
  the 3.88.0 `dist/types.d.ts` [6]; the `/types` export subpath exists in the
  package exports map **[unverified for 3.88 — verified for 3.68]**).
- `pnpm generate:types` will pick up the injected `exports`/`imports`
  collections into `payload-types.ts`; `pnpm generate:importmap` is **required**
  after adding the plugin (its admin components resolve through the import
  map) [1].
- The only local typed artifact is `dataManagementAccess: Access` (§4e). The
  snapshot naming convention needs no utility (manual, §4b).

## 5. Migration plan (NOT executed by this spec)

0. **Gate**: this spec APPROVED by the operator; decisions D-1/D-2 taken (§6).
1. **Upgrade in lockstep**: `payload` + all `@payloadcms/*` 3.68.4 → 3.88.x
   (exact pins), `pnpm install`, then `pnpm verify` + docker build gate (107
   tests) green before anything else. Expect the import-export refactor and
   migration-tooling changes in this range [9]; fix regressions here, not
   during plugin wiring.
2. **Install**: `pnpm add @payloadcms/plugin-import-export@<3.88.x matching>`.
3. **Wire**: plugin config per §4a + `dataManagementAccess` per §4e.
4. **Regenerate**: `pnpm generate:types` + `pnpm generate:importmap`.
5. **(D-2 bridge, if taken)** minimal `users` collection (`auth: true`,
   `role: 'superadmin' | 'agent'` reserved) so the admin panel and the plugin
   function before ADR-002's OIDC lands; ADR-002 subsumes it later.
6. **Verify** against §7 acceptance criteria; record results in this document
   when marking it IMPLEMENTED.
7. **Index**: add the SPC-004 row to `docs/README.md` (same commit per repo
   convention — left to the merge agent; noted in the delivery report).

## 6. Impacts, risks, open gaps

| ID | Item | Disposition |
|---|---|---|
| G-1 | **Whole-DB snapshot**: plugin is per-collection only [1] | Resolved: "snapshot" = 3 per-collection exports sharing a timestamp moment (§4b). Single-file whole-DB export is out of scope. |
| G-2 | **Archive formats (zip/tar)**: not supported by the plugin (`csv \| json` only) [1] | Out of scope for REQ-004; file-based CSV/JSON satisfies the requirement's core. Documented deviation. |
| R-1 | **Upgrade breadth** 3.68.4→3.88.x (plugin refactor ≤3.74 [9], migration tooling changes) | Mitigation: lockstep exact pins; upgrade is its own gated step (§5.1) with the 107-test suite + docker build as the regression net. |
| R-2 | **`hasMany` relationship import loss** — open upstream #17111 [11]; affects `tickets.blockedBy` | Acceptance §7.4 includes a blockedBy round-trip. Fallback if it reproduces: JSON round-trip keeps relation IDs in the file (export side is correct per docs [1]) → restore blockedBy via a one-off Local-API script, and track the upstream fix. |
| R-3 | **Snapshot files are ephemeral**: uploads live in the web container FS (no volume, §2.6) | Decision D-3: (a) accept ephemeral (snapshots are derived artifacts; Mongo volume is the durable layer), or (b) 2-line hardening — set the `exports` upload `staticDir` to a compose-mounted path (standard Payload upload config, not custom machinery). Recommendation: (b). |
| R-4 | **Custom-endpoint ACL enforcement** on `/download`//`export-preview` not fully verified | Acceptance probes it (§7.5); if public, gate via endpoint access override + upstream issue. |
| R-5 | **No auth yet**: plugin is inert (`createExport` requires a user [6]; admin UI needs login) | Sequencing: D-2 — minimal bridge `users` collection (recommended) or implement after ADR-002 wiring. ACL is deny-by-default meanwhile (safe). |
| R-6 | **Sync exports block the request** (`disableJobsQueue: true`) | Fine at local scale; revisit threshold: collections ≳10k docs or visible UI latency. |
| G-3 | **Jobs Queue `autoRun`** deliberately not adopted | Revisit only if background/periodic snapshots become a requirement (none exists today). |
| G-4 | **CSV spreadsheet use-case** foreclosed by forced `json` | D-4: per-collection CSV re-enable is a one-line change if a real workflow appears. |

Open decisions for the operator — **ALL RESOLVED by the operator (2026-09-07)**:

| ID | Decision |
|---|---|
| D-1 | **RESOLVED: upgrade now.** No productive load → no maintenance window needed. |
| D-2 | **RESOLVED: bridge minimal `users` collection NOW** (first step of the implementation spine; ADR-002 subsumes it later). |
| D-3 | **RESOLVED: `staticDir` to a compose volume** (option b). |
| D-4 | **RESOLVED: no CSV exceptions** (JSON-only for the three collections). |
| D-5 | **RESOLVED: YES — authenticated frontend Data Management panel is a REQUIREMENT.** The operator will apply import/export via UI (never via agent, never memorized CLI); the panel requires authentication with a permission profile (superadmin sees it, agent does not). Built as the final step of the spine (SPC-001 History-tab pattern). |

Additional operator resolution (BUG-3, from the QA triage): **soft delete** for
frontend items (preserves history; aligned with restore/snapshot). Hard purge
exists only as a **terminal, non-atomic, dev-oriented `--reset` tool** that is
snapshot-safe (backs up before resetting; never deletes snapshots).

## 7. Acceptance criteria (verifiable)

1. Post-upgrade (§5.1): `pnpm -r build && pnpm -r --no-bail test` green (107
   tests, no regression) and `docker compose build` gate green **before** the
   plugin is added.
2. Plugin installed at the exact `3.88.x` matching pin; `importExportPlugin`
   present in `payload.config.ts` with the §4a config; import map regenerated
   (`generate:importmap`) and admin boots without missing-component warnings.
3. **Export + download**: from the admin list view of `tickets`, export all
   documents as JSON → `Download` streams a file that parses as a JSON array
   with count == document count; nested `labels`/`subtasks` and Lexical
   `description` intact.
4. **Named snapshot**: `Save` creates an entry in `exports` titled with a
   dated name (`YYYY-MM-DD_HH-MM-SS` native, or the §4b convention), listed
   under the "Data Management" admin group; re-download from the saved
   document returns the identical file; entries are immutable
   (no update path).
5. **Import + preview**: upload a previously exported `tickets` JSON into a
   **fresh** collection instance (or after wiping) with preview shown before
   commit; import completes with `summary.imported == N`, `issues == 0`.
   **Round-trip with `blockedBy`**: re-import (`upsert`) over live data
   updates without duplicating `ticketId`s; `blockedBy` relations survive
   (R-2 probe — if it fails, the documented fallback applies and R-2 stays
   open upstream).
6. **ACL (4 routes, both actor states)**: with no credential → `401/403` on
   `POST /api/exports` (create), `GET /api/exports` (read), `POST /api/imports`
   (create), `GET /api/imports` (read), plus `POST /api/exports/download` and
   `POST /api/exports/export-preview` (R-4 probe). With a simulated agent
   identity (once auth exists) → denied on all six; master user → allowed.
   Deny-by-default holds while `req.user` is undefined (everything denied).
7. **No regression**: Kanban/board/projects/teams flows and `/history`
   (SPC-001) behave identically; `pnpm verify` and the docker build gate stay
   green after the plugin wiring.

## 8. References

**Payload official documentation**

1. *Import Export Plugin — Documentation*, payloadcms.com —
   https://payloadcms.com/docs/plugins/import-export (full text cached and read:
   `~/.hermes/profiles/ttamayo/cache/web/payloadcms.com-6b3e1eced0.md`).
   Contributed: capability list, Options/ExportConfig/ImportConfig tables,
   per-collection targets, `overrideExport/ImportCollection`, collection
   visibility (`admin.group`), limits & dynamic limits, hooks (collection- and
   field-level), export paths (download/save/Local API/Jobs Queue), import
   modes (`create`/`update`/`upsert`, `matchField`) and import summary, CSV
   column conventions & value coercion, JSON fidelity, exports/imports
   collections, `disableJobsQueue` semantics. → §1, §3, §4a–4f, §6.
2. *New in Payload: Import Export Plugin out of beta* (Payload team) —
   https://payloadcms.com/posts/releases/new-in-payload-import-explort-plugin-out-of-beta
   Contributed: GA milestone = Payload 3.85.0; collection/field-level hooks
   added. → §3.1, §5.1.
3. *Jobs Queue — Documentation*, payloadcms.com —
   https://payloadcms.com/docs/jobs-queue/overview. Contributed: `autoRun`
   (dedicated servers, cron inside Next) vs bin script vs API endpoint;
   scheduled jobs stay pending without a runner. → §3.5, §4a, §6 G-3.

**Payload repository (issues / discussions)**

4. *Issue #13259 — "(plugin-import-export) Where is import guys?"*
   (payloadcms/payload, opened 2025-07-24, plugin 3.46.0) —
   https://github.com/payloadcms/payload/issues/13259. Contributed: direct
   evidence the plugin was export-only in the pinned generation. → §3.1, §3.4.
5. *Discussion #11979 — "Issue with exporting relationship and array fields"*
   (answered by maintainer DanRibbens; `toCSV` shipped in v3.42.0) —
   https://github.com/payloadcms/payload/discussions/11979. Contributed: CSV
   flattening/coercion limitations for relationship/array fields. → §3.7, §4a.
6. *Issue #15526 — "Incorrect migration generated after import export plugin
   refactor"* (references the refactor between Payload 3.57→3.74) —
   https://github.com/payloadcms/payload/issues/15526. Contributed: locating
   the API-generation boundary relevant to the 3.68.4→3.88.x jump. → §3.1, R-1.
7. *Issue #17110 — "plugin-import-export is not able to import its own
   exported collections with 1:N relationship"* (open, against 3.85.1) —
   https://github.com/payloadcms/payload/issues/17110. Contributed: known
   hasMany-import defect; shapes risk R-2 and acceptance §7.5.

**Package registry (verified live)**

8. npm — `@payloadcms/plugin-import-export`:
   https://www.npmjs.com/package/@payloadcms/plugin-import-export ·
   `npm view` (2026-09-07): `latest = 3.88.0`; exact `3.68.4` exists with
   `peerDependencies { payload: '3.68.4', '@payloadcms/ui': '3.68.4' }`.
   Contributed: version alignment strategy (lockstep exact pins). → §3.2, §5.
9. **Tarball inspection [verified evidence, reproducible]**:
   `npm pack @payloadcms/plugin-import-export@3.68.4` → components
   `Export*`/`Preview` only; `ImportExportPluginConfig` flat & export-only
   (no `import`, no hooks, no `overrideImportCollection`).
   `npm pack @payloadcms/plugin-import-export@3.88.0` → import components
   (`ImportListMenuItem`, `ImportPreview`, `ImportSaveButton`), `imports`
   collection (`slug: 'imports'`), `exports` collection (`slug: 'exports'`,
   `useAsTitle: 'name'`, `admin.group: false`, `access.update: ()=>false`,
   endpoints `/download` + `/export-preview`), `getFilename()` →
   `YYYY-MM-DD_HH-MM-SS`, `createExport` throws without an authenticated user.
   → §3.1, §3.3, §3.4, §4b, §4e, §6 R-4/R-5.
10. Community backup guidance (mongodump against the Mongo volume) —
    https://payloadcms.com/community-help/discord/mongodump-on-payload-cloud-db
    and discussion https://github.com/payloadcms/payload/discussions/4309.
    Contributed: whole-DB/DR belongs to the infra layer, not this plugin. → §3.6, G-1.

**Repository documents and files (local evidence)**

11. [REQ-004 — import/export file-based + named snapshots](../requirements/2026-09-06_REQ-004_import-export-snapshots.md) (parent requirement & delimitations) · [REQ-002](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [ADR-001](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) · [ADR-002](../adr/2026-09-05_ADR-002_oidc-authentication.md) (role model: `superadmin`/`human`/`agent`) · [SPC-001](../specs/2026-09-05_SPC-001_audit-trail-restore.md) (§6 policy precedent) · [SPC-003](../specs/2026-09-06_SPC-003_testing-strategy.md) (test gate).
12. Repo evidence (working tree @ `744b9cc`): `apps/web/src/payload.config.ts`
    (no plugins array, no auth collection) · `apps/web/package.json` +
    `pnpm-lock.yaml` (payload 3.68.4 exact; plugin absent) ·
    `apps/web/src/collections/{Projects,Teams,Tickets}.ts` (schema) ·
    `apps/web/src/access/actorPolicy.ts` (ACL pattern reused in §4e) ·
    `docker-compose.yml` (Mongo volume only; web FS ephemeral).
