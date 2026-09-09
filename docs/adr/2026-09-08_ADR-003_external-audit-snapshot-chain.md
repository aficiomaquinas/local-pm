# ADR-003 — External audit snapshot chain & FOSS platform landscape decision

| | |
|---|---|
| **Repo** | `local-pm` (fork local: `aficiomaquinas/local-pm`) |
| **ID** | ADR-003 |
| **Date** | 2026-09-08 |
| **Status** | PROPOSED — awaiting operator decision |
| **Context docs** | [SPC-001](../specs/2026-09-05_SPC-001_audit-trail-restore.md) · [SPC-004](2026-09-07_SPC-004_import-export-snapshots.md) · [SPC-005](../specs/2026-09-08_SPC-005_audit-attribution-retention.md) · [REQ-002](../requirements/2026-09-05_REQ-002_distinguished-actor-credentials.md) · [ADR-001](2026-09-05_ADR-001_local-first-loopback-binding.md) |

---

## Context

The operator's hard requirement: todo/kanban data whose history is traceable and
**tamper-evident against involuntary agent bias** — an agent must never be able
to erase evidence, even unintentionally. On 2026-09-08 a comparative scan of 13
FOSS project-management products was performed to test whether any existing
platform already enforces this; the trigger was candidate Wekan, whose audit
limitations are documented in wekan/wekan#1598 (open since 2018-04-19).

All findings below were produced by direct inspection on 2026-09-08: GitHub REST
API repo metadata, product READMEs, issue #1598, Wekan REST API docs (v7.92),
Vikunja's own pricing/roadmap pages, and the local-pm codebase
(`apps/web/src/collections/`, `apps/web/src/app/api/history/`, dependency source
`@payloadcms/db-mongodb@3.88.0/dist/createVersion.js`).

## Part 1 — Platform landscape (evidence matrix)

| Product | Audit trail survives delete? | Distinguished human/agent identities | MCP | License / maintenance risk |
|---|---|---|---|---|
| **Wekan** | **No** — #1598 (open 8y): deleting a card/checklist deletes its activity; card delete bypasses recycle bin; REST exposes activity deletion | Partial (tokens, no actor model) | 3rd-party only (namar0x0309: 5★, 1 contributor, no destructive tools) | MIT-ish; Meteor/Mongo; effectively 1 maintainer (xet7) |
| **Taiga** | Partial — per-item history, fragile (activities vanished after 6.7.4 upgrade); "Recent Changes" is self-scoped only | No agent model | None known | Postgres; low upstream energy |
| **Vikunja** | **Paywalled** — audit logs "in private beta" as Vikunja Pro | Partial | Community | AGPL; active |
| **OpenProject / Plane** | Paywalled (enterprise tier) | Partial | Plane has API | AGPL/active, but audit is upsell |
| **Huly** (+ Platform-Collective fork) | Activity feeds, no immutability guarantee found | Yes (workspace users) | Excellent 3rd-party (@firfi huly-mcp, 1.1k commits) | Upstream SaaS shutdown (huly.app, Jul 2026); fork led by former core maintainer ArtyomSavchenko; **min 2 vCPU/8 GB**, CockroachDB+Redpanda flagged "not production-ready" in own README |
| **kan.bn** | "Activity Log" = UI feature; survival-under-delete unspecified | API keys per user (yes) | **Official, in-tree** (`@kan/mcp`) | AGPL; very active (5.6k★); Postgres; lightest credible plan B |
| **Planka** | UI activity, unspecified | Partial (tokens) | Fragmented 3rd-party (≥5 implementations) | License `NOASSERTION`, Community/Pro split — audit scope could move behind paywall |
| **Fizzy** (37signals) | Per-card, no guarantee; **no public API by design** → no agent lane | N/A | None | O'Saasy license; very active; Rails/SQLite |
| **Tududi** | None documented | Personal API keys only | Community (immature) | MIT; very active; lightest stack (SQLite); GTD personal — different domain |
| **Leantime** | UI logs, no enforcement documented | Partial | Official plugin | AGPL; heavy PHP; scope drag |
| **GLPI** | ITSM logs (different domain) | Yes (ITSM roles) | None | Heavy; misaligned |
| **Windshift** | — | — | — | ~112★, too young as a foundation |
| **veritas-kanban** | Governance gates, decision audit, drift detection — best conceptual fit | Yes (agent tokens, RBAC) | Native (42 tools) | MIT; **bus factor 1**, v6 churn, parts of enforcement runtime explicitly unimplemented |

**Conclusion:** no scanned FOSS product enforces a delete-surviving audit trail
*plus* distinguished human/agent identity *plus* an agent access lane. The
closest are kan.bn (best external candidate, audit semantics unspecified) and
veritas-kanban (best conceptual fit, immaturity/bus-factor-1).

## Part 2 — local-pm posture (verified in code, same date)

local-pm, post-SPC-001/004, already enforces more than every scanned product:

- append-only version snapshots (Payload native, drafts disabled);
- `readVersions: denyAgents` — agents cannot read the trail;
- restore reserved to the master user (`beforeOperation` hard denial);
- `blockHardDelete` on every request path; purge is terminal-only (operator);
- History feed with filters and field-level diffs (jsondiffpatch).

Known residual gaps: no actor attribution on versions (SPC-005, G-1) and
`maxPerDoc: 100` circular eviction (SPC-005 §4).

## Decision

**D-1 (platform).** Do not migrate. Keep local-pm as the audit-first system of
record. Adopt the audit guarantees via two layers instead of a platform swap:

1. **In-app** (SPC-005): actor attribution + retention policy.
2. **External chain (the tamper-evidence layer):** periodic full-state export
   (SPC-004 snapshots / dumps as text) → **git-versioned** → **signed** →
   backed up (Kopia or Dokploy autobackup over the repo). The chain is
   backend-agnostic by construction: provenance survives any future platform
   move (including kan.bn as plan B), which is exactly the property signatures
   + snapshotting provide and no scanned product ships natively.

**D-2 (key isolation).** Signing keys never live where agents run. Signing
executes operator-side (or via cron/1Password agent without agent-visible
material). An agent that can sign can re-sign its own tampering; isolation of
the key is therefore the actual enforcement boundary. Verification stays
offline (restore drills / audit review) — never inside the admin UI of the
system being audited.

**D-3 (Huly & others).** Recorded as bookmarks, not candidates: Huly
(Platform-Collective fork) for a future multi-human scenario; veritas-kanban to
re-evaluate if its enforcement runtime matures; kan.bn as migration target of
last resort.

**D-4 (hosting).** local-pm hosting stays minimal (app + Mongo, loopback-first
per ADR-001); Dokploy spore deployment of local-pm with autobackups of the
export repo remains the ops shape. Huly-class stacks (2 vCPU/8 GB min) are
rejected for this workload (1 human + agents, certainty over scale).

## Consequences

- Fixes requested: SPC-005 approval (D-1.1).
- New work item: external chain spec/implementation (export cadence, git repo
  layout, signing procedure, restore drill) — depends on SPC-004 export tooling.
- Wekan/Taiga/Vikunja/Fizzy/Planka/Leantime/GLPI/Windshift: rejected with
  reasons recorded here; re-evaluation only if the requirement changes
  (e.g. multi-human collaboration becomes real).
- Scan evidence ages: re-verify stars/status before citing this ADR after
  ~6 months.
