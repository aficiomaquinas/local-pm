# Bug triage — kanban drag, History grouping, delete-wipes-history

**Date**: 2026-09-07
**Reported by**: operator (visual QA on the consolidated master)
**Status**: triaged; fixes pending authorization
**Scope**: `apps/web/src/components/kanban/*`, `apps/web/src/components/history/HistoryClient.tsx`, collection delete semantics

---

## BUG-1 — Drag & drop does not move cards between columns

**Reproduction**: drag a card from one column to another → the card visually snaps back; the status switch does not happen (or happens and is instantly reverted).

**Root cause (two compounding defects in `KanbanBoard.tsx`):**

1. **Stale-closure `PATCH` in `handleDragEnd` (line ~404).** The `fetch` sends
   `sortOrder: columnTickets.findIndex((t) => t.id === overId) + 1` where
   `columnTickets`/`overId` come from a `tickets` array snapshot taken at drag-start.
   `handleDragOver` already mutated `tickets` (via `setTickets`) several times during
   the drag, so the end-handler computes indexes against a stale array and issues a
   PATCH with wrong `sortOrder`/occasionally wrong target status.
2. **`refetchTickets` (filter `useEffect`) re-fetches on every filter/param change —
   but it also races the drag**: any re-render cycle that re-triggers the fetch
   (e.g. URL sync via `router.replace`) overwrites the optimistic
   `setTickets(...)` from `handleDragOver` with server state from *before* the
   PATCH landed, visually reverting the move.

The PATCH itself does reach the server (verified: `PATCH /api/tickets/:id` → 200 with
`status` + `sortOrder`, trail entries created). The failure is client-side state
consistency, not the API.

**Fix direction** (pending authorization):
- In `handleDragEnd`, recompute from the current `tickets` state via the
  `setTickets(prev => …)` updater (no stale closure), PATCH with the final
  computed `{status, sortOrder}` from *inside* the updater, and skip the fetch
  entirely when `status` and `sortOrder` are unchanged.
- Suppress the filter-refetch effect while a drag is in flight
  (`isDraggingRef`), or refetch only after the PATCH resolves.

## BUG-2 — History shows each change to a ticket as an independent "created" card

**Root cause (presentation only — the data layer is correct).** Verified against the
live API: `/api/history?collection=tickets&parent=<id>` returns the versions of one
ticket with per-field diffs (`status: ["IN_PROGRESS","DONE"]` etc.). But
`HistoryClient.tsx` renders a **flat list** of `VersionRow` cards
(`data.docs.map(...)`) — every entry looks like an unrelated "new card". There is no
visual grouping by ticket, so N changes to one ticket read as N unrelated creations.

Two contributors:
1. **No grouping by `(collection, parent)`** in the client — the spec's
   "changes to a single ticket" mental model is not rendered.
2. **First-version rows diff against `{}`** (full-field diff), which makes even
   genuine updates with a missing predecessor look like "created everything".

**Fix direction:**
- Group the feed by `(collection, parent)` in the client: one collapsible group per
  ticket (label = `parentLabel`), versions listed inside it newest-first, showing
  only the per-field diff for updates (skip the `{}`-creation diff when the group
  has predecessors).
- Keep the flat chronological feed as a secondary view if wanted; grouping becomes
  the default view.

## BUG-3 — Deleting a ticket wipes its entire audit history

**Root cause (Payload-native, verified).** Confirmed empirically: after
`DELETE /api/tickets/:id` (200), `_tickets_versions` count for that parent drops to
**0** — Payload's delete operation calls `deleteCollectionVersions` whenever
`collectionConfig.versions` is enabled
(`payload/dist/collections/operations/delete.js:116-118`). This is default framework
behavior, and it defeats the purpose of SPC-001: deleting a ticket erases its trail
(the operator: "absolutamente ridículo" — correct: an audit trail that can be
destroyed by the very action it should record is not an audit trail).

**Fix direction (options for the operator):**
1. **`beforeDelete` hook → snapshot-to-audit-archive**: before Payload deletes the
   versions, copy the ticket + its version trail into a dedicated immutable
   collection (e.g. `_deleted_audit_archive`, no ACL read for agents, append-only).
   Preserves the SPC-001 evidence chain; moderate effort.
2. **Soften the delete into an archive-status transition** (`deleted: true` field,
   hidden from the board) so nothing is ever destroyed; true purge becomes a
   separate, explicit, superadmin-only action.
3. **Disable `versions` cascade** is not offered by Payload config (it is hardcoded
   in the delete operation) — so options 1/2 are the real choices; option 2 is the
   architecturally cleanest, option 1 the least invasive to UX.

## Verification artifacts

- `PATCH /api/tickets/:id` (status+sortOrder) → 200; `_tickets_versions` gains one
  doc per update with correct `version.status`/`version.sortOrder`.
- `/api/history?collection=tickets&parent=<id>&withDiff=1` → correct grouping data
  (`status: ["IN_PROGRESS","DONE"]` style deltas) — API is not the bug in BUG-2.
- `DELETE /api/tickets/:id` → 200 AND `_tickets_versions` for the parent → 0
  (BUG-3 root cause confirmed against Payload's own delete operation source).
