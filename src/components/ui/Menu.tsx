'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Kbd } from './Kbd'
import { TONE_TEXT, type StateIcon, type Tone } from '@/lib/status'

export interface MenuItem {
  id: string
  label: string
  icon?: StateIcon
  tone?: Tone
  shortcut?: string
  destructive?: boolean
  disabled?: boolean
  checked?: boolean
  separatorBefore?: boolean
  groupLabel?: string
  onSelect: () => void
}

export interface MenuProps {
  items: MenuItem[]
  trigger: React.ReactNode
  label: string
  align?: 'start' | 'end'
}

export function Menu({ items, trigger, label, align = 'end' }: MenuProps) {
  const selectable = items.some((item) => item.checked !== undefined)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          aria-label={label}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            'z-60 min-w-[180px] max-w-[320px] overflow-hidden rounded-lg',
            'border border-border-subtle bg-overlay p-1 shadow-e2',
            'max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto',
            'animate-fade-in',
          )}
        >
          {items.map((item, index) => {
            const Icon = item.icon
            return (
              <div key={item.id}>
                {item.separatorBefore && index > 0 && (
                  <DropdownMenu.Separator className="my-1 h-px bg-border-subtle" />
                )}
                {item.groupLabel && (
                  <DropdownMenu.Label className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-text-muted">
                    {item.groupLabel}
                  </DropdownMenu.Label>
                )}
                <DropdownMenu.Item
                  disabled={item.disabled}
                  onSelect={item.onSelect}
                  className={cn(
                    'flex h-8 cursor-pointer select-none items-center gap-2 rounded-sm px-2',
                    'text-base outline-none',
                    'data-[highlighted]:bg-surface-hover',
                    'data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled',
                    item.destructive ? 'text-danger-text' : 'text-text',
                  )}
                >
                  {selectable && (
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {item.checked && <Check className="size-4 text-accent-text" aria-hidden />}
                    </span>
                  )}
                  {Icon && (
                    <Icon
                      aria-hidden
                      className={cn(
                        'size-4 shrink-0',
                        item.destructive
                          ? 'text-danger-text'
                          : item.tone
                            ? TONE_TEXT[item.tone]
                            : 'text-text-muted',
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate" title={item.label}>
                    {item.label}
                  </span>
                  {item.shortcut && <Kbd keys={item.shortcut} />}
                </DropdownMenu.Item>
              </div>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
