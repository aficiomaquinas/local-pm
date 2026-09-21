'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Menu } from '@/components/ui/Menu'
import { Button } from '@/components/ui/Button'
import { applyTheme, readTheme, type ThemePreference } from '@/lib/theme'

const ICON = { light: Sun, dark: Moon, system: Monitor } as const
const LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>('system')

  useEffect(() => setPref(readTheme()), [])

  const choose = (next: ThemePreference) => {
    setPref(next)
    applyTheme(next)
  }

  const Icon = ICON[pref]

  return (
    <Menu
      label="Theme"
      items={(['light', 'dark', 'system'] as const).map((value) => ({
        id: value,
        label: LABEL[value],
        icon: ICON[value],
        checked: pref === value,
        onSelect: () => choose(value),
      }))}
      trigger={
        <Button
          variant="ghost"
          size="md"
          iconOnly
          icon={Icon}
          aria-label={`Theme: ${LABEL[pref]}. Change theme`}
        />
      }
    />
  )
}
