import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { ProjectStatus, TicketStatus, TicketPriority } from '../types/enums'

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

const SEED_TICKETS: SeedTicket[] = [
  // Website Redesign (WEB)
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

  // Mobile App v2 (APP)
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

  // Marketing (MKT)
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

  // DevOps (OPS)
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

  // Clear existing data
  console.log('Clearing existing data...')
  await payload.delete({ collection: 'tickets', where: {} })
  await payload.delete({ collection: 'projects', where: {} })
  await payload.delete({ collection: 'teams', where: {} })

  // Create teams
  console.log('Creating teams...')
  const teamMap = new Map<string, string>()
  for (const team of SEED_TEAMS) {
    const created = await payload.create({
      collection: 'teams',
      data: team as any,
    })
    teamMap.set(team.name, created.id)
  }

  // Create projects
  console.log('Creating projects...')
  const projectMap = new Map<string, string>()
  for (const project of SEED_PROJECTS) {
    const created = await payload.create({
      collection: 'projects',
      data: project as any,
    })
    projectMap.set(project.prefix, created.id)
  }

  // Create tickets (first pass)
  console.log('Creating tickets (first pass)...')
  const ticketMap = new Map<string, string>()

  for (const ticket of SEED_TICKETS) {
    const projectId = projectMap.get(ticket.projectPrefix)
    const teamId = ticket.teamName ? teamMap.get(ticket.teamName) : null

    if (!projectId) {
      console.error(`Project not found: ${ticket.projectPrefix}`)
      continue
    }

    const created = await payload.create({
      collection: 'tickets',
      data: {
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        project: projectId,
        team: teamId,
        labels: ticket.labels,
      },
    })

    // Store in map so we can reference for blockedBy
    // Using title as key (assume unique titles in seed data for simplicity)
    ticketMap.set(ticket.title, created.id)
  }

  // Second pass: link dependencies
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
