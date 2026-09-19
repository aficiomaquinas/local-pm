# 01 — Foundations: Tokens, Color, Type, Space, Motion, Icons

Everything visual in this app resolves to a token. If you are about to type a raw
hex, a raw px value, or a raw duration into a component, stop — add or use a token.

---

## 1.1 Token architecture — three layers, one direction

```
primitives   →   semantic   →   component
slate-11         text-muted     button-ghost-fg
indigo-9         accent-solid   focus-ring
```

- **Primitives** are the raw 12-step scales. They live in exactly one file and are never referenced by a component.
- **Semantic tokens** name a *job* (`--color-surface`, `--color-text-muted`, `--color-border-subtle`). Components use these.
- **Component tokens** exist only when a component genuinely needs to deviate. Prefer not creating them.

**Rule: component code never references a primitive.** `bg-slate-3` in a component is a bug; `bg-surface` is correct.

---

## 1.2 Color

### Source scales

Primitives come from **Radix Colors** 12-step scales — they are contrast-engineered per step and ship matched dark variants.

| Role | Light scale | Dark scale |
|---|---|---|
| Neutral (the workhorse) | `slate` | `slateDark` |
| Accent / brand | `indigo` | `indigoDark` |
| Danger | `red` | `redDark` |
| Warning | `amber` | `amberDark` |
| Success | `green` | `greenDark` |
| Info | `blue` | `blueDark` |

**Six hue families. That is the whole palette.** Adding a seventh requires a written reason.

### What each of the 12 steps is for

Each step has exactly one job. Never repurpose a step.

| Step | Job |
|---|---|
| 1 | App background |
| 2 | Subtle background (striping, subdued panels) |
| 3 | Component background — rest |
| 4 | Component background — hover |
| 5 | Component background — pressed / selected |
| 6 | Subtle border, separator |
| 7 | Component border, focus ring on subtle surfaces |
| 8 | Strong border, hovered component border |
| 9 | Solid fill (the purest step — primary buttons, badges) |
| 10 | Solid fill — hover |
| 11 | Low-contrast text (secondary, muted, placeholder) |
| 12 | High-contrast text (primary body) |

### Semantic tokens — the contract

```
--color-bg              slate-1    app canvas
--color-bg-subtle       slate-2    striping, inset panels
--color-surface         slate-2    cards, rows, inputs at rest
--color-surface-hover   slate-3    row/card hover
--color-surface-active  slate-4    pressed / selected row
--color-overlay         slate-2    popovers, dialogs, menus

--color-border-subtle   slate-6    separators, dividers, card edges
--color-border          slate-7    input borders, control outlines
--color-border-strong   slate-8    hovered control borders

--color-text            slate-12   primary body text
--color-text-muted      slate-11   secondary text, metadata, placeholders
--color-text-disabled   slate-8    disabled labels only

--color-accent          indigo-9   primary button fill, selected nav
--color-accent-hover    indigo-10
--color-accent-fg       white      text on accent fill
--color-accent-text     indigo-11  links, accent text on neutral bg
--color-accent-subtle   indigo-3   selected row tint, accent chip bg

--color-danger / -hover / -fg / -text / -subtle    red-9 / 10 / white / 11 / 3
--color-warning / …                                amber-9 / 10 / …
--color-success / …                                green-9 / 10 / …
--color-info / …                                   blue-9 / 10 / …

--color-focus           indigo-8   focus ring
```

### Usage rules

- **Accent covers ≤10% of visible pixels.** Reserve it for: the single primary action on screen, active/selected nav, links, focus rings, and selection tints. Never for decoration, never for large surface fills.
- One primary (accent-filled) button per view. Everything else is secondary or ghost.
- Neutral does ≥80% of the work — backgrounds, borders, body text, most icons.

### Status color semantics

| Meaning | Hue | Mandatory redundant cue |
|---|---|---|
| Danger / blocked / overdue | red | icon + text |
| Warning / at risk | amber | icon + text |
| Success / done | green | icon + text |
| Info / in progress | blue | icon + text |
| Neutral / backlog / none | slate | icon + text |

- **Color is never the only signal (WCAG 1.4.1).** Every status, priority and label pairs its color with a distinct **shape/icon** or **text**. The UI must remain fully readable in grayscale.
- Never let two adjacent states differ only by hue (red vs orange). Vary shape and lightness too.
- Avoid red/green as the sole differentiating pair anywhere — ~8% of men cannot separate them. Blue/orange survives every common form of color vision deficiency.
- Priority uses shape first, color second: `▲▲▲` urgent, `▲▲` high, `▲` medium, `–` low, `·` none.

### Dark mode

- Background sits at **8–12% lightness**. Never `#000000` — pure black against bright text causes halation.
- Primary text sits at **90–95% lightness**. Never `#FFFFFF`.
- **Elevation is lightness, not shadow.** Shadows barely read on dark surfaces. Each layer rises ~3–4 lightness points: canvas → card → popover → dialog.
- **Desaturate** accent and status hues 10–20% versus light mode; saturated color vibrates on dark.
- Re-verify every pairing's contrast ratio in dark mode independently. Inversion does not preserve compliance.

