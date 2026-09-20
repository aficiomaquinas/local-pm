'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, LayoutDashboard, ListChecks, Trash2, Users } from 'lucide-react'
import { TicketStatus } from '@/types/enums'
import { useOptimisticPatch, saveStateLabel } from '@/hooks/useOptimisticPatch'
import { Button, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EntityMark } from '@/components/ui/EntityMark'
import { Expandable } from '@/components/ui/Expandable'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { StatusTypeBadge } from '@/components/ui/StateIndicator'
import { StatusType } from '@/types/enums'
import { TabList, TabPanel } from '@/components/ui/Tabs'
import { formatDateTimeRelative } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { RichTextDisplay, RichTextEditor } from '@/components/ui/RichTextEditor'
import { TicketsTable } from '@/components/tickets/TicketsTable'
import { Avatar } from '@/components/ui/Avatar'
import type { Member, Team } from '@/payload-types'

export interface TeamStats {
  total: number
  todo: number
  inProgress: number
  done: number
}

const TAB_IDS = ['overview', 'tickets'] as const
type TabId = (typeof TAB_IDS)[number]

export function TeamDetail({
  team: initialTeam,
  stats,
  members,
  initialTab = 'overview',
}: {
  team: Team
  stats: TeamStats
  members: Member[]
  initialTab?: TabId
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [team, setTeam] = useState(initialTeam)
  const [tab, setTab] = useState<TabId>(initialTab)

  const apply = useCallback((next: Team) => setTeam(next), [])
  const { patch, state } = useOptimisticPatch<Team>({
    collection: 'teams',
    record: team,
    onApply: apply,
  })

  const [editingDescription, setEditingDescription] = useState(false)
  const [draftDescription, setDraftDescription] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const description = (team.description as unknown as string) || ''
  const savingLabel = saveStateLabel(state)

  const selectTab = (next: string) => {
    setTab(next as TabId)
    window.history.pushState(
      null,
      '',
      next === 'overview' ? window.location.pathname : `?tab=${next}`,
    )
  }

  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(window.location.search).get('tab')
      setTab(TAB_IDS.includes(next as TabId) ? (next as TabId) : 'overview')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const saveDescription = async () => {
    setSavingDescription(true)
    const ok = await patch(
      { description: (draftDescription || null) as Team['description'] },
      'the description',
    )
    setSavingDescription(false)
    if (ok) setEditingDescription(false)
  }

  const deleteTeam = async () => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      toast({ title: `${team.name} deleted`, tone: 'info' })
      router.push('/teams')
      router.refresh()
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't delete that team",
        description: error instanceof Error ? error.message : undefined,
      })
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-border-subtle px-6 pt-4 max-md:px-4">
        <nav aria-label="Breadcrumb">
          <Link
            href="/teams"
            className="inline-flex items-center gap-1.5 rounded-sm text-xs text-text-muted transition-colors duration-micro hover:text-text"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Teams
          </Link>
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <EntityMark icon={Users} color={team.color} size="lg" />

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-text">
              <InlineEdit
                label="Team name"
                value={team.name}
                validate={(next) => (next ? null : 'A name is required.')}
                onCommit={(next) => patch({ name: next }, 'the name')}
              />
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="tabular">
                {stats.total} assigned {stats.total === 1 ? 'ticket' : 'tickets'}
              </span>
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
            <LinkButton variant="secondary" icon={LayoutDashboard} href={`/board?team=${team.id}`}>
              Board
            </LinkButton>
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        </div>

        <TabList
          label="Team sections"
          idPrefix="team"
          value={tab}
          onChange={selectTab}
          tabs={[
            { id: 'overview', label: 'Overview', icon: FileText },
            { id: 'tickets', label: 'Tickets', icon: ListChecks, count: stats.total },
          ]}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 max-md:px-4">
        <TabPanel id="overview" idPrefix="team" active={tab === 'overview'}>
          <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-8 max-lg:grid-cols-1">
            <section className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Description
                </h2>
                <div className="ml-auto flex gap-2">
                  {editingDescription ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingDescription(false)}
                        disabled={savingDescription}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        loading={savingDescription}
                        onClick={saveDescription}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDraftDescription(description)
                        setEditingDescription(true)
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              {editingDescription ? (
                <div
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      void saveDescription()
                    }
                  }}
                >
                  <RichTextEditor
                    value={draftDescription}
                    onChange={setDraftDescription}
                    placeholder="Responsibilities, areas of ownership…"
                  />
                  <p className="mt-2 text-xs text-text-muted">⌘/Ctrl + Enter saves.</p>
                </div>
              ) : (
                <Expandable lines={10}>
                  <RichTextDisplay content={description} wide />
                </Expandable>
              )}
            </section>

            <aside className="flex flex-col gap-6">
              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Members
                </h2>
                {members.length === 0 ? (
                  <p className="text-base text-text-muted">
                    Nobody is on this team yet. Set a person&rsquo;s team to add them.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {members.map((member) => (
                      <li
                        key={member.id}
                        className="flex h-9 items-center gap-2 border-b border-border-subtle last:border-b-0"
                      >
                        <Avatar name={member.name} seed={member.id} size="md" decorative />
                        <span className="min-w-0 flex-1 truncate text-base text-text" title={member.name}>
                          {member.name}
                        </span>
                        {!member.active && (
                          <span className="shrink-0 text-xs text-text-muted">Inactive</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Workload
                </h2>
                <dl className="flex flex-col">
                  {(
                    [
                      ['Todo', stats.todo, StatusType.UNSTARTED],
                      ['In progress', stats.inProgress, StatusType.STARTED],
                      ['Done', stats.done, StatusType.COMPLETED],
                    ] as const
                  ).map(([label, value, type]) => (
                    <div
                      key={label}
                      className="flex h-9 items-center justify-between gap-2 border-b border-border-subtle last:border-b-0"
                    >
                      <dt>
                        <StatusTypeBadge type={type} label={label} />
                      </dt>
                      <dd className="text-base text-text tabular">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <dl className="flex flex-col gap-2 border-t border-border-subtle pt-4 text-xs text-text-muted">
                <div className="flex justify-between gap-2">
                  <dt>Created</dt>
                  <dd className="text-text tabular">{formatDateTimeRelative(team.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Updated</dt>
                  <dd className="text-text tabular">{formatDateTimeRelative(team.updatedAt)}</dd>
                </div>
              </dl>
            </aside>
          </div>
        </TabPanel>

        <TabPanel id="tickets" idPrefix="team" active={tab === 'tickets'}>
          <TicketsTable
            where={{ team: team.id }}
            caption={`Tickets assigned to ${team.name}`}
            relationColumn="project"
            emptyTitle="No tickets assigned"
            emptyDescription="Assign this team on a ticket and it will show up here."
          />
        </TabPanel>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteTeam}
        loading={deleting}
        title="Delete this team?"
        message={`“${team.name}”`}
        consequence={
          stats.total > 0
            ? `${stats.total} ticket${stats.total === 1 ? '' : 's'} will lose their team. The tickets themselves are kept. This cannot be undone.`
            : 'This team has no tickets assigned. This cannot be undone.'
        }
        confirmLabel="Delete team"
      />
    </div>
  )
}
