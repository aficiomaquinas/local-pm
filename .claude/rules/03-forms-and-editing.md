# 03 — Forms, Inputs, Validation & Inline Editing

> Scope: every place the user types, picks, toggles, or commits a value.

---

## 3.1 Labels

| Rule | Why |
|---|---|
| **Label above the field. Always.** | Label and field land in one eye fixation — fastest completion, fewest errors |
| **Never placeholder-as-label** | It vanishes on the first keystroke, forcing recall, and is not a reliable accessible name |
| **Never floating/animated labels** | Shrunk text is hard to read, the motion disorients, autofill collides with it |
| Inline (left-aligned) labels | Dense settings and filter rows only. Never a primary data-entry form |
| Hint text is persistent | Format hints (`DD/MM/YYYY`) never live only in the placeholder |

```tsx
<div className="flex flex-col gap-1.5">
  <label htmlFor={id} className="text-xs font-medium text-muted">Title</label>
  <input id={id} aria-describedby={hintId} />
  <p id={hintId} className="text-xs text-subtle">Keep it under 80 characters.</p>
</div>
```

**Mark only the minority case.** If most fields are required, label the few optional ones `(optional)`. Do not asterisk everything. If `*` is used at all, add a legend **and** set `required` / `aria-required` — the glyph alone is not programmatic. Best of all: delete the optional field.

---

## 3.2 Validation timing — reward early, punish late

1. **Untouched field → never an error state.** No red borders on mount.
2. **First pass → validate on blur or on submit attempt.** Never mid-keystroke on first entry.
3. **Once a field has errored → re-validate on every keystroke**, so the error clears the instant it is fixed.
4. **As-you-type is for non-punitive feedback only**: password strength, character counters, availability checks, input masking. Debounce 300–500ms. Render as a hint, not an alarm.
5. Set `noValidate` on the `<form>` and own validation — native bubbles cannot be styled or made accessible.

```
untouched → (blur | submit) → invalid → (keystroke) → revalidate → valid
```

---

## 3.3 Error messages

**Content**
- Say what is wrong **and** how to fix it, in plain language.
- No "Sorry". No jargon. No blame. No raw error codes in the primary line.
- "Wrong password" — not "You have entered the wrong password."
- Withhold the fix only when stating it leaks security information.

**Placement**
- Inline message directly below its field **and** an error summary at the top of the form.
- Any form with 2+ fields gets both. Never summary-only. Never inline-only.
- Summary heading: `There is a problem`. Each entry is a link that focuses the offending field. Summary wording matches the inline wording **verbatim**.
- **On failed submit, move focus to the error summary.** Non-negotiable.
- Never put a field error in a tooltip. Never put one only in a toast.

**Markup**
```tsx
<input
  aria-invalid={hasError || undefined}
  aria-describedby={hasError ? errorId : hintId}
/>
<p id={errorId} role="alert" className="flex items-center gap-1 text-xs text-danger">
  <AlertCircle className="size-3.5 shrink-0" aria-hidden />
  {message}
</p>
```

- The error container exists in the DOM (empty when valid) so injected text is announced.
- Color is never the only signal — icon + text, always.
- If the same field errors for three different users, it is a design bug. Fix the field, not the message.

---

## 3.4 Layout

- **Single column by default.** Multi-column forms cause skipped fields and out-of-order completion.
- A 2-up row is allowed **only** when the two controls read as one semantic unit: First/Last name, City + Postcode, Start/End date. Never two unrelated fields side by side.
- Never split one logical value across visually disconnected columns.
- Group related fields under a section heading (`fieldset` + `legend` where semantics matter).
- Rare or advanced fields go behind progressive disclosure, not on screen by default.
- Conditional fields reveal only when their trigger is selected, and must not shift content the user is currently reading.

**One page vs steps**
- 1–6 fields, low commitment → one page. (Create ticket: title, description, assignee, status.)
- Long, high-commitment, or multi-domain → steps, with a progress indicator and **non-destructive back navigation**. Losing entered data on Back is a defect.

---

## 3.5 Control selection

| Options | Control |
|---|---|
| 2–4 exclusive | Radio group, or segmented control if it reads as a mode switch |
| 5–6, all should be visible | Radio group |
| 7–15 | `select` |
| >15, or dynamic/searchable | Combobox with type-ahead |
| Multi-select (labels, assignees) | Combobox + removable chips |

A dropdown for three options is a wasted click. A `select` for 200 options is a wasted minute.

---

## 3.6 Specialized inputs

**Dates** — support the calendar **and** manual typing. Calendar wins near today; typing wins for far dates and power users. Expected format shown as persistent hint text.

**Numbers** — avoid native `type="number"` spinners; they are inconsistent across browsers, invisible on mobile, and wrong for IDs and phone numbers.
- Custom `+ / −` steppers only where there is a common default and small adjustments are expected (estimate, story points).
- **Disable** stepper buttons at min/max — never hide them.
- Keep steppers horizontal on touch.
- Continuous or wide-range values → text input with `inputMode="numeric"`.

**Tags / chips input** — type to filter or create, Enter or `,` commits, Backspace on an empty input removes the last chip, every chip carries its own remove button.

**@mentions** — trigger on `@`, popover anchored to the caret, ↑/↓ to move, Enter/Tab to insert, Escape to dismiss without inserting.

**File upload** — drag-and-drop is a **bonus**, never the only path. Always ship click-to-browse. Show a drop-zone state on drag-over, real progress, and an explicit reason on rejection (type, size).

---

## 3.7 Inline editing

The default for a title, a description, a single metadata value, or a comment.

