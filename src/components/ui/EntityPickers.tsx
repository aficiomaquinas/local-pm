'use client'

import { useCallback } from 'react'
import { FolderKanban, Users } from 'lucide-react'
import { EntitySelect, type EntityOption } from './EntitySelect'
import { projectIcon } from './EntityMark'
import { statusMeta } from '@/lib/status'
import type { Member, Project, Team, Ticket } from '@/payload-types'

const PROJECT_SORTS = [
  { value: 'name', label: 'A–Z' },
  { value: '-name', label: 'Z–A' },
  { value: '-createdAt', label: 'Newest' },
]

const TEAM_SORTS = [
  { value: 'name', label: 'A–Z' },
  { value: '-name', label: 'Z–A' },
  { value: '-createdAt', label: 'Newest' },
]

const MEMBER_SORTS = [
  { value: 'name', label: 'A–Z' },
  { value: '-name', label: 'Z–A' },
  { value: '-createdAt', label: 'Newest' },
]

const TICKET_SORTS = [
  { value: '-createdAt', label: 'Newest' },
  { value: 'title', label: 'A–Z' },
  { value: 'ticketId', label: 'Key' },
]

export function projectOption(project: Project): EntityOption {
  return {
    value: project.id,
    label: project.name,
    hint: project.prefix,
    icon: projectIcon(project.icon),
    swatch: project.color,
  }
}

export function teamOption(team: Team): EntityOption {
  return { value: team.id, label: team.name, icon: Users, swatch: team.color }
}

export function memberOption(member: Member): EntityOption {
  return {
    value: member.id,
    label: member.name,
    avatar: { name: member.name, seed: member.id },
  }
}

export const NO_ASSIGNEE_OPTION: EntityOption = {
  value: '',
  label: 'No assignee',
  avatar: { name: null },
}

export function ticketOption(ticket: Ticket): EntityOption {
  const meta = statusMeta(ticket.status)
  return {
    value: ticket.id,
    label: ticket.title,
    hint: ticket.ticketId ?? undefined,
    icon: meta.icon,
    tone: meta.tone,
  }
}

type SharedProps = {
  id?: string
  value: string
  disabled?: boolean
  invalid?: boolean
  required?: boolean
  className?: string
  placeholder?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

export function ProjectSelect({
  onChange,
  selected,
  allLabel,
  ...props
}: SharedProps & {
  onChange: (value: string, project: Project | null) => void
  selected?: Project | null
  allLabel?: string
}) {
  const toOption = useCallback(projectOption, [])
  return (
    <EntitySelect<Project>
      collection="projects"
      searchField="name"
      sortOptions={PROJECT_SORTS}
      toOption={toOption}
      onChange={onChange}
      selectedOption={selected !== undefined ? (selected ? projectOption(selected) : null) : undefined}
      emptyOption={allLabel ? { value: '', label: allLabel, icon: FolderKanban } : undefined}
      searchPlaceholder="Search projects"
      placeholder={props.placeholder ?? 'Select a project'}
      {...props}
    />
  )
}

export function TeamSelect({
  onChange,
  selected,
  allLabel,
  ...props
}: SharedProps & {
  onChange: (value: string, team: Team | null) => void
  selected?: Team | null
  allLabel?: string
}) {
  const toOption = useCallback(teamOption, [])
  return (
    <EntitySelect<Team>
      collection="teams"
      searchField="name"
      sortOptions={TEAM_SORTS}
      toOption={toOption}
      onChange={onChange}
      selectedOption={selected !== undefined ? (selected ? teamOption(selected) : null) : undefined}
      emptyOption={allLabel ? { value: '', label: allLabel, icon: Users } : undefined}
      searchPlaceholder="Search teams"
      placeholder={props.placeholder ?? 'No team'}
      {...props}
    />
  )
}

export function MemberSelect({
  onChange,
  selected,
  allLabel,
  ...props
}: SharedProps & {
  onChange: (value: string, member: Member | null) => void
  selected?: Member | null
  allLabel?: string
}) {
  const toOption = useCallback(memberOption, [])
  return (
    <EntitySelect<Member>
      collection="members"
      searchField="name"
      sortOptions={MEMBER_SORTS}
      toOption={toOption}
      onChange={onChange}
      selectedOption={selected !== undefined ? (selected ? memberOption(selected) : null) : undefined}
      emptyOption={allLabel ? { ...NO_ASSIGNEE_OPTION, label: allLabel } : NO_ASSIGNEE_OPTION}
      where={{ active: 'true' }}
      searchPlaceholder="Search people"
      placeholder={props.placeholder ?? 'No assignee'}
      {...props}
    />
  )
}

export function TicketSelect({
  onChange,
  selected,
  where,
  ...props
}: SharedProps & {
  onChange: (value: string, ticket: Ticket | null) => void
  selected?: Ticket | null
  where?: Record<string, string | null | undefined>
}) {
  const toOption = useCallback(ticketOption, [])
  return (
    <EntitySelect<Ticket>
      collection="tickets"
      searchField="title"
      sortOptions={TICKET_SORTS}
      toOption={toOption}
      onChange={onChange}
      selectedOption={selected !== undefined ? (selected ? ticketOption(selected) : null) : undefined}
      where={where}
      searchPlaceholder="Search tickets"
      placeholder={props.placeholder ?? 'Select a ticket'}
      {...props}
    />
  )
}
