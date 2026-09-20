'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu as MenuIcon, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/shortcuts'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Kbd'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { NAV_ITEMS, Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { CommandPalette } from './CommandPalette'
import { ShortcutHelp } from './ShortcutHelp'
import { OfflineBanner } from './OfflineBanner'

const COLLAPSED_KEY = 'local-pm:sidebar-collapsed'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1')
    } catch {}
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {}
      return next
    })
  }

  useEffect(() => setDrawerOpen(false), [pathname])

  useShortcut({
    id: 'shell.toggleSidebar',
    keys: 'mod+backslash',
    description: 'Toggle the sidebar',
    group: 'Global',
    scope: 'global',
    allowInInput: true,
    run: toggleCollapsed,
  })

  useShortcut({
    id: 'nav.board',
    keys: 'g v',
    description: 'Go to Board',
    group: 'Navigate',
    scope: 'global',
    run: () => router.push('/board'),
  })
  useShortcut({
    id: 'nav.projects',
    keys: 'g p',
    description: 'Go to Projects',
    group: 'Navigate',
    scope: 'global',
    run: () => router.push('/projects'),
  })
  useShortcut({
    id: 'nav.teams',
    keys: 'g t',
    description: 'Go to Teams',
    group: 'Navigate',
    scope: 'global',
    run: () => router.push('/teams'),
  })
  useShortcut({
    id: 'nav.backlog',
    keys: 'g b',
    description: 'Go to Backlog (Todo column)',
    group: 'Navigate',
    scope: 'global',
    run: () => router.push('/board?status=TODO'),
  })

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <a href="#main" className="sr-only-focusable">
        Skip to main content
      </a>

      <OfflineBanner />

      <div className="flex min-h-0 flex-1">

        <div className="max-md:hidden">
          <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-scrim animate-fade-in"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div className="relative h-full w-64 animate-panel-in">
              <Sidebar collapsed={false} onToggleCollapsed={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 flex-none items-center gap-2 border-b border-border-subtle bg-bg px-3">
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={MenuIcon}
              aria-label="Open navigation"
              onClick={() => setDrawerOpen(true)}
              className="md:hidden"
            />

            <PaletteTrigger onClick={() => setPaletteOpen(true)} />

            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
            </div>
          </header>

          <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-hidden max-md:pb-14">
            <ErrorBoundary region="This page">{children}</ErrorBoundary>
          </main>
        </div>
      </div>

      <MobileNav />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutHelp />
    </div>
  )
}

function PaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full max-w-80 items-center gap-2 rounded-sm border border-border bg-surface px-2.5',
        'text-base text-text-muted transition-colors duration-micro ease-standard',
        'hover:border-border-strong hover:bg-surface-hover',
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="truncate">Search or jump to…</span>
      <Kbd keys="mod+k" className="ml-auto max-sm:hidden" />
    </button>
  )
}

function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 border-t border-border-subtle bg-bg-subtle pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-2xs',
              active ? 'font-medium text-accent-text' : 'text-text-muted',
            )}
          >
            <Icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
