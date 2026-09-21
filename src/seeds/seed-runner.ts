import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { ProjectStatus, TicketStatus, TicketPriority } from '../types/enums'
import { ensureDefaultStatuses } from '../migrations/configurable-statuses'
import { LEGACY_STATUS_KEYS } from '../types/enums'

interface SeedProject {
  name: string
  prefix: string
  color: string
  icon: string
  status: ProjectStatus
}

interface SeedTeam {
  name: string
  description: string | null
  color: string
}

interface SeedMember {
  name: string
  email: string
  teamName: string
}

interface SeedTicket {
  title: string
  status: TicketStatus
  priority: TicketPriority
  projectPrefix: string
  teamName: string | null
  labels: { name: string; color: string }[]
  blockedByTitles?: string[]
}

const SEED_PROJECTS: SeedProject[] = [
  {
    name: 'Website Redesign',
    prefix: 'WEB',
    color: '#6366f1',
    icon: 'rocket',
    status: ProjectStatus.ACTIVE,
  },
  {
    name: 'Mobile App v2',
    prefix: 'APP',
    color: '#8b5cf6',
    icon: 'zap',
    status: ProjectStatus.ACTIVE,
  },
  {
    name: 'Backend API',
    prefix: 'API',
    color: '#22c55e',
    icon: 'database',
    status: ProjectStatus.ACTIVE,
  },
  {
    name: 'Marketing Campaign 2024',
    prefix: 'MKT',
    color: '#eab308',
    icon: 'flag',
    status: ProjectStatus.ACTIVE,
  },
  {
    name: 'Cloud Infrastructure',
    prefix: 'OPS',
    color: '#06b6d4',
    icon: 'layers',
    status: ProjectStatus.ACTIVE,
  },
  {
    name: 'Customer Support Portal',
    prefix: 'CSP',
    color: '#ec4899',
    icon: 'briefcase',
    status: ProjectStatus.ACTIVE,
  },
]

const SEED_TEAMS: SeedTeam[] = [
  {
    name: 'Frontend Engineering',
    description: 'Web and mobile client development',
    color: '#3b82f6',
  },
  {
    name: 'Backend Engineering',
    description: 'API and Database management',
    color: '#10b981',
  },
  {
    name: 'QA & Testing',
    description: 'Quality assurance and automated testing',
    color: '#f97316',
  },
  {
    name: 'Design',
    description: 'UI/UX and Brand design',
    color: '#ec4899',
  },
  {
    name: 'Product Management',
    description: 'Product strategy and roadmap',
    color: '#8b5cf6',
  },
  {
    name: 'Marketing',
    description: 'Growth and branding',
    color: '#f59e0b',
  },
  {
    name: 'DevOps',
    description: 'Infrastructure and CI/CD',
    color: '#06b6d4',
  },
  {
    name: 'Customer Success',
    description: 'Support and user happiness',
    color: '#14b8a6',
  },
]

interface SeedComment {
  ticketTitle: string
  authorName: string
  body: string
  replies?: { authorName: string; body: string }[]
  resolved?: boolean
}

const SEED_MEMBERS: SeedMember[] = [
  { name: 'Ada Okonkwo', email: 'ada@example.com', teamName: 'Frontend Engineering' },
  { name: 'Bruno Costa', email: 'bruno@example.com', teamName: 'Frontend Engineering' },
  { name: 'Chen Wei', email: 'chen@example.com', teamName: 'Backend Engineering' },
  { name: 'Dara Singh', email: 'dara@example.com', teamName: 'Backend Engineering' },
  { name: 'Elif Demir', email: 'elif@example.com', teamName: 'QA & Testing' },
  { name: 'Farid Haddad', email: 'farid@example.com', teamName: 'Design' },
  { name: 'Greta Lindqvist', email: 'greta@example.com', teamName: 'Product Management' },
  { name: 'Hassan Ali', email: 'hassan@example.com', teamName: 'Marketing' },
  { name: 'Ingrid Moreau', email: 'ingrid@example.com', teamName: 'DevOps' },
  { name: 'Jonas Bakker', email: 'jonas@example.com', teamName: 'Customer Success' },
]

