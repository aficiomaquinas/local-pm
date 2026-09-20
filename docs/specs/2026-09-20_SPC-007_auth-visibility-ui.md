# SPC-007 — Auth session visibility UI (REQ-005 implementation)

| | |
|---|---|
| **ID** | SPC-007 |
| **Date** | 2026-09-20 |
| **Status** | v2 IMPLEMENTED (feat/auth-ui-v2 e08b9eb, pending merge): sidebar user block + anonymous banner + mutation nudge per §2 — operator decision 2026-09-20. Gate green: pnpm verify 287 (web 204, mcp 83) + live browser check on the e2e stack (banner, user block, popover, nudge pulse on 403, PATCH/revert wire). |
| **Type** | Spec (how REQ-005 is fulfilled) |
| **Related** | [REQ-005](../requirements/2026-09-20_REQ-005_auth-session-visibility.md) · SPC-006 (OIDC) · SPC-005 (history) |

---

## 1. v1 (implemented, commit 2a269e4) — superseded by v2

`AuthStatusBanner` fixed topbar on all frontend pages: amber banner for anonymous
("Read-only view … Log in"), green banner for authenticated ("Logged in as … — changes
are saved"), polling `/api/users/me` on focus + every 60 s. KanbanBoard drag PATCH
non-OK → revert optimistic move + dismissible red banner.

Operator feedback (2026-09-20): the topbar works but demands refinement — an
authenticated session does not need a permanent banner, and the anonymous nudge should
trigger on the failed action itself.

## 2. v2 design (this spec)

### 2.1 Authenticated — sidebar user block (bottom-left)

- The `(frontend)` layout's sidebar renders a **user block pinned bottom-left**:
  - rounded avatar showing the user's **initial** (first letter of email — mirror users
    may lack `name`; the email is always present by identity design);
  - the email (or name when present) below the avatar;
  - clicking opens a small popover menu: **Admin** (link to `/admin`) and **Log out**
    (link to `/admin/logout` — Payload owns the logout flow; the frontend adds no logic).
- **No topbar banner** in the authenticated state — the session indicator lives
  exclusively in the sidebar block.
- Appearance uses a standard fade/slide transition (the block is part of the layout, so
  it appears with the page; the menu popover animates with a standard
  opacity/translate transition, ~150 ms ease-out).

### 2.2 Anonymous — topbar banner (kept from v1) + mutation nudge

- The amber banner stays exactly as v1: "Read-only view. You are not logged in — edits
  will not be saved. **Log in** to make changes."
- **Nudge on failed mutation:** when a mutation receives 401/403, the drag/modal handler
  dispatches `window.dispatchEvent(new CustomEvent('localpm:auth-nudge'))`. The banner
  listens and plays a short attention animation: a soft color shift amber → red tint and
  back (CSS keyframe, ~600 ms, twice), no layout shift, no dialog. Standard, subtle, but
  identifiable — the user's eye is drawn to the banner that explains why the action
  failed.
- The red error banner (REQ-005.2) still appears near the action for the specific
  failure text; the nudge is a pointer to the standing explanation.

### 2.3 Session check mechanism (unchanged from v1)

- `/api/users/me` with `credentials: 'same-origin'` on mount, on window `focus`, and on
  a 60 s interval. State machine: `loading → anonymous | authenticated(email)`.
- Logout detection in another tab covered by the focus re-check.

### 2.4 Error surface (unchanged from v1)

- `data-testid="mutation-error"` red banner near the action, dismissible (✕),
  `role="alert"`. Message classes: 401/403 → "Your session is not active — the move was
  not saved. Log in and try again."; other → "The move could not be saved (server error
  N). The board was restored to its previous state."

## 3. Component contract

| Component | Responsibility | data-testid |
|---|---|---|
| `AuthStatusBanner` (v2: split into `AnonymousBanner` + `UserMenu`) | REQ-005.1: banner (anonymous) / sidebar user block (authenticated) + `localpm:auth-nudge` listener | `auth-status`, `user-menu` |
| `KanbanBoard.handleDragEnd` | REQ-005.2/3: synchronous patch computation, revert + error class on failure, nudge dispatch on 401/403 | `mutation-error` |
| Sidebar (layout) | hosts the user block bottom-left (authenticated only) | — |

## 4. Acceptance criteria (maps REQ-005)

- AC-1/2: banner or user block renders per session state (browser-verified via
  chrome-devtools-mcp).
- AC-3: anonymous drag → revert + red banner + banner nudge animation.
- AC-4: authenticated drag → PATCH 200 → reload persistence → history actor row.
- AC-5: injected 5xx → error banner + revert.

## 5. Non-goals

- Global auth context/provider (fetch check suffices at this scale).
- Blocking dialogs or toast libraries (standard CSS animations only).
- Role-based UI gating (server-side policy is the source of truth).

## 6. Implementation notes / pitfalls (from the triage cycle)

- The session check must use the same-origin cookie — REST auth works; only custom
  routes that build a `createLocalReq` by hand bypass authentication (see INV-AUTH-VIS
  §2.3).
- Any drag PATCH must be computed synchronously from a state ref — a
  `setTickets(updater)` closure read on the next statement is a silent no-op under
  React concurrent (see INV-AUTH-VIS §2.5).
- dnd-kit sensors ignore untrusted events: browser verification of drags requires
  trusted CDP input (chrome-devtools-mcp `drag`), not synthetic `dispatchEvent`.
