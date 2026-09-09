# Spec — Audit Attribution (Actor Capture) & Version Retention Policy

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`, branch `master`) |
| **ID** | SPC-005 |
| **Date** | 2026-09-08 |
| **Status** | IMPLEMENTED (2026-09-09) — merged to master and E2E-verified: actor attribution (anonymous/master), retention Option B, mutation labels, drag collision fix, superadmin Options panel (visible/silent). |
| **Type** | Specification (patch to SPC-001 gap G-1 + retention policy decision) |
| **Depends on** | SPC-001 (implemented 2026-09-07) · REQ-002 (distinguished actors) · ADR-002 (OIDC wiring; functional prerequisite for non-anonymous attribution) |
| **Related** | [SPC-001 — audit trail & restore](2026-09-05_SPC-001_audit-trail-restore.md) · [SPC-004 — import/export & snapshots](2026-09-07_SPC-004_import-export-snapshots.md) · [ADR-003 — external audit snapshot chain & platform landscape](../adr/2026-09-08_ADR-003_external-audit-snapshot-chain.md) |

Evidence marked **[verified]** was produced by direct inspection of repo files and
installed dependency source (`@payloadcms/db-mongodb@3.88.0`) on 2026-09-08.

---

## 1. Objective

Close SPC-001 gap **G-1** (the version trail records *what* changed and *when*,
but not *who*) and resolve the retention question raised by `maxPerDoc: 100`.

Motivation (2026-09-08): a comparative scan of 13 FOSS PM products (full matrix in
[ADR-003](../adr/2026-09-08_ADR-003_external-audit-snapshot-chain.md)) found **none**
that enforces a delete-surviving audit trail with distinguished human/agent
identities. local-pm already exceeds every scanned product on enforcement
(append-only versions, `readVersions: denyAgents`, master-only restore,
hard-delete blocked); attribution is the remaining gap inside the app.

## 2. Current state (repo evidence, 2026-09-08)

- **E-1 [verified]** — The version document persisted by the Mongo adapter
  (`@payloadcms/db-mongodb@3.88.0`, `dist/createVersion.js`) carries exactly
  `{ autosave, createdAt, latest, parent, publishedLocale, snapshot, updatedAt, version }`.
  `req.user` is never persisted. Payload core (`dist/versions/saveVersion.js`)
  forwards `req` only for the transaction session — no user write.
- **E-2 [verified]** — All three collections declare `readVersions: denyAgents`,
  a `beforeOperation` hook denying `restoreVersion` to non-master users, and
  `blockHardDelete`. `versions.maxPerDoc: 100` in `Projects.ts`, `Teams.ts`,
  `Tickets.ts`.
- **E-3 [verified]** — `src/access/actorPolicy.ts` already resolves actor identity:
  `resolveActorType()` → `user | agent | null` from `req.user.actorType`;
  `isMasterUser()`, `denyAgents()`, `restoreMasterOnly` exported and in use.
- **E-4 [verified]** — The History feed (`apps/web/src/app/api/history/feed.ts`)
  maps version docs into `HistoryDoc`; the response contract has no actor field.

Interpretation: attribution data exists at request time (`req.user`), the policy
model to classify it already exists, and the version pipeline simply drops it.
The gap is one write-path hook, not an architecture change.

## 3. Design — actor capture on the document

**D-1.** Add three fields to each of `projects`, `teams`, `tickets`:

| Field | Type | Notes |
|---|---|---|
| `actorType` | select: `user \| agent \| anonymous` | `anonymous` only valid until ADR-002 wiring lands (then always user/agent) |
| `actorId` | relationship → `users`, nullable | the acting user document (human or agent account) |
| `actorLabel` | text, optional | denormalized display string (`actorLabel()` output); snapshots stay readable after user deletion |

**Why on the document:** Payload versions store the *full doc snapshot*. Adding
fields to the doc automatically attributes every current and future version —
no changes to the versions collections, no migrations of `_slug_versions`, no
custom event store. Version *N* of a ticket therefore answers "who produced
this state", which is the audit semantic REQ-002.2 asks for.

**D-2.** A `beforeChange` collection hook (shared, in `src/hooks/`) sets the
three fields from `req.user` via `resolveActorType()`; `overrideAccess`/local
terminal writes without a user resolve to `anonymous` (script purges are the
operator's direct writes — they must remain visible as such).

**D-3.** Restore semantics stay native: a restore creates a new version whose
snapshot carries the *restorer's* identity (correct: the new state was produced
by whoever restored). No hook special-casing for `restoreVersion`.

**D-4.** The History feed/response contract gains `actor: { type, label }`
(resolved in bulk alongside `parentLabels`). `readVersions: denyAgents` is
unchanged — agents still cannot read the trail that would incriminate them.

**Alternative rejected:** a custom `audit-events` collection (append-only event
sourcing). Violates SPC-001's "native versions only, no custom event sourcing"
constraint, duplicates every write, and doubles the surface to keep consistent.

## 4. Version retention (decision required)

`maxPerDoc: 100` is a circular buffer: version 101 evicts version 1. For an
audit-first posture this is the only data-loss primitive left in the app.

- **Option A — keep 100.** Smallest storage; external chain (ADR-003) owns
  durability. Risk: >100 rapid mutations of one doc (agent loops) silently age
  out intra-window history.
- **Option B — raise to 1000 (recommended).** Single-user scale: docs are KBs,
  so worst case is a few MB per pathological doc, bounded and negligible for
  Mongo. Removes the realistic eviction scenario while keeping a bound.
- **Option C — remove the cap.** Unbounded trail; converts every doc into an
  unbounded growth vector and slows `findVersions` windows. Rejected: the
  external chain, not the OLTP database, is the permanent archive.

**Operator decision (2026-09-08): Option B — `maxPerDoc: 1000`.** Approved along
with this spec's implementation.

## 5. Acceptance criteria

1. Unit: hook sets `actorType/actorId/actorLabel` for user, agent, and
   no-auth (anonymous) requests; `restoreVersion` attributes the restorer.
2. Feed: `/api/history` returns `actor` per entry; filters unaffected.
3. Policy: `readVersions` still denies agents (regression per SPC-001 §6).
4. `pnpm verify` green (operator-reported gate: 141 tests as of 2026-09-08).
5. E2E: mutation performed with the agent credential produces a version whose
   diff shows `actorType: "agent"`.

## 6. Out of scope

Cryptographic signing and long-term durability (ADR-003 external chain);
OIDC wiring (ADR-002 follow-up spec); admin UI beyond History tab columns.