const SEED_COMMENTS: SeedComment[] = [
  {
    ticketTitle: 'Implement responsive navigation',
    authorName: 'Ada Okonkwo',
    body: 'Do we collapse to a drawer or to a bottom bar below md? {{Farid Haddad}} the wireframes show both.',
    replies: [
      {
        authorName: 'Farid Haddad',
        body: 'Bottom bar for the primary sections, drawer for the overflow. Hidden nav measurably reduces use, so the four destinations people actually need stay visible.',
      },
      { authorName: 'Ada Okonkwo', body: 'Clear. Building it that way.' },
    ],
    resolved: true,
  },
  {
    ticketTitle: 'Implement responsive navigation',
    authorName: 'Elif Demir',
    body: 'Two things I will be checking when this lands:\n\n- every target is **44px** with 8px between neighbours\n- the whole thing reflows to one column at 320px\n\nShout before you call it done and I will run it early.',
  },
  {
    ticketTitle: 'Implement OAuth logic',
    authorName: 'Chen Wei',
    body: 'The refresh call has no timeout set, so a slow identity provider parks the request until the proxy gives up at 60s.',
    replies: [
      {
        authorName: 'Dara Singh',
        body: '{{Chen Wei}} set it to 10s and retry once? Past that the user has already reloaded.',
      },
    ],
  },
  {
    ticketTitle: 'Hero section implementation',
    authorName: 'Greta Lindqvist',
    body: 'Parked until the wireframes are signed off. See the blocker. {{Bruno Costa}} I will move this the moment they land.',
  },
]

const SEED_TICKETS: SeedTicket[] = [
  {
    title: 'Finalize new brand guidelines',
    status: TicketStatus.DONE,
    priority: TicketPriority.HIGH,
    projectPrefix: 'WEB',
    teamName: 'Design',
    labels: [{ name: 'design', color: '#ec4899' }],
  },
  {
    title: 'Design homepage wireframes',
    status: TicketStatus.DONE,
    priority: TicketPriority.HIGH,
    projectPrefix: 'WEB',
    teamName: 'Design',
    labels: [{ name: 'design', color: '#ec4899' }],
    blockedByTitles: ['Finalize new brand guidelines'],
  },
  {
    title: 'Implement responsive navigation',
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.MEDIUM,
    projectPrefix: 'WEB',
    teamName: 'Frontend Engineering',
    labels: [{ name: 'frontend', color: '#3b82f6' }],
    blockedByTitles: ['Design homepage wireframes'],
  },
  {
    title: 'Hero section implementation',
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    projectPrefix: 'WEB',
    teamName: 'Frontend Engineering',
    labels: [{ name: 'frontend', color: '#3b82f6' }],
    blockedByTitles: ['Design homepage wireframes'],
  },

  {
    title: 'Define API contract for Auth',
    status: TicketStatus.DONE,
    priority: TicketPriority.URGENT,
    projectPrefix: 'APP',
    teamName: 'Product Management',
    labels: [{ name: 'planning', color: '#64748b' }],
  },
  {
    title: 'Audit current React Native performance',
    status: TicketStatus.DONE,
    priority: TicketPriority.MEDIUM,
    projectPrefix: 'APP',
    teamName: 'QA & Testing',
    labels: [{ name: 'qa', color: '#f97316' }],
  },
  {
    title: 'Implement OAuth logic',
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.HIGH,
    projectPrefix: 'APP',
    teamName: 'Backend Engineering',
    labels: [{ name: 'auth', color: '#ef4444' }, { name: 'api', color: '#10b981' }],
    blockedByTitles: ['Define API contract for Auth'],
  },
  {
    title: 'Biometric authentication integration',
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    projectPrefix: 'APP',
    teamName: 'Frontend Engineering',
    labels: [{ name: 'mobile', color: '#8b5cf6' }],
    blockedByTitles: ['Implement OAuth logic'],
  },

  {
    title: 'Identify target audience for Q1',
    status: TicketStatus.DONE,
    priority: TicketPriority.HIGH,
    projectPrefix: 'MKT',
    teamName: 'Marketing',
    labels: [{ name: 'strategy', color: '#f59e0b' }],
  },
  {
    title: 'Create social media assets',
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.MEDIUM,
    projectPrefix: 'MKT',
    teamName: 'Design',
    labels: [{ name: 'design', color: '#ec4899' }],
    blockedByTitles: ['Identify target audience for Q1'],
  },
  {
    title: 'Setup ad campaigns on LinkedIn',
    status: TicketStatus.TODO,
    priority: TicketPriority.HIGH,
    projectPrefix: 'MKT',
    teamName: 'Marketing',
    labels: [{ name: 'ads', color: '#3b82f6' }],
    blockedByTitles: ['Create social media assets'],
  },

  {
    title: 'Migrate DB to new cluster',
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.URGENT,
    projectPrefix: 'OPS',
    teamName: 'DevOps',
    labels: [{ name: 'infrastructure', color: '#06b6d4' }],
  },
  {
    title: 'Optimize Docker build times',
    status: TicketStatus.TODO,
    priority: TicketPriority.LOW,
    projectPrefix: 'OPS',
    teamName: 'DevOps',
    labels: [{ name: 'ci/cd', color: '#8b5cf6' }],
  },
  {
    title: 'Implement auto-scaling for API',
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    projectPrefix: 'OPS',
    teamName: 'DevOps',
    labels: [{ name: 'reliability', color: '#10b981' }],
    blockedByTitles: ['Migrate DB to new cluster'],
  },
]

