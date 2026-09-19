# Credits

Local PM is developed in the open, and several improvements in this repository
began life in community forks. This file records what came from where, with
links back to the original commits.

If you have contributed and are credited incorrectly or not at all, please open
an issue — the omission is an oversight, not a judgement.

---

## Brian Tafoya — [@btafoya](https://github.com/btafoya)

Fork: [btafoya/local-pm](https://github.com/btafoya/local-pm)
Commit: [`9de82f2`](https://github.com/btafoya/local-pm/commit/9de82f27b44496af8e9a4cf5ccbe47e266cfe987)

- **XSS sanitization of rich-text descriptions.** Ticket and project
  descriptions are stored as raw HTML from the Quill editor and rendered with
  `dangerouslySetInnerHTML`, so any user who could write a description could
  execute script in every viewer's session. Brian identified this and added
  DOMPurify with an allow-list.

  *Changed on adoption:* switched from `dompurify` to `isomorphic-dompurify`.
  Plain DOMPurify requires a live DOM; on the server `DOMPurify.isSupported`
  is `false`, and in that case `sanitize()` returns its input **unchanged**.
  Because `RichTextDisplay` is server-rendered, the original fix still emitted
  unsanitized markup into the SSR HTML — where the payload fires before React
  hydrates and the client-side sanitizer ever runs. The isomorphic build
  carries a jsdom window on the server, so one policy applies to both passes.
  The allow-list was also widened to match the editor's own `formats` array,
  and `ALLOWED_URI_REGEXP` added to block `javascript:` and `data:` URLs.
  (`@types/dompurify` was not adopted — it is deprecated, as DOMPurify 3.x
  ships its own types.)
  → `src/components/ui/RichTextEditor.tsx`

- **`useInfiniteScroll` ignored its own `threshold` option.** The hook accepted
  and documented a `threshold` option, then hard-coded `threshold: 0` at the
  observer, so callers could not tune it.

  *Changed on adoption:* passing the option straight through, as the original
  patch does, is a crash rather than a fix. The option defaults to `100` and is
  documented as "pixels from bottom", but `IntersectionObserver` reads
  `threshold` as an intersection **ratio** and throws a `RangeError` for any
  value above `1.0` — which would have broken infinite scroll on the Projects
  and Teams lists outright. The option is now correctly typed and documented as
  a ratio, defaults to `0`, and is clamped to `[0, 1]` so an old pixel-style
  value degrades instead of throwing. Distance from the bottom is what
  `rootMargin` already expresses.
  → `src/hooks/useInfiniteScroll.ts`

- **Dead code removal.** Unused `lucide-react` imports in `DependencyGraph` and
  `ProjectDetail`, and an unused `isRefetching` state in `KanbanBoard`.
  → `src/components/kanban/DependencyGraph.tsx`,
    `src/components/projects/ProjectDetail.tsx`,
    `src/components/kanban/KanbanBoard.tsx`

---

## Ars Nova Singers — [@ArsNovaSingers](https://github.com/ArsNovaSingers)

Fork: [ArsNovaSingers/local-pm-Ars](https://github.com/ArsNovaSingers/local-pm-Ars)
Commit: [`d488521`](https://github.com/ArsNovaSingers/local-pm-Ars/commit/d488521f6129d584055e33e90f3689c4afe086eb)

- **Atomic ticket-ID allocation.** `generateTicketId` read
  `project.ticketCounter`, incremented it in JavaScript and wrote it back. Two
  concurrent creates both read `5`, both computed `6`, and both wrote `PROJ-6`.
  Since `ticketId` is declared `unique`, the loser fails on a duplicate-key
  error — or two tickets silently share an ID where the index has not been
  built. A bulk import, or an MCP agent creating a batch, is exactly that
  scenario. Now a single `findOneAndUpdate` with `$inc`, so the database hands
  concurrent callers distinct numbers, with a verify-and-retry fallback for
  adapters exposing no atomic primitive.
  → `src/collections/Tickets.ts`

- **Dependency-cycle guard on `blockedBy`.** Nothing prevented A → B → A. A
  cycle makes "what is ready to work on?" unanswerable and hangs any layered
  graph layout that walks the edges — including this repo's own
  `DependencyGraph`. The edge that would close the loop is now rejected when it
  is created, via a bounded breadth-first walk.
  → `src/collections/Tickets.ts`

- **Opt-in authentication.** Every collection shipped `create`, `update` and
  `delete` as `() => true`, so anything that could reach the port had full
  write access to the whole database. Ars Nova introduced a
  `LOCAL_PM_REQUIRE_AUTH` gate that preserves the open default while making a
  locked-down deployment possible, plus API keys so an automated caller gets
  its own revocable identity instead of a shared password.

  *Changed on adoption:* Ars Nova made the existing `teams` collection
  auth-enabled, which is the smaller diff but means every assignable person
  needs an email and a password hash, and every seed grows one. This repo adds
  a separate `users` collection instead: a Team Member is someone work is
  assigned to, a User is a credential, and existing `teams` data needs no
  migration.
  → `src/lib/access.ts`, `src/collections/Users.ts`

---

## Victor Gonzalez — [@aficiomaquinas](https://github.com/aficiomaquinas)

Fork: [aficiomaquinas/local-pm](https://github.com/aficiomaquinas/local-pm)

- **Kanban drag-and-drop lost the drop position.**
  ([`bf1da41`](https://github.com/aficiomaquinas/local-pm/commit/bf1da412f38d4b938dab73474bba5ab1b7b31c94))
  Two defects in one flow. `handleDragEnd` PATCHed
  `sortOrder: columnTickets.findIndex(t => t.id === overId) + 1`; when a card
  was dropped on empty column space `overId` is the *column* id, so
  `findIndex` returned `-1` and every such drop persisted `sortOrder: 0`,
  stacking cards. Separately, `handleDragOver` mutated only `status`, leaving
  the source column's `sortOrder`, so a drop confirming the preview re-solved
  to the position the optimistic state already held, was read as a no-op, sent
  no PATCH, and was reverted by the next refetch. The drop math is now a pure
  module, computed from current state and unit-tested as a table.
  → `src/components/kanban/dragLogic.ts`, `src/components/kanban/KanbanBoard.tsx`

- **Local-first Docker posture.**
  ([`231b1c5`](https://github.com/aficiomaquinas/local-pm/commit/231b1c5470a9e61c2d79326e2b221d3041026f09),
  [`dfaafde`](https://github.com/aficiomaquinas/local-pm/commit/dfaafdec260c646aacc9531d88596318ff71e3ed))
  Published ports now bind `127.0.0.1` rather than every interface; MongoDB
  publishes no host port at all (it previously exposed `27018` LAN-wide with
  authentication disabled); and `DATABASE_URI`/`PAYLOAD_SECRET` moved from
  build args — which are baked into image layers and readable via
  `docker history` — to runtime environment only. App start is gated on a
  MongoDB healthcheck.
  → `docker-compose.yml`, `Dockerfile`

- **Bounded MongoDB server selection.**
  ([`4c6690c`](https://github.com/aficiomaquinas/local-pm/commit/4c6690c7a8c01d8888a7d883f9932b5c5bafbff1))
  An unreachable database rode mongoose's 30-second default before erroring.

  *Changed on adoption:* the original hard-codes `3000`, which suits a mongo
  container on the same compose network but is too short for a hosted cluster
  over the public internet — it makes `npm run seed` fail against MongoDB
  Atlas. Now configurable via `MONGO_SERVER_SELECTION_TIMEOUT_MS`, defaulting
  to `10000`.
  → `src/payload.config.ts`

- **Keyboard drag accessibility** and **excluding `mcp-server` from the
  Next.js type-check** were contributed directly as pull requests and are
  already merged.

---

## Not adopted

Recorded so the decisions are visible, not because the work lacks merit:

- **OIDC / PKCE authentication** (aficiomaquinas) — a substantial, well-tested
  implementation, but it presumes an identity provider, which is a heavy
  dependency for a tool whose premise is running locally. The
  `LOCAL_PM_REQUIRE_AUTH` gate covers the self-hosted case; OIDC belongs behind
  the same flag as a later, optional layer.

  Two things to resolve first if it is revisited: `resolveActorType` returns
  `'user'` (the privileged identity) for *any* authenticated principal carrying
  no agent marker, and `dataManagementAccess` ends in `return true` for an
  authenticated user with neither a `role` string nor a `roles` array — so the
  import/export surface, which streams the entire dataset, is fail-open by
  default. Both are deliberate bridge behaviour in that fork, and both want
  inverting to deny-by-default before they ship here. The JWKS path also skips
  the audience check entirely when no audience is configured, accepting any
  token from the same issuer.

- **Monorepo restructure** (aficiomaquinas) — sound, but a disruptive change to
  every path in the repo for contributors, and orthogonal to the fixes above.

- **Audit trail / history UI and soft delete** (aficiomaquinas) — genuinely
  valuable and a strong candidate for a future release. Note that in that fork
  the soft-delete guard 403s the project's own `seed-runner.ts`, which still
  calls `payload.delete()`, so `pnpm seed` fails on a fresh clone.

- **Configurable statuses, milestones, custom fields, timeline / network /
  people views** (ArsNovaSingers) — a large and coherent feature set that
  changes the data model (`status` moves from an enum to a `statuses`
  collection). It deserves its own release and migration rather than being
  folded into a hardening pass.

- **Cloud Run HTTP transport and Google IAP token minting for the MCP server**
  (ArsNovaSingers) — useful, but specific to one deployment target.