**Entering**
- **Single click** enters edit mode for text. Double-click is reserved for grid cells where single click means select.
- A hover affordance is required *before* the click: subtle surface tint and `cursor: text`. A pencil icon may supplement the click target, never replace it.
- The control is focusable and enterable from the keyboard — Enter or Space opens edit mode.
- Render a real `input` / `textarea` in edit mode. A `div` with a click handler and no semantics is a bug.
- On touch, where hover does not exist, show a persistent tap affordance.

**Committing**
- Single-line: **Enter** commits and exits.
- Multi-line: **Cmd/Ctrl+Enter** commits; plain Enter inserts a newline.
- **Escape** reverts to the pre-edit value and exits. Always available.
- Blur commits — but validate first, and never silently persist an invalid value.

**Feedback**
- Commit **optimistically**: paint the new value immediately, sync behind it.
- Show a transient saved state, then fade.
- On rejection: restore the original value, surface the reason, and keep the user's text recoverable.

**Do not inline-edit**
- Values with cross-object consequences (moving a ticket to another project, a date that shifts dependents) — use an explicit control that shows the consequence.
- Long-form rich content that deserves a full editing surface.
- Destructive or hard-to-reverse changes.

**Concurrency** — if a remote edit arrives for a field the user is actively editing, do not overwrite their buffer. Keep their text, show `Updated by <name>`, let them choose.

---

## 3.8 Autosave vs explicit save

**Autosave** — granular, low-risk, single-value edits: titles, descriptions, comments, card fields, board moves, status and assignee changes.

**Explicit save** — multi-field forms where a partial write leaves inconsistent state, or where the user needs a deliberate checkpoint: project creation, workspace settings, permissions.

Either way:
- Always render save state: `Saving…` → `Saved`. Removing the save button removes a sense of control; the visible response gives it back.
- **Autosave without undo is data loss with extra steps.** Ship session `Cmd/Ctrl+Z`, or keep edit history, or both.

---

## 3.9 Destructive actions

Friction scales with consequence. Pick the lowest honest rung.

| Rung | When | Pattern |
|---|---|---|
| 0 — none | Trivially reversible and user-visible | Just do it |
| 1 — undo toast | Reversible: archive, soft delete, remove from board, bulk move | Execute immediately, offer **Undo** for ≥10s |
| 2 — confirm | Infrequent, unfamiliar, or affects other people | Dialog naming the exact object |
| 3 — consequence confirm | Cascading loss | Dialog stating the count: "Permanently delete 14 tickets and their history" |
| 4 — type-to-confirm | Irreversible destruction of a container | User types the resource name; the primary action stays disabled until it matches |

- **Prefer undo over confirm** for anything reversible. It keeps the intended path fast and still catches accidents.
- Say "This cannot be undone" when true. Never let the user infer reversibility.
- Destructive buttons use the danger token **and** an explicit verb ("Delete project"), never "OK".
- Never focus the destructive button by default in a dialog — focus the least destructive one.
- Back any toast-based undo with a durable path (an activity log, a trash view). The toast expires; the recovery must not.

---

## 3.10 Unsaved-changes guard

- Warn **only** when there is genuinely unsaved, non-trivial data. Never for autosaved single fields.
- `beforeunload` covers tab close and hard refresh only. In-app route changes need the router's navigation guard — wire both.
- Attach the `beforeunload` listener only while the form is dirty; detach on clean.
- Browser unload dialogs cannot be worded. For in-app navigation use our own: **Cancel / Discard / Save and leave**.
- Disable click-outside-to-close on any dialog holding dirty form state; intercept with the discard confirmation instead.

---

## 3.11 Keyboard

- **Enter** submits a single-line form. Do not hijack it except inside a combobox, where Enter selects the highlighted option.
- **Cmd/Ctrl+Enter** submits from every multi-line textarea in the app. No exceptions.
- **Escape** cancels the nearest transient surface (inline edit → popover → dialog) and returns focus to its trigger.
- Tab order follows visual reading order; a 2-up row tabs left→right, then down.
- **Autofocus**: allowed in a single-purpose dialog (rename, quick add) or a dedicated search view. **Never** on initial load of a multi-field page, and **never** into a field positioned after an error summary.

---

## 3.12 Submission

- **Never disable the submit button to express invalidity.** It explains nothing, breaks with password-manager autofill, and strands touch users behind blur-based validation.
- Keep it enabled → validate on submit attempt → on failure show summary + inline errors → focus the summary.
- **Do** disable and show `Saving…` *after* a valid submit fires, to block double submission. Implement in the submit handler, after validation. Back it with server-side idempotency — the client guard is bypassable.
- After success:
  - In-context edit → inline `Saved` or a quiet toast. Do not navigate.
  - Object creation → navigate to the new object when it is the natural next destination.
  - Terminal flow → success banner.

---

## 3.13 Sizing & targets

- Field width hints at expected content:
  - Fixed length (year, postcode) → sized to max length.
  - Normal free text → 18–33 characters.
  - Long values (email, URL, title) → full column width.
- **Minimum interactive target: 44 × 44 CSS px.** 24 × 24 is the WCAG 2.2 floor and is permitted only in dense toolbars where 44 is impossible — and only with ≥24px clear spacing to neighbours.
- Icon-only controls: 16–20px glyph padded to a 44px hit area.
- **Inputs are ≥16px font on mobile**, or iOS Safari zooms the viewport on focus.

---

## 3.14 Form-specific WCAG hooks

| SC | Requirement |
|---|---|
| 3.3.1 Error Identification (A) | Errors identified in text, not colour |
| 3.3.3 Error Suggestion (AA) | Suggest the fix when it is known |
| 3.3.7 Redundant Entry (A) | Never ask twice in one flow — offer "same as above" or prefill |
| 3.3.8 Accessible Authentication (AA) | Allow paste, password managers, and autofill. No memory-only or transcription-only step |
| 2.5.8 Target Size (AA) | See 3.13 |
