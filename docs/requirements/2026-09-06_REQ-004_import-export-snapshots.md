# REQ-004 — Import/Export via frontend (file-based) with named snapshots

| | |
|---|---|
| **ID** | REQ-004 |
| **Date** | 2026-09-06 |
| **Status** | DRAFT — pending review. Requirement ONLY. Research/spec authorized (SPC-003), implementation NOT. |
| **Type** | Requirement |
| **Related** | [ADR-001](../adr/2026-09-05_ADR-001_local-first-loopback-binding.md) · [SPC-001 — Audit trail & restore](../specs/2026-09-05_SPC-001_audit-trail-restore.md) · Payload official plugin: https://payloadcms.com/docs/plugins/import-export (`@payloadcms/plugin-import-export`) |

---

## Statement

The product must support **data import and export through the frontend using files**
(text blob — CSV/JSON — or archive: zip, tar, etc.), covering the business
collections (`projects`, `teams`, `tickets`).

Scope, capabilities, and limits are **to be delimited by the SPC based on native
Payload CMS capabilities**, preferably the officially supported
`@payloadcms/plugin-import-export` plugin, rather than custom-built machinery.

### REQ-004.1 — Export via frontend
Users (superadmin per current ACL model) can export collection data to a file and
download it from the browser. Format (CSV/JSON) per collection is a spec decision.

### REQ-004.2 — Import via frontend
Users can upload a previously exported file and import it back, with data preview
before committing (plugin native capability: *Preview data before exporting or
importing*).

### REQ-004.3 — Named snapshots (export with dated name)
The system supports saving an export as a **named snapshot**: a stored export whose
name follows a format embedding the date (e.g. `local-pm-snapshot-YYYYMMDD-HHMMSS`).
Snapshots are listable and downloadable later (plugin native capability: *Create a
file upload of the export data* — the `exports` upload collection; visibility to be
configured per the admin model).

### REQ-004.4 — Dual surface
The functionality must exist on both surfaces: **frontend for superadmin** and
**backend (API/MCP)** — respecting the actor/channel attribution model of REQ-002.

## Delimitations for the SPC (to determine, not decided here)

- Native plugin coverage vs gaps (e.g. whole-DB snapshot vs per-collection export;
  archive formats beyond CSV/JSON — zip/tar if the plugin does not cover them).
- Jobs Queue requirement of the plugin (needs a runner / `autoRun`, or
  `disableJobsQueue: true` for synchronous local-scale operation).
- ACL: import/export restricted to `superadmin` (consistent with REQ-002 and the
  ADR-002 role model); agent access explicitly out unless later decided.
- Standard, well-supported components preferred over custom builds (operator
  instruction); deviations must be justified in the spec.

## Pending decision

| ID | Decision |
|---|---|
| D-R4 | SPC-003 approval after research (scheduling per operator: after wave-1 stabilization, see execution plan) |
