# 10 — Icons, SVGs & Illustrations

---

## 10.1 The approved sources

| Need | Source | License | Why |
|---|---|---|---|
| **UI icons (primary)** | **Lucide** — `lucide-react` | **ISC** (MIT-equivalent, no attribution) | ~1,780 icons on a 24×24 / 2px grid. Already the dependency. Matches the Linear/GitHub visual language. Tree-shakable React package |
| **UI icons (gap filler)** | **Phosphor** — `@phosphor-icons/react` | **MIT** | ~1,250 base icons in 6 weights. Its Fill/Duotone weights give a distinct active/selected nav state without importing a clashing stroke language |
| **Brand & integration logos** | **Simple Icons** — `simple-icons` | **CC0** (public domain) | 3,400+ single-path brand marks with official hex colors. Zero attribution risk |
| **Country flags** | `country-flag-icons` | MIT | Ready-made React components |
| **Empty-state illustrations** | **unDraw** | Free, **no attribution required** | Recolorable to the app accent via its built-in picker, scene-based |
| **Avatar / onboarding illustration** | **Open Peeps** | **CC0** | Character-only, pairs cleanly with unDraw |

### Explicitly rejected

| Source | Reason |
|---|---|
| Font Awesome Free | CC BY 4.0 — **requires attribution**; Light/Thin/Duotone/Sharp are paid-only |
| Solar, Streamline free tier | CC BY 4.0 — attribution required |
| Nucleo | Proprietary, seat-based, redistribution caps |
| Hugeicons | Most of the catalog is behind a paywall |
| Storyset | Free tier requires attribution |
| Blush, Popsy | Per-pack licensing; not uniform, not verifiable at a glance |
| Heroicons, Tabler, Remix, Iconoir, Material Symbols | Fine libraries — but **one icon family only**. Mixing stroke weights and corner radii is visible to everyone |

**Rule: never add a second UI icon family.** If Lucide lacks a glyph, take it from Phosphor at matching optical weight, or draw it on the 24×24 / 2px grid.

---

## 10.2 Bundle configuration

`lucide-react` is a barrel export. A naive `import { Check } from 'lucide-react'` pulls the full module graph into dev and can bloat the bundle. Next.js fixes this statically:

```ts
// next.config.ts
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@phosphor-icons/react'],
  },
}
```

This rewrites each named import to its individual module path automatically — no
`import Check from 'lucide-react/dist/esm/icons/check'` verbosity, no 1,500-module
dev-server cost.

- Always import by name: `import { Check, Plus } from 'lucide-react'`.
- Never `import * as Icons`.
- Verify with a bundle analysis when adding a new icon-heavy surface.

---

## 10.3 Sizing and color

Three sizes only — 16 / 20 / 24 — per `01-foundations.md §1.9`.

```tsx
<Check className="size-4" aria-hidden />   // 16px — inline with 13–14px text
<Plus  className="size-5" aria-hidden />   // 20px — toolbar, buttons
<Inbox className="size-6" aria-hidden />   // 24px — nav, empty states
```

- **Icons inherit `currentColor`.** Never hardcode `fill` or `stroke` to a literal color — that breaks theming, hover states, and dark mode in one stroke.
- Stroke width is **2**, everywhere. Do not tune it per icon.
- When one source icon renders at more than one size, add `vector-effect: non-scaling-stroke` so the stroke does not visually thicken or thin.
- Icons pair with text at cap-height optical centre — expect a 1–2px nudge. Trust the eye, not the box.

---

## 10.4 Custom SVGs

| Custom icon count | Mechanism |
|---|---|
| **< 50** | Hand-written inline React components in `src/components/ui/icons/` |
| **50–100** | SVGR (`@svgr/webpack`) generating typed components from `.svg` files |
| **> 100** | Sprite sheet (`<symbol>` + `<use>`) — one cached request |

Currently: inline components. Do not reach for SVGR or a sprite before the counts above justify them.

Every custom icon:
- is authored on the **24×24 grid at 2px stroke** so it sits beside Lucide without looking foreign;
- uses `stroke="currentColor"` / `fill="currentColor"`;
- carries no hardcoded `width`/`height` — size comes from the class;
- has `focusable="false"`.

```tsx
export function Dependency({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round"
         className={className} focusable="false" aria-hidden>
      <path d="…" />
    </svg>
  )
}
```

---

## 10.5 Accessibility

| Case | Markup |
|---|---|
| Icon beside visible text | `aria-hidden` on the SVG. The text is the accessible name |
| Icon-only button | `aria-label` on the **`<button>`**, `aria-hidden` on the SVG. **Never label both** — that double-announces |
| Standalone informational SVG | `role="img"` + `aria-label`, or `<title>` + `aria-labelledby` |

- Do not rely on an inline `<title>` alone for an interactive icon — screen reader support is inconsistent. Put the name on the control.
- Every icon-only control also gets a tooltip, for sighted mouse users.
- Destructive actions show **icon + explicit verb**, never a bare trash can.

---

## 10.6 Illustrations

- Empty-state illustrations are **optional** and reserved for **first-run** states only. Filtered-empty and error states stay compact and textual.
- Recolor unDraw art to the app accent so it belongs to the product rather than floating on top of it.
- Max one illustration per screen.
- Illustrations are decorative: `aria-hidden`, with the meaning carried by the adjacent heading and text.
- Store under `public/illustrations/`, optimized with SVGO, and serve through `next/image` where rasterized.
