# SPC-001 Implementation Status

**Status: Implementation complete, pending merge verification.**

All seven acceptance criteria of
[SPC-001](2026-09-05_SPC-001_audit-trail-restore.md) were verified on branch
`feat/audit-trail` against a live stack (`docker compose up -d --build` green,
containers `local-pm-audit-app` / `local-pm-audit-mongodb`, loopback :3011).
Evidence runs are recorded in the implementing agent's report; the
`scripts/verify-spc001.ts` harness reproduces them (Local API against live
Mongo):

1. compose build green after the changes — verified.
2. CRUD creates entries in `_projects_versions` / `_teams_versions` /
   `_tickets_versions` — verified in Mongo (collections auto-scaffolded on
   first write; per-document version counts grow with each update).
3. `/history` renders the consolidated feed; `collection`, `parent`, `from`/`to`
   and `q` filters verified against seeded data.
4. Field-by-field jsondiffpatch deltas (added/removed/changed) verified with
   `?withDiff=1` (e.g. `status: ["IN_PROGRESS","DONE"]`, array diffs with
   `objectHash` by `name`/`title`).
5. Restore via the native version-restore operation leaves the document in the
   chosen version's state and creates a new version (visible as the newest
   trail entry).
6. No regression: `/board`, `/projects`, `/teams` all HTTP 200 post-change;
   collection CRUD left open (plain updates/creates unaffected).
7. Policy (§6): `readVersions` denies agent + anonymous (403/401), master user
   allowed; restore denied to agent/anonymous on all three collections via
   `beforeOperation`; `/api/history` 401 anonymous / 403 agent / 200 master.

Known deliberate deviations, documented in code:
- `maxPerDoc: 100` (spec D-1 proposal).
- `q` free-text filter matches the version snapshot in memory: Payload's query
  validation rejects `version.*` paths in `findVersions` where clauses.
- Pre-ADR-002 there is no identity provider; `req.user` is the single source of
  truth (`actorType: 'agent'` marks the agent identity; no user = denied for
  trail surfaces, while plain CRUD stays open so the app keeps working).
- Tab keeps the working name `History` (G-5 still pending with the operator).
