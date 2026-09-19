# 09 — Keyboard Map

This app is keyboard-first. The map below follows the vocabulary that has converged
across Linear, GitHub, Gmail and Superhuman — users arrive already knowing it.
Do not invent alternatives.

---

## 9.1 Global

| Key | Action |
|---|---|
| `Cmd/Ctrl + K` | Command palette — execute any action by name, and global search |
| `/` | Focus the in-view search/filter box |
| `?` | Shortcut cheat sheet for the **current context** |
| `Esc` | Close the nearest overlay → cancel the nearest edit → clear selection. One level per press |
| `Cmd/Ctrl + Z` | Undo the last action, including inline edits and board moves |
| `Cmd/Ctrl + \` | Toggle the sidebar |
| `Cmd/Ctrl + Enter` | Submit from any multi-line textarea |

`/` and `Cmd+K` are different things. `/` narrows what is on screen; `Cmd+K` goes anywhere and does anything.

---

## 9.2 Navigation — `G` then a letter

| Chord | Destination |
|---|---|
| `G` `B` | Backlog |
| `G` `M` | My tickets |
| `G` `I` | Inbox / notifications |
| `G` `P` | Projects |
| `G` `T` | Teams |
| `G` `V` | Board view |

The two-key "go to" chord originates with GitHub and is now conventional. The chord window is 1s; a non-matching second key cancels silently.

---

## 9.3 Item actions

Fire on the **focused or hovered** item — in a list, on a board, or in a detail view.

| Key | Action |
|---|---|
| `C` | Create new ticket |
| `E` | Edit / enter inline edit on the focused field |
| `A` | Assign to… |
| `I` | Assign to me |
| `S` | Set status |
| `P` | Set priority |
| `L` | Add label |
| `D` | Set due date |
| `X` | Toggle selection (for bulk actions) |
| `Enter` | Open the focused item |
| `↑` `↓` | Move focus between items |
| `Cmd/Ctrl + Backspace` | Delete — **always** behind a confirm or undo toast |

**Destructive actions never take a bare letter key.** They require a modifier.

---

## 9.4 Drag and drop

| Key | Action |
|---|---|
| `Space` / `Enter` | Lift the focused card |
| `↑ ↓ ← →` | Move it |
| `Space` / `Enter` | Drop |
| `Esc` | Cancel and return to origin |

---

## 9.5 Rules for implementing shortcuts

1. **Single-character shortcuts fire only when no editable element has focus.** Check the active element before handling. This is WCAG 2.1.4, not a nicety.
2. **Scope to context.** Item shortcuts fire only when an item is focused or hovered, never globally.
3. **Anything global takes a modifier.**
4. **Never override browser shortcuts**: `Cmd/Ctrl + W / T / N / R / L`, and `Cmd/Ctrl + F` unless in-app find is clearly announced.
5. **Register centrally**, not with scattered `keydown` listeners. One registry, so `?` can render the live truth and shortcuts can be scoped and later remapped.
6. **Ship enabled by default.** GitHub deprecated its command palette on "low usage" telemetry that turned out to be an artifact of it being off by default, and reversed within five days. Off-by-default poisons your own data.

---

## 9.6 The palette teaches the shortcuts

Every command palette row displays its keyboard shortcut, right-aligned.
So does every menu item that has one.

This is Superhuman's pedagogy: the palette's job is to make itself unnecessary.
A user who reaches for `Cmd+K` → "Set priority" sees `P` sitting next to it, and
in a week stops opening the palette for that action at all.

Apply the same treatment in `?`: show the shortcuts for the **current** context,
live, not a static help page.
