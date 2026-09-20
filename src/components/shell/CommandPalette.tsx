'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, FolderKanban, LayoutDashboard, Search, Ticket, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatKeys, useShortcut, useShortcutRegistry } from '@/lib/shortcuts'
import { Dialog } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'

const DEBOUNCE_MS = 300
const MIN_QUERY = 3

interface Row {
  id: string
  label: string
  sublabel?: string
  icon: typeof Search
  shortcut?: string
  group: string
  run: () => void
}

interface SearchDoc {
  id: string
  title?: string
  name?: string
  ticketId?: string | null
  prefix?: string
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-accent-subtle text-accent-text">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  )
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { shortcuts } = useShortcutRegistry()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Row[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useShortcut({
    id: 'palette.open',
    keys: 'mod+k',
    description: 'Open the command palette',
    group: 'Global',
    scope: 'global',
    allowInInput: true,
    run: () => onOpenChange(!open),
  })

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setActive(0)
    }
  }, [open])

  const commands = useMemo<Row[]>(() => {
    const nav: Row[] = [
      {
        id: 'nav.board',
        label: 'Go to Board',
        icon: LayoutDashboard,
        shortcut: 'g v',
        group: 'Navigate',
        run: () => router.push('/board'),
      },
      {
        id: 'nav.projects',
        label: 'Go to Projects',
        icon: FolderKanban,
        shortcut: 'g p',
        group: 'Navigate',
        run: () => router.push('/projects'),
      },
      {
        id: 'nav.teams',
        label: 'Go to Teams',
        icon: Users,
        shortcut: 'g t',
        group: 'Navigate',
        run: () => router.push('/teams'),
      },
      {
        id: 'nav.backlog',
        label: 'Go to Backlog',
        icon: LayoutDashboard,
        shortcut: 'g b',
        group: 'Navigate',
        run: () => router.push('/board?status=TODO'),
      },
    ]

    const actions: Row[] = shortcuts
      .filter((s) => !s.hidden && s.id !== 'palette.open' && !s.keys.startsWith('g '))
      .map((s) => ({
        id: `cmd.${s.id}`,
        label: s.description,
        icon: CornerDownLeft,
        shortcut: s.keys,
        group: s.group,
        run: () => s.run(new KeyboardEvent('keydown')),
      }))

    return [...nav, ...actions]
  }, [router, shortcuts])

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) {
      setResults([])
      setSearching(false)
      return
    }

    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(q)
        const [tickets, projects, teams] = await Promise.all([
          fetch(`/api/tickets?limit=5&depth=0&where[title][like]=${encoded}`, {
            signal: controller.signal,
          }).then((r) => r.json()),
          fetch(`/api/projects?limit=5&where[name][like]=${encoded}`, {
            signal: controller.signal,
          }).then((r) => r.json()),
          fetch(`/api/teams?limit=5&where[name][like]=${encoded}`, {
            signal: controller.signal,
          }).then((r) => r.json()),
        ])

        const rows: Row[] = [
          ...(tickets.docs ?? []).map((t: SearchDoc) => ({
            id: `ticket.${t.id}`,
            label: t.title ?? 'Untitled',
            sublabel: t.ticketId ?? undefined,
            icon: Ticket,
            group: 'Tickets',
            run: () => router.push(`/board?ticket=${t.id}`),
          })),
          ...(projects.docs ?? []).map((p: SearchDoc) => ({
            id: `project.${p.id}`,
            label: p.name ?? 'Untitled',
            sublabel: p.prefix,
            icon: FolderKanban,
            group: 'Projects',
            run: () => router.push(`/projects/${p.id}`),
          })),
          ...(teams.docs ?? []).map((t: SearchDoc) => ({
            id: `team.${t.id}`,
            label: t.name ?? 'Untitled',
            icon: Users,
            group: 'Teams',
            run: () => router.push(`/teams/${t.id}`),
          })),
        ]
        setResults(rows)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults([])
      } finally {
        setSearching(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, router])

  const rows = useMemo(() => [...filteredCommands, ...results], [filteredCommands, results])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    listRef.current
      ?.querySelectorAll<HTMLElement>('[role="option"]')
      [active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (row: Row | undefined) => {
    if (!row) return
    onOpenChange(false)
    row.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(rows[active])
    }
  }

  let lastGroup = ''

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Command palette"
      size="lg"
      initialFocus="first-field"
      className="max-h-[70vh]"
    >
      <div onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
          <input
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={rows[active] ? `palette-row-${rows[active].id}` : undefined}
            aria-label="Search commands, tickets, projects and teams"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search…"
            className="h-10 min-w-0 flex-1 bg-transparent text-md text-text outline-none"
            autoComplete="off"
          />
        </div>

        <div
          id="palette-list"
          role="listbox"
          aria-label="Results"
          ref={listRef}
          className="mt-3 max-h-[46vh] overflow-y-auto"
        >
          {searching && rows.length === 0 && (
            <div className="flex flex-col gap-2 py-2" aria-hidden>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          )}

          {!searching && rows.length === 0 && (
            <p className="px-2 py-8 text-center text-base text-text-muted">
              {query.trim().length > 0 && query.trim().length < MIN_QUERY
                ? `Type at least ${MIN_QUERY} characters to search records.`
                : 'Nothing matched.'}
            </p>
          )}

          {rows.map((row, index) => {
            const Icon = row.icon
            const showGroup = row.group !== lastGroup
            lastGroup = row.group
            return (
              <div key={row.id}>
                {showGroup && (
                  <div className="px-2 pb-1 pt-3 text-2xs font-medium uppercase tracking-wide text-text-muted">
                    {row.group}
                  </div>
                )}
                <div
                  id={`palette-row-${row.id}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => choose(row)}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    'flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-base',
                    index === active ? 'bg-surface-hover text-text' : 'text-text-muted',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-text">
                    <Highlight text={row.label} query={query.trim()} />
                  </span>
                  {row.sublabel && <span className="shrink-0 text-xs tabular">{row.sublabel}</span>}
                  {row.shortcut && (
                    <kbd className="shrink-0 font-sans text-xs text-text-muted">
                      {formatKeys(row.shortcut)}
                    </kbd>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}
