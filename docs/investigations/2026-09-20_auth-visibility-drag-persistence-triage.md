# Investigation — Auth session visibility & drag persistence triage

| | | |
|---|---|---|
| **ID** | INV-AUTH-VIS |
| **Date** | 2026-09-20 |
| **Repo state** | fork `aficiomaquinas/local-pm`; master at fix chain `62d90eb..52ce2fd` + this doc |
| **Status** | COMPLETE — four root causes fixed; UI v1 shipped; v2 spec'd separately |
| **Related** | [REQ-005 — auth session visibility](../requirements/2026-09-20_REQ-005_auth-session-visibility.md) · [SPC-007 — auth visibility UI](../specs/2026-09-20_SPC-007_auth-visibility-ui.md) · payloadcms/payload#17095 (red herring) |

This document records the **triage**: what broke, how each root cause was found, and the
fix evidence. The **product requirement** lives in REQ-005; the **UI design** lives in
SPC-007. Tooling lessons live at §4.

Research contract: repo-internal claims verified at the cited commit; browser claims verified
via chrome-devtools-mcp (trusted CDP input) or bladebro (accessibility-tree driving) against
the live E2E stack. External claims cited.

---

## 1. Operator report (2026-09-19/20 validation cycle)

1. `/admin/login` rendered `Application error` (client-side exception).
2. Board drag moved cards but **nothing persisted** after reload.
3. `/history` empty / not propagating mutations.
4. No error surfaced anywhere — silent failures throughout.

## 2. Root causes (four independent defects, fixed in order)

### 2.1 Missing `(payload)/layout.tsx` — admin crash  [fix: 6d85bfe]

`apps/web/src/app/(payload)/layout.tsx` **never existed in this fork** (absent since the
initial commit `ecf8601`; verified by git archaeology). Without the generated layout, the
`RootLayout` from `@payloadcms/next` never mounts → `ConfigProvider`,
`ServerFunctionsProvider` and every admin context are missing at page level → any admin
render crashed with `Cannot destructure property 'config' of 'U(...)'`.