### Contrast floors (WCAG 2.2 AA — non-negotiable)

| What | Ratio |
|---|---|
| Body text | **4.5:1** |
| Large text (≥24px, or ≥18.66px bold) | **3:1** |
| UI component borders, meaningful icons, chart marks (SC 1.4.11) | **3:1** |
| Focus indicator vs both its unfocused state and the adjacent background (SC 2.4.11) | **3:1** |

- Placeholder text is text. It meets 4.5:1 or it does not ship.
- The disabled-state exemption exists, but "quiet secondary button" is not a disabled state. Do not hide behind it.
- Tinted chip/badge backgrounds must still carry 4.5:1 text contrast against the tint.

---

## 1.3 Typography

**Font:** Inter Variable. One family. System stack as fallback only.
**Numerals:** `font-variant-numeric: tabular-nums` on every numeric column, count, ID, estimate, and timer.

### Scale

| Token | px / rem | Line height | Use |
|---|---|---|---|
| `text-2xs` | 11 / 0.6875 | 1.45 | Badge counters, micro labels. Never body copy. |
| `text-xs` | 12 / 0.75 | 1.45 | Captions, metadata, table secondary |
| `text-sm` | 13 / 0.8125 | 1.45 | Dense rows, sidebar, card metadata |
| `text-base` | **14 / 0.875** | 1.5 | **Default UI text** |
| `text-md` | 16 / 1 | 1.5 | Comfortable prose, descriptions |
| `text-lg` | 18 / 1.125 | 1.4 | Subheadings |
| `text-xl` | 20 / 1.25 | 1.3 | H4 |
| `text-2xl` | 24 / 1.5 | 1.25 | H3 |
| `text-3xl` | 30 / 1.875 | 1.2 | H2 |
| `text-4xl` | 36 / 2.25 | 1.15 | H1 |

- **Never below 12px for anything readable.** 11px is for counters only.
- **Weights: 400, 500, 600. Three.** 400 body, 500 labels/active nav/buttons, 600 headings. No 700+. No 300.
- **Measure: 45–75 characters.** Cap prose containers at `max-w-[70ch]`.
- Negative letter-spacing only at ≥20px, scaling with size. Positive tracking (0.02–0.06em) only on small uppercase labels.
- Every truncated string (`truncate` or `line-clamp-n`) carries a `title` or tooltip with the full value.

---

## 1.4 Spacing

**Base unit: 4px.** 4px steps below 16, 8px steps above.

```
0  2  4  6  8  12  16  20  24  32  40  48  64  80  96
```

- **Proximity beats borders.** Gap between related elements (label↔input, icon↔text) must be visibly smaller (4–8px) than the gap between unrelated groups (16–32px). This single ratio does more for perceived structure than any divider.
- Minimum internal gap inside a dense card or row: **12px**. Below that, boundaries stop reading.
- Icons next to text are **optically** centered to cap height — expect a 1–2px manual nudge. Trust your eye over the box model.

### Container widths

| Context | Max width |
|---|---|
| Prose / description / comment body | 640–768px |
| Detail panel, settings form | 960px |
| Dashboard / detail page | 1140px |
| Full app shell | 1440–1600px, then side gutters |

### Breakpoints (mobile-first, min-width)

```
sm 640   md 768   lg 1024   xl 1280   2xl 1536
```

No ad-hoc breakpoints outside this set.

---

## 1.5 Radius

```
radius-xs    4px    chips, badges, small tags
radius-sm    6px    inputs, buttons, menu items
radius-md    8px    cards, rows, panels          ← default
radius-lg    12px   large cards, popovers
radius-xl    16px   dialogs, sheets
radius-full  9999   avatars, pills, dots
```

**Nesting rule: `inner radius = outer radius − padding`.** A badge inside a card with 8px padding and a 12px outer radius gets 4px, not 12px. Concentric arcs must stay parallel.

---

## 1.6 Elevation — five levels

Separation hierarchy, in order of preference: **whitespace → background shift → hairline border → shadow.**
Shadows are expensive. They mean "this floats above the page," nothing else. Never use a shadow to separate two static in-flow sections.

| Level | Meaning | Light | Dark |
|---|---|---|---|
| 0 | Flat / in-flow | none | canvas lightness |
| 1 | Card, row hover | `0 1px 2px rgb(0 0 0 / .06)` + 1px border | +3L |
| 2 | Dropdown, popover, tooltip | `0 4px 8px rgb(0 0 0 / .10)` | +6L |
| 3 | Dialog, sheet | `0 8px 24px rgb(0 0 0 / .14)` | +9L |
| 4 | Toast (topmost) | `0 16px 40px rgb(0 0 0 / .18)` | +12L |

---

## 1.7 Motion

### Durations

```
duration-micro      120ms   toggles, checkboxes, button press, hover tint
duration-fast       180ms   tooltip, chip, small state change
duration-standard   240ms   dropdown, tab switch, accordion
duration-entrance   320ms   dialog, side panel, sheet
duration-large      420ms   page/view transition   ← the ceiling
```

