# REQ-005 — Auth session visibility & explicit mutation feedback (no silent failures)

| | |
|---|---|
| **ID** | REQ-005 |
| **Date** | 2026-09-20 |
| **Status** | DRAFT — pending review. |
| **Type** | Requirement (what must be fulfilled, not how) |
| **Related** | [SPC-007 — auth visibility UI](../specs/2026-09-20_SPC-007_auth-visibility-ui.md) · [INV-AUTH-VIS triage](../investigations/2026-09-20_auth-visibility-drag-persistence-triage.md) · REQ-002 (distinguished actors) · SPC-005 (audit attribution) |

---

## Problem statement (operator-observed, browser-verified 2026-09-19/20)

The frontend surfaces had **no notion of session state**. Consequences, all observed live:

- An anonymous user saw a fully interactive board; every drag silently failed
  (PATCH → 403 → `console.error`) and every change reverted on refetch/reload.
- A logged-in user could not tell whether the session was alive after token expiry.
- A failed mutation produced **no UI feedback whatsoever** — no toast, no banner, no
  console-visible signal beyond a swallowed `console.error`.
- An authenticated session was "invisible": no indicator of who is logged in, nor a
  reachable logout surface on the frontend pages.

Root causes triaged separately (see INV-AUTH-VIS): missing payload layout, history cookie
path without authentication, RSC reads bypassing the soft-delete ACL, and a React
concurrent updater pattern that swallowed the drag PATCH. Those are **fixes**; this
requirement is the **standing product behavior** that the fixes plus the UI must fulfill.

## Requirements

- **REQ-005.1 (Session visibility):** Every frontend page must present the session state:
  - Anonymous → a visible, non-intrusive banner stating the view is read-only and
    mutations will not be saved, with a path to log in.
  - Authenticated → a visible identity indicator (who is logged in) with a reachable
    path to the admin surface and to log out.
- **REQ-005.2 (Explicit mutation failure):** Any failed mutation (network error, 4xx,
  5xx) must produce explicit user-visible feedback identifying the failure class — at
  minimum separating *authentication required* (401/403) from *server error* — and, where
  an optimistic UI change was applied, must revert that change so the view matches server
  state.
- **REQ-005.3 (No silent failures):** No mutation path may terminate with only a
  `console.error`. Early-return branches (e.g. drop colliders resolving to no-ops) must
  either reflect the outcome to the user or provably restore the pre-action state.
- **REQ-005.4 (Proportionality):** The feedback must be non-invasive by default: the
  anonymous banner stays passive until a mutation is attempted; the nudge on failure must
  be noticeable but standard (no blocking dialogs).

## Acceptance criteria

- AC-1: Anonymous session on `/board` shows the read-only banner with a login link.
- AC-2: Authenticated session shows the logged-in identity and an admin/logout path.
- AC-3: Anonymous drag attempt → explicit UI feedback naming the auth failure; board
  state restored to pre-drag.
- AC-4: Authenticated drag → PATCH 200 → persistence across reload → history row with
  the acting identity.
- AC-5: Injected server failure (5xx) on a mutation → explicit feedback + state restored.

## Non-goals

- Global state-management library or auth context refactor (current fetch-based check
  suffices at this scale).
- Role-based UI gating beyond the existing access modules (actors stay visible; policy
  stays server-side).
