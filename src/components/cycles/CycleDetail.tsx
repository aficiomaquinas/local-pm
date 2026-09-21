'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, LayoutDashboard } from 'lucide-react'
import { formatDateRange } from '@/lib/format'
import { CYCLE_STATE_META, cycleState, cycleTiming } from '@/lib/cycle-display'
import type { CycleProgress } from '@/lib/cycles'
import { useOptimisticPatch, saveStateLabel } from '@/hooks/useOptimisticPatch'
import { Badge } from '@/components/ui/Badge'
import { Button, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { useToast } from '@/components/ui/Toast'
import { TicketsTable } from '@/components/tickets/TicketsTable'
import { CycleProgressBar } from './CycleProgressBar'
import type { Cycle, Project } from '@/payload-types'

export function CycleDetail({
  cycle: initialCycle,
  project,
  progress,
  closable,
}: {
  cycle: Cycle
  project: Project
  progress: CycleProgress
  closable: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [cycle, setCycle] = useState(initialCycle)
  const [confirmClose, setConfirmClose] = useState(false)
  const [busy, setBusy] = useState(false)
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
  }, [])

  const apply = useCallback((next: Cycle) => setCycle(next), [])
  const { patch, state } = useOptimisticPatch<Cycle>({
    collection: 'cycles',
    record: cycle,
    onApply: apply,
  })

  const savingLabel = saveStateLabel(state)
  const current = cycleState(cycle, today ?? undefined)
  const meta = CYCLE_STATE_META[current]

  const closeCycle = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/cycles/${cycle.id}/close`, { method: 'POST' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const body = (await response.json()) as { report?: { rolledOver?: number } }
      const moved = body.report?.rolledOver ?? 0

      toast({
        tone: 'success',
        title: `${cycle.name} closed`,
        description:
          moved > 0
            ? `${moved} unfinished ${moved === 1 ? 'ticket' : 'tickets'} moved on.`
            : 'Nothing was left unfinished.',
      })
      setConfirmClose(false)
      router.refresh()
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't close that cycle",
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-border-subtle px-6 pt-4 max-md:px-4">
        <nav aria-label="Breadcrumb">
          <Link
            href={`/cycles?project=${project.id}`}
            className="inline-flex items-center gap-1.5 rounded-sm text-xs text-text-muted transition-colors duration-micro hover:text-text"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Cycles in {project.name}
          </Link>
        </nav>

        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-text">
              <InlineEdit
                label="Cycle name"
                value={cycle.name}
                validate={(next) => (next ? null : 'A name is required.')}
                onCommit={(next) => patch({ name: next }, 'the name')}
              />
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <Badge tone={meta.tone} icon={meta.icon}>
                {meta.label}
              </Badge>
              <span className="tabular">{formatDateRange(cycle.startsAt, cycle.endsAt)}</span>
              {today && (
                <>
                  <span aria-hidden>·</span>
                  <span>{cycleTiming(cycle, today)}</span>
                </>
              )}
              {savingLabel && (
                <>
                  <span aria-hidden>·</span>
                  <span
                    aria-live="polite"
                    className={state === 'error' ? 'text-danger-text' : undefined}
                  >
                    {savingLabel}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <LinkButton
              variant="secondary"
              icon={LayoutDashboard}
              href={`/board?project=${project.id}&cycle=${cycle.id}`}
            >
              Board
            </LinkButton>
            {closable && current !== 'completed' && (
              <Button variant="secondary" icon={CheckCircle2} onClick={() => setConfirmClose(true)}>
                Close cycle
              </Button>
            )}
          </div>
        </div>

        <div className="pb-3">
          <InlineEdit
            label="Cycle goal"
            value={cycle.goal ?? ''}
            placeholder="Add a goal for this cycle"
            onCommit={(next) => patch({ goal: next || null }, 'the goal')}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 max-md:px-4">
        <div className="mb-6 max-w-md">
          <CycleProgressBar progress={progress} label={`${cycle.name} progress`} />
        </div>

        <TicketsTable
          where={{ cycle: cycle.id }}
          caption={`Tickets in ${cycle.name}`}
          keyColor={project.color}
          relationColumn="team"
          newTicketHref={`/tickets/new?project=${project.id}&cycle=${cycle.id}&returnTo=${encodeURIComponent(
            `/cycles/${cycle.id}`,
          )}`}
          emptyTitle="Nothing committed to this cycle"
          emptyDescription="Add tickets from the board or the ticket form and they show up here."
        />
      </div>

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={closeCycle}
        loading={busy}
        title="Close this cycle?"
        message={`“${cycle.name}”`}
        consequence="Unfinished tickets move on according to this project's rollover setting. The cycle stays readable afterwards."
        confirmLabel="Close cycle"
      />
    </div>
  )
}