- Misattributed initially to [payloadcms/payload#17095](https://github.com/payloadcms/payload/issues/17095);
  maintainers could not reproduce because real projects (create-payload-app) ship the layout.
- Fix: restore the generated layout (RootLayout + handleServerFunctions + `@payloadcms/next/css`),
  matching the blank template at v3.90.1.
- **Lesson**: when a payload-generated route-group file seems to misbehave, diff against the
  blank template before blaming the framework.

### 2.2 Payload 3.88.0 → 3.90.1 upgrade + session JWT `authVersion`  [fix: 6d85bfe]

Upgrade to the 2026-09-18 security release (no breaking item applied: no uploads, no Azure/GCS,
no scheduled publish, no API keys, no polymorphic joins; mongodb needs no SQL migration).
One code delta required: 3.90's `JWTAuthentication` rejects session JWTs whose protected
header lacks `authVersion: 1` (`JWT_AUTH_VERSION`, `dist/auth/jwtAuth.js`) — SPC-006's
hand-rolled signer in `apps/web/src/lib/oidc/session.ts` now mirrors it.

### 2.3 `/api/history` cookie path never authenticated  [fix: 62d90eb]

The history route's session-cookie fallback did `createLocalReq({ req: { headers } })` and
read `localReq.user`. `createLocalReq` **never runs authentication** — it only defaults
`req.user = user || req?.user || null`. Cookie-borne sessions (the admin UI) were therefore
always rejected on `/api/history` while REST routes worked (they run `createPayloadRequest`
→ `executeAuthStrategies`).

- Fix: call `executeAuthStrategies({ headers, payload, req })` with the request headers,
  exactly as `createPayloadRequest` does.
- Browser-verified before/after: 401 → 200 with actor `user:master@local.test`.
- **Lesson**: `createLocalReq` never authenticates; cookie auth requires the JWT strategy's
  `authenticate()`.

### 2.4 Ghost cards — server render bypassed the soft-delete ACL  [fix: 52ce2fd]

The board RSC used the Payload **local API** (`payload.find`) without `overrideAccess: false`.
Local-API find defaults to `overrideAccess: true`
(`payload/dist/collections/operations/local/find.js:5`), so the soft-delete read ACL
(`readExcludingDeleted`, SPC-004 D2) never ran and deleted tickets rendered as live-looking,
draggable cards.

- Operator-visible failure: drag a ghost → optimistic move → `PATCH /api/tickets/<ghost-id>`
  → REST read ACL → 404 → `catch { console.error }` → silence.
- Fix: `overrideAccess: false` on the three ticket column finds so the server render agrees
  with the REST refetch.
- **Lesson**: the local API defaults to `overrideAccess: true`. Every RSC read of a
  collection with access rules must pass `overrideAccess: false` explicitly.

### 2.5 Drag persistence — React concurrent deferred updater  [fix: this cycle, `feat/auth-ui-v2` base]

`handleDragEnd` read the patch from a `setTickets(updater)` closure **on the next
statement**. Under React 19 concurrent rendering the updater runs deferred and
double-invoked; when `if (!patch) return` evaluated, `patch` was still `null` → silent
return. React then ran the updater (`isReal: true` — captured via `window.__dragTrace`)
but nothing consumed it. Optimistic move, no PATCH, no error, no history row.

- Fix: synchronous state mirror (`ticketsRef` + `setTicketsSync`) so dragEnd computes the
  patch immediately; plus cross-column stale-`over` resolution (dnd-kit's final
  `DragEndEvent.over` can lag the pointer and report the origin column — when the
  optimistic state shows the card in a different column than its drag origin, commit the
  optimistic position instead of the stale `over.id`).
- Verified via chrome-devtools-mcp **trusted CDP drag**: PATCH 200, server `sortOrder
  201→1`, history row with actor, console clean.
- **Lesson**: never read an updater-closure side effect on the statement after
  `setState(updater)` under React concurrent; mirror state in a ref for synchronous
  event-handler logic.

## 3. REQ-VIS — visibility requirements (now formalized as REQ-005 / SPC-007)

The visibility requirements and their UI design were originally drafted inline here
(REQ-VIS-1/2/3). They are now **formalized as first-class documents**:

- **[REQ-005](../requirements/2026-09-20_REQ-005_auth-session-visibility.md)** — the
  product requirement: session visibility, explicit mutation feedback, no silent
  failures, proportionality; acceptance criteria AC-1..AC-5.
- **[SPC-007](../specs/2026-09-20_SPC-007_auth-visibility-ui.md)** — the UI design:
  v1 (topbar banner, commit 2a269e4) superseded by **v2** (authenticated → sidebar
  bottom-left user block with avatar-initial + email + menu [Admin, Log out]; anonymous
  → topbar banner kept, with a soft alarm-color nudge on failed mutations via the
  `localpm:auth-nudge` custom event; standard Next/React transitions).

Original inline draft (superseded): REQ-VIS-1 = session status visible; REQ-VIS-2 =
mutation must never fail silently; REQ-VIS-3 = server render and REST must agree on ACLs
(fixed [52ce2fd]).

## 4. Tooling lessons (browser MCP)

- **bladebro / Playwright MCP = driving** (accessibility tree): synthetic `dispatchEvent`
  is untrusted — dnd-kit Pointer/Keyboard sensors ignore it; single `press` calls never
  complete a trusted drag sequence.
- **chrome-devtools-mcp = debugging + trusted input**: `drag` fires trusted CDP pointer
  sequences; `evaluate_script`, `list_network_requests`, `list_console_messages` close the
  loop in one session. This is what cracked the case.
- dnd-kit ships an official Debug plugin (`@dnd-kit/dom/plugins/debug`) for collision
  overlays in dev. Known behavior: `onDragCancel`/`onDragEnd` may not fire on plain mouse
  release outside a droppable (clauderic/dnd-kit#1702) — surface state from `onDragOver`
  snapshots.
- `Uncaught TypeError: ... startTime` from the web-vitals reporter = unrelated noise.

## 5. Upstream submission plan (draft)

Upstream (anaskasmi/local-pm) restructured to a root `src/` + npm layout — the fork's pnpm
monorepo cannot be tree-merged; individual fixes must be **ported commit-wise**. Recommended
series (small, self-contained, high acceptance odds given the maintainer's stated openness):

1. **fix: missing `(payload)/layout.tsx`** — critical, tiny, immediately valuable.
2. **chore: Payload 3.90.1 upgrade** (+ authVersion note for custom signers).
3. **fix(audit): cookie session auth in `/api/history`** (`executeAuthStrategies`).
4. **fix(board): `overrideAccess: false` on RSC finds** (soft-delete ACL parity).
5. **fix(board): drag persistence under React concurrent** + **feat(ui): auth status
   visibility (REQ-VIS-1/2)** — the UI piece lands after UI v2 settles here.
6. RFC/discussion issue for the large architectural pieces (OIDC wiring SPC-006, MCP
   server, E2E stack) before any big PR — the fork's monorepo shape is a product decision
   the maintainer must opt into.

## 6. Commits in this cycle

- `6d85bfe` Payload 3.90.1 + missing layout + session authVersion
- `1bfc0d3` e2e: groups scope for superadmin mapping
- `62d90eb` history cookie auth fix
- `52ce2fd` board ghost cards (overrideAccess)
- `2a269e4` REQ-VIS-1/2 v1 (banner + mutation error surface)
- `e586262` docker toolchain (node:22 + pnpm 11.17.0)
- `cbd9d20` drag persistence fix (ticketsRef / React concurrent)

## 7. Follow-ups

- **SPC-007 v2 implementation** on `feat/auth-ui-v2`: sidebar user block + mutation
  nudge (spec'd, not implemented).
- **Upstream series**: port commit-wise to the root-`src/` npm layout (§5); RFC-first
  recommendation for architectural pieces.
