# References

Where the rules come from. Consult these when a rule needs to be challenged,
extended, or defended — not for routine work.

## Standards

- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/) — the AA baseline in `08-accessibility.md`
- [SC 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — uses a kanban board as its worked example
- [SC 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG20/Understanding/timing-adjustable) — why errors never auto-dismiss
- [SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html) · [SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html) · [SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) — [Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter)

## Research

- [NN/g — Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — the 0.1s / 1s / 10s thresholds
- [NN/g — Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) · [Mejtoft et al., ECCE 2018](https://dl.acm.org/doi/10.1145/3232078.3232086) — skeletons improve *perceived* speed, not task time
- [NN/g — Error Message Guidelines](https://www.nngroup.com/articles/errors-forms-design-guidelines/) · [Placeholders Are Harmful](https://www.nngroup.com/articles/form-design-placeholders/)
- [NN/g — Data Tables](https://www.nngroup.com/articles/data-tables/) · [Empty States](https://www.nngroup.com/articles/empty-state-interface-design/) · [Icon Usability](https://www.nngroup.com/articles/icon-usability/)
- [NN/g — Hamburger menus reduce navigation use](https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/)
- [NN/g — Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/) · [Modal vs Nonmodal](https://www.nngroup.com/articles/modal-nonmodal-dialog/)
- [Baymard — Items loaded by default](https://baymard.com/blog/number-of-items-loaded-by-default) · [Avoid multi-column forms](https://baymard.com/blog/avoid-multi-column-forms) · [Field width usability](https://baymard.com/blog/form-field-usability-matching-user-expectations)
- [Smashing — Pagination vs Infinite Scroll vs Load More](https://www.smashingmagazine.com/2016/03/pagination-infinite-scrolling-load-more-buttons/)
- [Pencil & Paper — Enterprise data tables](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) · [Drag & drop](https://www.pencilandpaper.io/articles/ux-pattern-drag-and-drop) · [Success message UX](https://www.pencilandpaper.io/articles/success-ux)
- [Adam Silver — The problem with disabled buttons](https://adamsilver.io/blog/the-problem-with-disabled-buttons-and-what-to-do-instead/) · [Required vs optional fields](https://adamsilver.io/blog/how-to-highlight-required-and-optional-form-fields/)
- [GOV.UK Design System — Validation pattern](https://design-system.service.gov.uk/patterns/validation/)

## Design systems

- [Radix Colors — understanding the 12-step scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- [Material 3 — Motion easing & duration tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs) · [Color roles](https://m3.material.io/styles/color/roles) · [Side sheets](https://m3.material.io/components/side-sheets/guidelines)
- [Atlassian — Pragmatic drag-and-drop design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines) · [accessibility guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines) · [Spacing](https://atlassian.design/foundations/spacing)
- [IBM Carbon — Data table](https://carbondesignsystem.com/components/data-table/usage/) · [Typography](https://carbondesignsystem.com/elements/typography/overview/)
- [Shopify Polaris — Index table](https://polaris-react.shopify.com/components/tables/index-table)
- [Radix Primitives — Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) · [Toast](https://www.radix-ui.com/primitives/docs/components/toast)
- [Adobe Spectrum — Action bar](https://spectrum.adobe.com/page/action-bar/)

## Products worth studying

- [Linear — How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) — LCH-generated color from 3 variables, Inter, inverted-L chrome
- [Linear docs — Filters](https://linear.app/docs/filters) · [Custom views](https://linear.app/docs/custom-views) · [Triage](https://linear.app/docs/triage)
- [Superhuman — How to build a remarkable command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/) — the palette teaches its own shortcuts
- [Figma — Realtime editing of ordered sequences](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/) — fractional indexing
- [Figma — Multiplayer editing](https://www.figma.com/blog/multiplayer-editing-in-figma/)
- [Notion — Side peek / center peek / full page](https://www.notion.com/releases/2022-07-20) — the three-tier disclosure model
- [The Register — GitHub reverses command palette deprecation](https://www.theregister.com/2025/07/22/github_command_palette_backtrack/) — off-by-default poisons your telemetry
- [Atlassian Community — Jira's ever-evolving UI, 2025](https://community.atlassian.com/forums/Jira-articles/Jira-s-ever-evolving-UI-2025-Edition/ba-p/2966105) — the density/clicks regression, as a negative case study

## Engineering

- [Tailwind v4 — Theme variables](https://tailwindcss.com/docs/theme) · [Dark mode](https://tailwindcss.com/docs/dark-mode)
- [Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- [web.dev — Animations guide](https://web.dev/articles/animations-guide) — why only `transform` and `opacity`
- [web.dev — Virtualize long lists](https://web.dev/articles/virtualize-long-lists-react-window)
- [dnd-kit — Accessibility](https://docs.dndkit.com/guides/accessibility)
- [CSS-Tricks — Careful with nested border radii](https://css-tricks.com/public-service-announcement-careful-with-your-nested-border-radii/) · [Accessible SVG icons](https://css-tricks.com/accessible-svg-icons/)
- [MDN — `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) · [`beforeunload`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)

## Assets

- [Lucide](https://lucide.dev/) (ISC) · [Phosphor](https://phosphoricons.com/) (MIT) · [Simple Icons](https://simpleicons.org/) (CC0)
- [unDraw](https://undraw.co/) (no attribution) · [Open Peeps](https://www.openpeeps.com/) (CC0)
- [country-flag-icons](https://www.npmjs.com/package/country-flag-icons) (MIT)
