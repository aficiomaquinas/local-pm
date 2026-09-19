# local-pm

Keyboard-first project management app. Kanban boards, tickets, projects, teams.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Payload CMS 3 (MongoDB) · `@dnd-kit` · `lucide-react` · Vitest · Playwright

```
src/app/(frontend)   app routes           src/collections   Payload schemas
src/app/(payload)    Payload admin/API    src/hooks         shared hooks
src/components       UI by domain         src/lib           utilities, access
src/components/ui    shared primitives    mcp-server        MCP integration
```

```bash
npm run dev        # port 3010
npm run verify     # typecheck + unit + e2e — run before declaring work done
npm run typecheck
npm test
npm run test:e2e
```

---

## UI/UX rules — read before writing any interface code

The design system lives in `.claude/rules/`. **These are requirements, not
suggestions.** Load the relevant file before building or changing UI.

| File | Covers |
|---|---|
| [`00-principles.md`](.claude/rules/00-principles.md) | The ten non-negotiables, decision trees (which surface, how much feedback, which control) |
| [`01-foundations.md`](.claude/rules/01-foundations.md) | Tokens, color, contrast, typography, spacing, radius, elevation, motion, loading thresholds, icons, focus |
| [`02-components.md`](.claude/rules/02-components.md) | Buttons, inputs, chips, avatars, menus, tooltips, cards, rows, dialogs, skeletons |
| [`03-forms-and-editing.md`](.claude/rules/03-forms-and-editing.md) | Labels, validation timing, errors, inline editing, autosave, destructive actions, submission |
| [`04-data-views.md`](.claude/rules/04-data-views.md) | Tables, filters, complex filters, saved views, search, sorting, grouping, pagination, empty states |
| [`05-board-and-dnd.md`](.claude/rules/05-board-and-dnd.md) | Board structure, card density budget, chips, drag & drop, real-time, mobile board |
| [`06-layout-and-navigation.md`](.claude/rules/06-layout-and-navigation.md) | App shell, sidebar, dialog vs panel vs page, modal behavior, responsive, breadcrumbs |
| [`07-feedback-and-errors.md`](.claude/rules/07-feedback-and-errors.md) | Toasts, undo, error taxonomy, error boundaries, copy, loading, optimistic UI |
| [`08-accessibility.md`](.claude/rules/08-accessibility.md) | WCAG 2.2 AA baseline and how to verify it |
| [`09-keyboard.md`](.claude/rules/09-keyboard.md) | The shortcut map and the rules for adding to it |
| [`10-assets-icons.md`](.claude/rules/10-assets-icons.md) | Approved icon and illustration sources, bundle config, custom SVGs |
| [`11-review-checklist.md`](.claude/rules/11-review-checklist.md) | What to verify before calling UI work done |

### The short version

1. **Speed is a feature.** Optimistic writes, sub-100ms perceived response.
2. **Keyboard parity.** Everything doable with a mouse is doable without one — drag and drop included.
3. **Color never carries meaning alone.** The app must work in grayscale.
4. **Every view is a URL.** Detail views, filters and sorts are addressable and shareable.
5. **Tokens, not values.** No raw hex, px, or ms in components.
6. **Undo beats confirm.** Dialogs are for the genuinely irreversible.
7. **Never toast what the user can already see.**
8. **Four states, always**: loading, empty, error, populated.
9. **One icon family** (`lucide-react`), three sizes (16/20/24), one stroke width (2).
10. **WCAG 2.2 AA is the floor**, not the goal.

---

## Working agreements

- Run `npm run verify` before reporting work complete.
- Interactive elements are real `button` / `a` / `input` elements. A `div` with `onClick` is a bug.
- Presentational components do not fetch. Keep data access at the boundary.
- Tailwind v4 is CSS-first: tokens live in `@theme` in `src/app/globals.css`. There is no `tailwind.config.js`.
- Components never write `dark:` for color — the light/dark swap happens in the primitive token layer.
- New shortcuts go in the central registry so `?` stays truthful.
