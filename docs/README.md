# Repository documentation — convention

This directory centralizes the normative and design documentation of `local-pm`.
Every decision, requirement, and specification lives here, versioned in git
alongside the code it applies to. This page documents the current convention;
the existing documents are the style reference.

## Structure

| Folder | Content | Question it answers |
|---|---|---|
| `docs/adr/` | Architecture Decision Records — decisions made, with context and consequences | What was decided and why? |
| `docs/requirements/` | Requirements — what must be fulfilled, without specifying how | What is required? |
| `docs/specs/` | Design specifications — how a requirement is implemented | How is it implemented? |

## File naming

```
YYYY-MM-DD_<TYPE>-<NNN>_<slug>.md
```

- `YYYY-MM-DD`: document creation date (not last-edition date).
- `<TYPE>`: `REQ` (requirement) · `ADR` (decision record) · `SPC` (spec).
- `<NNN>`: consecutive number per type, zero-padded to three digits
  (`REQ-001`, `ADR-002`, `SPC-003`, …).
- `<slug>`: kebab-case, descriptive and stable. The slug is NOT rewritten in
  later renames unless the ID was the missing piece.

Real examples: `2026-09-05_REQ-003_workspace-restructure.md`,
`2026-09-05_ADR-001_local-first-loopback-binding.md`,
`2026-09-05_SPC-001_audit-trail-restore.md`.

## ID scheme

| Type | Format | Numbering |
|---|---|---|
| Requirement | `REQ-NNN` | Consecutive per type: REQ-001, REQ-002, … |
| Decision | `ADR-NNN` | Consecutive per type: ADR-001, ADR-002, … |
| Specification | `SPC-NNN` | Consecutive per type: SPC-001, SPC-002, … |

IDs are permanent: a withdrawn document keeps its number and it is not
recycled. The next document of each type takes the number immediately after
the highest existing one.

## Status lifecycle

The status lives in the header table of every document.

| Type | Values |
|---|---|
| ADR | `PROPOSED` (pending user review) → `ACCEPTED` · `REJECTED` · `SUPERSEDED` (replaced by another ADR, which must cite it) |
| REQ | `DRAFT` (pending user review) → `APPROVED` → `IMPLEMENTED` · `REJECTED` |
| SPC | `DRAFT` (pending user review) → `APPROVED` → `IMPLEMENTED` |

- `DRAFT`/`PROPOSED`: the document does not bind the operator; it can be fixed
  freely until approval.
- `APPROVED`/`ACCEPTED`: materially binding; later changes are recorded in the
  document itself (or through a document that supersedes it).
- `IMPLEMENTED`: the implementation verified the document's acceptance
  criteria; the document is never deleted — it is the historical record.
- Rejected documents are kept (never removed): the decision not to do
  something is also repository knowledge.

## Xrefs (cross-references)

- Always **relative** to the referencing file (`../specs/…`, `../adr/…`,
  `../requirements/…`) — never absolute paths nor URLs to the remote.
- The link text cites the ID (`[REQ-003 — …](…)`), so the xref stays readable
  even if the file is renamed.
- Internal section anchors (`§5`, `§6`) are cited in the link text, not in the
  path; a file rename does not affect them.
- When renaming a document, update every inbound xref in the same commit
  (`git grep <old-name>` to locate them).

## Origin

Every document derives from verbatim user instructions, recorded in the TODO
track (`~/.hermes/profiles/ttamayo/todo/TODO.md`). The spec/ADR cites its
source item where applicable (`Scope driver` field in specs). The normative
content is the document's own; the TODO track is the record of the
instruction, not the specification.

## Current index

| ID | Document | Status |
|---|---|---|
| REQ-001 | [Loopback-only binding](requirements/2026-09-05_REQ-001_loopback-only-binding.md) | IMPLEMENTED (via ADR-001 D1) |
| REQ-002 | [Distinguished actor credentials & role policy](requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) | DRAFT (waits ADR-002 wiring) |
| REQ-003 | [Repository restructure per best practices](requirements/2026-09-05_REQ-003_workspace-restructure.md) | IMPLEMENTED (via SPC-002) |
| ADR-001 | [Local-first, loopback-only binding, two-identity provisioning](adr/2026-09-05_ADR-001_local-first-loopback-binding.md) | ACCEPTED |
| ADR-002 | [OIDC-compliant authentication](adr/2026-09-05_ADR-002_oidc-authentication.md) | ACCEPTED (implementation pending, follow-up spec) |
| SPC-001 | [Audit trail & restore (Payload native versions)](specs/2026-09-05_SPC-001_audit-trail-restore.md) | IMPLEMENTED |
| SPC-002 | [Workspace restructure (resolves REQ-003)](specs/2026-09-05_SPC-002_workspace-restructure.md) | IMPLEMENTED |
| SPC-003 | [Testing strategy (Option B: unit + mocked API-contract)](specs/2026-09-06_SPC-003_testing-strategy.md) | IMPLEMENTED |
| SPC-005 | [Audit attribution & retention policy (Option B: maxPerDoc 1000)](specs/2026-09-08_SPC-005_audit-attribution-retention.md) | IMPLEMENTED |

When creating a document, add it to this index in the same commit.