async function seed() {
  console.log('Starting seed...')

  const payload = await getPayload({ config })

  console.log('Clearing existing data...')
  await payload.delete({ collection: 'comments', where: {} })
  await payload.delete({ collection: 'tickets', where: {} })
  await payload.delete({ collection: 'cycles', where: {} })
  await payload.delete({ collection: 'members', where: {} })
  await payload.delete({ collection: 'projects', where: {} })
  await payload.delete({ collection: 'teams', where: {} })

  console.log('Creating teams...')
  const teamMap = new Map<string, string>()
  for (const team of SEED_TEAMS) {
    const created = await payload.create({
      collection: 'teams',
      data: team as any,
    })
    teamMap.set(team.name, created.id)
  }

  console.log('Creating projects...')
  const projectMap = new Map<string, string>()
  for (const project of SEED_PROJECTS) {
    const created = await payload.create({
      collection: 'projects',
      data: project as any,
    })
    projectMap.set(project.prefix, created.id)
  }

  console.log('Creating members...')
  const membersByTeam = new Map<string, string[]>()
  const memberIdsByName = new Map<string, string>()
  for (const member of SEED_MEMBERS) {
    const teamId = teamMap.get(member.teamName)
    const created = await payload.create({
      collection: 'members',
      data: { name: member.name, email: member.email, team: teamId ?? null } as any,
    })
    memberIdsByName.set(member.name, created.id)
    const roster = membersByTeam.get(member.teamName) ?? []
    roster.push(created.id)
    membersByTeam.set(member.teamName, roster)
  }

  console.log('Ensuring default statuses...')
  const statusIdsByKey = await ensureDefaultStatuses(payload)
  const statusIdFor = (status: TicketStatus) => statusIdsByKey.get(LEGACY_STATUS_KEYS[status]) ?? ''

  console.log('Creating tickets (first pass)...')
  const ticketMap = new Map<string, string>()

  let ticketIndex = 0
  for (const ticket of SEED_TICKETS) {
    const projectId = projectMap.get(ticket.projectPrefix)
    const teamId = ticket.teamName ? teamMap.get(ticket.teamName) : null

    if (!projectId) {
      console.error(`Project not found: ${ticket.projectPrefix}`)
      continue
    }

    const roster = ticket.teamName ? (membersByTeam.get(ticket.teamName) ?? []) : []
    const assigneeId =
      roster.length > 0 && ticketIndex % 4 !== 3
        ? roster[ticketIndex % roster.length]
        : null
    ticketIndex += 1

    const created = await payload.create({
      collection: 'tickets',
      data: {
        title: ticket.title,
        status: statusIdFor(ticket.status),
        priority: ticket.priority,
        project: projectId,
        team: teamId,
        assignee: assigneeId,
        labels: ticket.labels,
      },
    })

    ticketMap.set(ticket.title, created.id)
  }

  console.log('Linking dependencies...')
  for (const ticket of SEED_TICKETS) {
    if (ticket.blockedByTitles && ticket.blockedByTitles.length > 0) {
      const ticketId = ticketMap.get(ticket.title)
      if (!ticketId) continue

      const blockedByIDs = ticket.blockedByTitles
        .map(title => ticketMap.get(title))
        .filter((id): id is string => !!id)

      if (blockedByIDs.length > 0) {
        await payload.update({
          collection: 'tickets',
          id: ticketId,
          data: {
            blockedBy: blockedByIDs,
          },
        })
      }
    }
  }

  console.log('Creating comments...')
  const mentionToken = (name: string): string => {
    const id = memberIdsByName.get(name)
    return id ? `@[${name}](member:${id})` : name
  }
  const withMentions = (body: string): string =>
    body.replace(/\{\{([^}]+)\}\}/g, (_match, name: string) => mentionToken(name.trim()))

  for (const comment of SEED_COMMENTS) {
    const ticketId = ticketMap.get(comment.ticketTitle)
    if (!ticketId) {
      console.error(`Ticket not found for comment: ${comment.ticketTitle}`)
      continue
    }

    const root = await payload.create({
      collection: 'comments',
      data: {
        ticket: ticketId,
        body: withMentions(comment.body),
        author: memberIdsByName.get(comment.authorName) ?? null,
      } as any,
    })

    for (const reply of comment.replies ?? []) {
      await payload.create({
        collection: 'comments',
        data: {
          ticket: ticketId,
          parent: root.id,
          body: withMentions(reply.body),
          author: memberIdsByName.get(reply.authorName) ?? null,
        } as any,
      })
    }

    if (comment.resolved) {
      await payload.update({
        collection: 'comments',
        id: root.id,
        data: { resolved: true } as any,
      })
    }
  }

  console.log('Seed completed!')
  process.exit(0)
}

seed().catch((error) => {
  console.error('Seed failed:', JSON.stringify(error, null, 2))
  if (error.data && error.data.errors) {
    console.error('Validation errors:', JSON.stringify(error.data.errors, null, 2))
  }
  process.exit(1)
})
