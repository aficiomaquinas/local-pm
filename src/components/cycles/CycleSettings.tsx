'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat } from 'lucide-react'
import {
  CycleAutomation,
  CycleRollover,
  CYCLE_AUTOMATION_OPTIONS,
  CYCLE_LENGTH_OPTIONS,
  CYCLE_ROLLOVER_OPTIONS,
  CYCLE_START_DAY_OPTIONS,
} from '@/types/enums'
import {
  DEFAULT_CYCLE_LENGTH_WEEKS,
  DEFAULT_CYCLE_START_DAY,
  DEFAULT_UPCOMING_CYCLES,
  MAX_UPCOMING_CYCLES,
} from '@/lib/cycles'
import { useOptimisticPatch, saveStateLabel } from '@/hooks/useOptimisticPatch'
import { Button, LinkButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import type { Project } from '@/payload-types'

interface CycleConfig {
  enabled: boolean
  lengthWeeks: number
  startDay: number
  rollover: CycleRollover
  automation: CycleAutomation
  upcomingCount: number
}

const UPCOMING_OPTIONS = Array.from({ length: MAX_UPCOMING_CYCLES + 1 }, (_, value) => ({
  value: String(value),
  label: value === 1 ? '1 cycle ahead' : `${value} cycles ahead`,
}))

function configOf(project: Project): CycleConfig {
  const raw = project.cycles ?? {}
  return {
    enabled: Boolean(raw.enabled),
    lengthWeeks: raw.lengthWeeks ?? DEFAULT_CYCLE_LENGTH_WEEKS,
    startDay: raw.startDay ?? DEFAULT_CYCLE_START_DAY,
    rollover: (raw.rollover as CycleRollover | null) ?? CycleRollover.NEXT,
    automation: (raw.automation as CycleAutomation | null) ?? CycleAutomation.AUTOMATIC,
    upcomingCount: raw.upcomingCount ?? DEFAULT_UPCOMING_CYCLES,
  }
}

export function CycleSettings({ project: initialProject }: { project: Project }) {
  const router = useRouter()
  const { toast } = useToast()
  const [project, setProject] = useState(initialProject)
  const [provisioning, setProvisioning] = useState(false)

  const apply = useCallback((next: Project) => setProject(next), [])
  const { patch, state } = useOptimisticPatch<Project>({
    collection: 'projects',
    record: project,
    onApply: apply,
  })

  const config = configOf(project)
  const savingLabel = saveStateLabel(state)

  const update = async (changes: Partial<CycleConfig>, label: string) => {
    const next = { ...config, ...changes }
    const saved = await patch({ cycles: next }, label)
    if (saved && next.enabled) await reconcile()
  }

  const reconcile = async () => {
    setProvisioning(true)
    try {
      const response = await fetch('/api/cycles/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: project.id }),
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      router.refresh()
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't set up the cycles",
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setProvisioning(false)
    }
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update({ enabled: e.target.checked }, 'the cycle setting')}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <span className="flex flex-col gap-1">
            <span className="text-base font-medium text-text">Run cycles on this project</span>
            <span className="text-sm text-text-muted">
              Cycles are fixed time boxes. The active cycle and the next few are created for you, and
              unfinished work moves on when a cycle ends.
            </span>
          </span>
        </label>

        {savingLabel && (
          <p
            aria-live="polite"
            className={`text-xs ${state === 'error' ? 'text-danger-text' : 'text-text-muted'}`}
          >
            {savingLabel}
          </p>
        )}
      </div>

      {config.enabled && (
        <>
          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <Field
              label="Cycle length"
              hint="Applies to cycles created from now on. Existing cycles keep their dates."
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={String(config.lengthWeeks)}
                  options={CYCLE_LENGTH_OPTIONS.map((o) => ({
                    value: String(o.value),
                    label: o.label,
                  }))}
                  onValueChange={(next) => update({ lengthWeeks: Number(next) }, 'the cycle length')}
                />
              )}
            </Field>

            <Field label="Cycles start on" hint="Only used to place the very first cycle.">
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={String(config.startDay)}
                  options={CYCLE_START_DAY_OPTIONS.map((o) => ({
                    value: String(o.value),
                    label: o.label,
                  }))}
                  onValueChange={(next) => update({ startDay: Number(next) }, 'the start day')}
                />
              )}
            </Field>

            <Field
              label="Unfinished work"
              hint="What happens to tickets that are still open when a cycle closes."
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={config.rollover}
                  options={CYCLE_ROLLOVER_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                  onValueChange={(next) =>
                    update({ rollover: next as CycleRollover }, 'the rollover setting')
                  }
                />
              )}
            </Field>

            <Field
              label="Closing a cycle"
              hint="Automatic closes elapsed cycles on the server every hour, whether or not anyone is using the app."
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={config.automation}
                  options={CYCLE_AUTOMATION_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                  onValueChange={(next) =>
                    update({ automation: next as CycleAutomation }, 'the automation setting')
                  }
                />
              )}
            </Field>

            <Field label="Keep provisioned" hint="How many future cycles exist ahead of the active one.">
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={String(config.upcomingCount)}
                  options={UPCOMING_OPTIONS}
                  onValueChange={(next) =>
                    update({ upcomingCount: Number(next) }, 'the number of upcoming cycles')
                  }
                />
              )}
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
            <LinkButton variant="secondary" icon={Repeat} href={`/cycles?project=${project.id}`}>
              View cycles
            </LinkButton>
            <Button variant="ghost" onClick={reconcile} loading={provisioning}>
              Check for missing cycles
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
