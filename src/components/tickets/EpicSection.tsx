'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Layers, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { epicIdOf, epicRefOf } from '@/lib/epic'
import { useEpicChildren } from '@/hooks/useEpicChildren'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { TicketKey } from '@/components/ui/EntityMark'
import { TicketSelect } from '@/components/ui/EntityPickers'
import { Tooltip } from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'
import { EpicChildren } from './EpicChildren'
import { Section } from './TicketSection'
import type { Ticket } from '@/payload-types'

type PatchTicket = (changes: Partial<Ticket>, label: string) => Promise<boolean>

export function EpicSection({ ticket, patch }: { ticket: Ticket; patch: PatchTicket }) {
  const { toast } = useToast()
  const isEpic = Boolean(ticket.isEpic)
  const projectId = typeof ticket.project === 'string' ? ticket.project : (ticket.project?.id ?? null)
  const parent = epicRefOf(ticket)
  const parentId = epicIdOf(ticket)

  const { children, loading, error, refresh } = useEpicChildren(ticket.id, isEpic)
  const [busy, setBusy] = useState(false)

  const setChildEpic = useCallback(
    async (child: Pick<Ticket, 'id' | 'title' | 'ticketId'>, epicId: string | null) => {
      try {
        const response = await fetch(`/api/tickets/${child.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ epic: epicId }),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.errors?.[0]?.message || `${response.status} ${response.statusText}`)
        }
        return true
      } catch (err) {
        toast({
          tone: 'error',
          title: `Couldn't ${epicId ? 'add' : 'remove'} ${child.ticketId ?? 'that ticket'}`,
          description: err instanceof Error ? err.message : undefined,
        })
        return false
      } finally {
        refresh()
      }
    },
    [refresh, toast],
  )

  const addChild = useCallback(
    async (childId: string) => {
      setBusy(true)
      await setChildEpic({ id: childId, title: '', ticketId: null }, ticket.id)
      setBusy(false)
    },
    [setChildEpic, ticket.id],
  )

  const removeChild = useCallback(
    async (child: Ticket) => {
      setBusy(true)
      const ok = await setChildEpic(child, null)
      setBusy(false)
      if (!ok) return
      toast({
        title: `${child.ticketId ?? child.title} removed from this epic`,
        onUndo: () => void setChildEpic(child, ticket.id),
      })
    },
    [setChildEpic, ticket.id, toast],
  )

  return (
    <Section
      title={isEpic ? 'Epic' : 'Part of an epic'}
      icon={Layers}
      action={
        isEpic ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void patch({ isEpic: false } as Partial<Ticket>, 'the epic flag')}
          >
            Stop being an epic
          </Button>
        ) : parentId ? null : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void patch({ isEpic: true } as Partial<Ticket>, 'the epic flag')}
          >
            Make this an epic
          </Button>
        )
      }
    >
      {isEpic ? (
        <EpicChildren
          epicId={ticket.id}
          projectId={projectId}
          tickets={children}
          loading={loading}
          error={error}
          onAdd={(id) => void addChild(id)}
          onRemove={(child) => void removeChild(child)}
          onRetry={refresh}
        />
      ) : (
        <>
          {parentId ? (
            <div
              className={cn(
                'group flex items-center gap-2 rounded-md border border-border-subtle bg-surface px-2 py-1.5',
                'transition-colors duration-micro ease-standard can-hover:hover:bg-surface-hover',
              )}
            >
              <TicketKey value={parent?.ticketId} />
              <Link
                href={`/tickets/${parentId}`}
                title={parent?.title ?? undefined}
                className="min-w-0 flex-1 truncate rounded-sm text-base text-text hover:underline"
              >
                {parent?.title ?? 'Open this epic'}
              </Link>
              <Tooltip content="Take this ticket out of its epic" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  icon={X}
                  aria-label="Take this ticket out of its epic"
                  onClick={() => void patch({ epic: null } as Partial<Ticket>, 'the epic')}
                  className="text-text-muted"
                />
              </Tooltip>
            </div>
          ) : (
            <p className="text-base text-text-muted">
              This ticket does not roll up into an epic.
            </p>
          )}

          <Field
            label={parentId ? 'Move to another epic' : 'Roll this ticket up into an epic'}
            optional
          >
            {({ id }) => (
              <TicketSelect
                id={id}
                value=""
                selected={null}
                aria-label="Roll this ticket up into an epic"
                placeholder="Search for an epic…"
                where={{ project: projectId, isEpic: 'true' }}
                onChange={(next) => {
                  if (!next || next === ticket.id || next === parentId) return
                  void patch({ epic: next } as Partial<Ticket>, 'the epic')
                }}
              />
            )}
          </Field>
        </>
      )}
    </Section>
  )
}
