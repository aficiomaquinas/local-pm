'use client'

import { useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { formatKeys, useShortcut, useShortcutRegistry } from '@/lib/shortcuts'

export function ShortcutHelp() {
  const [open, setOpen] = useState(false)
  const { shortcuts } = useShortcutRegistry()

  useShortcut({
    id: 'help.shortcuts',
    keys: '?',
    description: 'Show keyboard shortcuts for this view',
    group: 'Global',
    scope: 'global',
    run: () => setOpen((o) => !o),
  })

  const groups = useMemo(() => {
    const byGroup = new Map<string, { keys: string; description: string }[]>()
    for (const s of shortcuts) {
      if (s.hidden) continue
      const list = byGroup.get(s.group) ?? []
      list.push({ keys: s.keys, description: s.description })
      byGroup.set(s.group, list)
    }
    return Array.from(byGroup.entries()).sort(([a], [b]) =>
      a === 'Global' ? -1 : b === 'Global' ? 1 : a.localeCompare(b),
    )
  }, [shortcuts])

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="Everything bound in this view, right now."
      size="lg"
      initialFocus="heading"
    >
      {groups.length === 0 ? (
        <p className="text-base text-text-muted">No shortcuts are active in this view.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map(([group, items]) => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                {group}
              </h3>
              <dl className="flex flex-col">
                {items.map((item) => (
                  <div
                    key={item.keys + item.description}
                    className="flex h-8 items-center justify-between gap-4 border-b border-border-subtle last:border-b-0"
                  >
                    <dt className="min-w-0 truncate text-base text-text">{item.description}</dt>
                    <dd>
                      <kbd className="rounded-xs border border-border-subtle bg-surface px-1.5 py-0.5 font-sans text-xs text-text-muted">
                        {formatKeys(item.keys)}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  )
}