**Nothing exceeds ~500ms.** Past that it reads as lag, not polish.

### Easing

```
ease-enter     cubic-bezier(0, 0, 0, 1)        decelerate — things arriving
ease-exit      cubic-bezier(0.3, 0, 1, 1)      accelerate — things leaving
ease-standard  cubic-bezier(0.2, 0, 0, 1)      default for everything else
```

Entering eases out (fast start, gentle settle — feels responsive). Exiting eases in (gets out of the way).

### Hard rules

- **Animate `transform` and `opacity` only.** These run on the compositor.
- **Never animate** `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size`. Every frame forces style-recalc → layout → paint. That is jank.
- Animation must communicate a **state change**. Decoration is the first thing cut.
- List stagger: 20–40ms per item, capped at 8–10 items. Beyond that the cumulative delay is itself the lag.
- **`prefers-reduced-motion: reduce` is a hard requirement.** Wrap all non-essential motion; fall back to instant or opacity-only. Never fall back to "nothing happens."

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 1.8 Loading & perceived performance

Nielsen's thresholds govern everything here: **0.1s** = instantaneous, **1s** = the limit of uninterrupted flow, **10s** = the limit of attention.

| Elapsed | Show |
|---|---|
| < 100ms | **Nothing.** Optimistic UI. |
| 100ms – 1s | Nothing, or a localized inline indicator on the element that changed. Never a full-screen loader. |
| 1s – 10s | Skeleton for structural/first loads; determinate progress bar if the size is knowable |
| > 10s | Progress with percent or time estimate, plus a way to keep working elsewhere |

- **Delay any spinner/skeleton by 150–200ms** so fast responses never flash a loading state.
- Once shown, **hold it a minimum 400–500ms** so it cannot flicker.
- **Skeletons must match final content dimensions exactly.** A skeleton that causes layout shift is worse than a spinner. Evidence is nuanced: skeletons measurably improve *perceived* speed, but they do not improve task time — they are a perception tool, not a substitute for being fast.
- Determinate progress for anything with knowable size (upload, import, bulk action). Never an indeterminate spinner where a real percentage exists.
- **Stale-while-revalidate:** show cached data immediately, refetch behind it. Never re-show a full loading state for data the user already saw.

---

## 1.9 Icons

**One family: `lucide-react`. One stroke width: 2px.** Never mix icon sets — differing stroke weight and corner radius is visible to everyone, including people who cannot name why.

| Size | Use |
|---|---|
| 16px | Inline with 13–14px text, table row actions, chip icons |
| 20px | Default toolbar and button icons |
| 24px | Standalone nav icons, empty states |

No other sizes.

- Icons are `aria-hidden` when accompanied by a visible text label.
- **Icon-only controls carry `aria-label` AND a tooltip on hover/focus.** Permitted only in high-frequency, learned toolbar positions (row overflow, close button).
- **NN/g: icons are ambiguous without labels.** When in doubt, add the word.
- **Destructive actions always show icon + explicit verb** ("Delete", "Archive"). Never a bare trash can — the cost of a misread icon is highest exactly where the action is hardest to undo.
- Icons inherit `currentColor`. Never hardcode a fill.

---

## 1.10 Focus

- **Never `outline: none`** without a compliant ring in the same rule. It is a direct SC 2.4.7 failure.
- Use **`:focus-visible`**, not bare `:focus` — mouse users should not see rings on click, keyboard users always should.
- Ring spec: **2px solid `--color-focus`, 2px offset**, ≥3:1 against both the element's unfocused state and the adjacent background.
- Focus order follows visual reading order.
- Every page ships a visually-hidden **"Skip to main content"** link as the first tabbable element. This app has a persistent sidebar; without it, keyboard users tab through nav on every page.

---

## 1.11 Tailwind v4 implementation

Tailwind v4 is CSS-first. There is no `tailwind.config.js`. Tokens live in `@theme` in `src/app/globals.css` and generate utilities automatically.

```css
@import 'tailwindcss';

/* Manual override wins over the media query below. */
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));

:root {
  /* primitives — referenced only by the semantic layer below */
  --slate-1: …; --slate-2: …; /* … 12 steps per family */
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* dark primitives */ }
}
[data-theme='dark'] { /* dark primitives */ }

@theme inline {
  /* semantic layer — this is what components use */
  --color-bg: var(--slate-1);
  --color-surface: var(--slate-2);
  --color-surface-hover: var(--slate-3);
  --color-border-subtle: var(--slate-6);
  --color-text: var(--slate-12);
  --color-text-muted: var(--slate-11);
  --color-accent: var(--indigo-9);
  --color-focus: var(--indigo-8);

  --text-base: 0.875rem;
  --spacing: 4px;
  --radius-md: 8px;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

- `@theme inline` is required when a theme variable references another variable — without it, cascade resolution fails.
- Semantic tokens are defined **once**; the light/dark switch happens in the primitive layer only. A component never writes `dark:` for color.
- `dark:` variants are permitted only for things tokens cannot express (e.g., swapping a shadow for a border).
