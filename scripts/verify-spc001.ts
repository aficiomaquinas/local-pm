/**
 * SPC-001 §7 verification script — runs INSIDE the app container against the
 * live Mongo, exercising the real Payload Local API (same code paths the
 * History tab uses). Prints labeled evidence for each acceptance criterion.
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { buildHistoryFeed } from '../src/app/api/history/feed'
import { enforceMasterOnlyPolicy, isMasterUser, resolveActorType } from '../src/access/actorPolicy'

const label = (s: string) => console.log(`\n===== ${s} =====`)

async function main() {
  const payload = await getPayload({ config })
  const RAND = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')

  label('AC-2: CRUD generates _slug_versions entries (Local API create/update)')
  const project = await payload.create({
    collection: 'projects',
    data: { name: 'Audit Trail Verify', prefix: RAND, status: 'ACTIVE', icon: 'folder', color: '#6366f1' } as never,
  })
  console.log('created project:', project.id, project.name, 'prefix=' + project.prefix)

  const team = await payload.create({
    collection: 'teams',
    data: { name: `ATV Team ${RAND}`, description: null, color: '#22d3ee' } as never,
  })
  console.log('created team:', team.id, team.name)

  const ticket = await payload.create({
    collection: 'tickets',
    data: {
      title: 'ATV verify ticket',
      status: 'TODO',
      priority: 'HIGH',
      project: project.id,
      team: team.id,
      labels: [{ name: 'audit', color: '#ef4444' }],
      subtasks: [{ title: 'write verify script', completed: true }],
    } as never,
  })
  console.log('created ticket:', ticket.id, 'ticketId=' + (ticket as unknown as { ticketId: string }).ticketId)

  // Two updates on the ticket → versions trail
  await payload.update({ collection: 'tickets', id: ticket.id, data: { status: 'IN_PROGRESS', title: 'ATV verify ticket (edited)' } as never })
  await payload.update({
    collection: 'tickets',
    id: ticket.id,
    data: {
      status: 'DONE',
      priority: 'LOW',
      labels: [{ name: 'audit', color: '#ef4444' }, { name: 'verified', color: '#22c55e' }],
      subtasks: [{ title: 'write verify script', completed: true }, { title: 'review diff', completed: false }],
    } as never,
  })
  await payload.update({ collection: 'projects', id: project.id, data: { name: 'Audit Trail Verify v2' } as never })
  await payload.update({ collection: 'teams', id: team.id, data: { name: 'ATV Team v2' } as never })

  label('AC-2 evidence: Mongo _slug_versions collections + counts')
  const db = payload.db as unknown as {
    connection: { db: { listCollections: (f?: unknown) => { toArray: () => Promise<{ name: string }[]> }; collection: (n: string) => { countDocuments: (f?: unknown) => Promise<number>; find: (f: unknown) => { toArray: () => Promise<Record<string, unknown>[]> } } } }
  }
  const mongo = db.connection.db
  const collections = await mongo.listCollections().toArray()
  const versionCols = collections.map((c) => c.name).filter((n) => n.includes('_versions'))
  console.log('version collections:', JSON.stringify(versionCols))
  for (const c of ['_projects_versions', '_teams_versions', '_tickets_versions']) {
    const count = await mongo.collection(c).countDocuments({})
    console.log(`  ${c}: ${count} docs`)
  }
  const { ObjectId } = await import('mongodb')
  const sample = await mongo.collection('_tickets_versions').find({ parent: new ObjectId(String(ticket.id)) }).toArray()
  console.log(`  sample _tickets_versions for ticket ${ticket.id}:`, JSON.stringify(sample.map((d) => ({ id: d._id, status: (d.version as { status?: string })?.status, title: (d.version as { title?: string })?.title }))))

  label('AC-3: /api/history aggregation feed (withDiff=1) — same builder the HTTP route uses')
  const feed = await buildHistoryFeed(payload, new URLSearchParams({ withDiff: '1', limit: '5' }))
  console.log('totalDocs:', feed.totalDocs, 'page:', feed.page, 'limit:', feed.limit, 'docs in page:', feed.docs.length)
  for (const d of feed.docs) {
    console.log(`  [${d.updatedAt}] ${d.collection} · ${d.parentLabel} · diff-keys=${d.diff ? Object.keys(d.diff as object).join('|') : 'none'}`)
  }

  label('AC-3 evidence: filter collection=tickets')
  const onlyTickets = await buildHistoryFeed(payload, new URLSearchParams({ collection: 'tickets', limit: '50' }))
  console.log('totalDocs(tickets):', onlyTickets.totalDocs, '| all are tickets:', onlyTickets.docs.every((d) => d.collection === 'tickets'))

  label('AC-3 evidence: filter parent=<ticket id>')
  const byParent = await buildHistoryFeed(payload, new URLSearchParams({ collection: 'tickets', parent: String(ticket.id) }))
  console.log('totalDocs(parent):', byParent.totalDocs, '| parents:', JSON.stringify([...new Set(byParent.docs.map((d) => d.parent))]))

  label('AC-3 evidence: filter q=verify (title text)')
  const byQ = await buildHistoryFeed(payload, new URLSearchParams({ q: 'verify', limit: '50' }))
  console.log('totalDocs(q=verify):', byQ.totalDocs, '| labels:', JSON.stringify(byQ.docs.slice(0, 3).map((d) => d.parentLabel)))

  label('AC-3 evidence: filter from/to (today only)')
  const today = new Date().toISOString().slice(0, 10)
  const byDate = await buildHistoryFeed(payload, new URLSearchParams({ from: `${today}T00:00:00.000Z`, to: `${today}T23:59:59.999Z`, limit: '50' }))
  console.log(`totalDocs(${today}):`, byDate.totalDocs)

  label('AC-4: field-by-field diff (added/removed/changed)')
  const withDiff = await buildHistoryFeed(payload, new URLSearchParams({ withDiff: '1', collection: 'tickets', parent: String(ticket.id) }))
  const changed = withDiff.docs.find((d) => d.diff && Object.keys(d.diff).length > 0)
  console.log('delta sample:', JSON.stringify(changed?.diff, null, 1))

  label('AC-5: restore via Local API (same op as POST /api/tickets/versions/:id)')
  const firstVersion = await payload.findVersions({ collection: 'tickets', where: { parent: { equals: ticket.id } }, sort: 'updatedAt', limit: 1, depth: 0 })
  const vToRestore = firstVersion.docs[0]
  console.log('restoring version', vToRestore.id, '(status=' + (vToRestore.version as { status?: string }).status + ', title=' + (vToRestore.version as { title?: string }).title + ')')
  await payload.restoreVersion({ collection: 'tickets', id: String(vToRestore.id) })
  const afterRestore = await payload.findByID({ collection: 'tickets', id: ticket.id })
  const t = afterRestore as unknown as { status: string; title: string }
  console.log('ticket after restore: status=' + t.status + ' title=' + t.title)
  const versionsAfter = await payload.findVersions({ collection: 'tickets', where: { parent: { equals: ticket.id } }, sort: '-updatedAt', limit: 1, depth: 0 })
  console.log('newest version after restore: status=' + (versionsAfter.docs[0].version as { status?: string }).status + ' title=' + (versionsAfter.docs[0].version as { title?: string }).title)

  label('AC-7: policy unit checks (readVersions ACL + endpoint guard)')
  const anon = null
  const human = { id: 'u1', email: 'master@local', collection: 'users', actorType: 'user' } as never
  const agent = { id: 'a1', email: 'agent@local', collection: 'users', actorType: 'agent' } as never
  console.log('resolveActorType(anon):', resolveActorType(anon), '| isMasterUser:', isMasterUser(anon))
  console.log('resolveActorType(human as never):', resolveActorType(human as never), '| isMasterUser:', isMasterUser(human as never))
  console.log('resolveActorType(agent as never):', resolveActorType(agent as never), '| isMasterUser:', isMasterUser(agent as never))

  const mkReq = (user: unknown) => ({ user, headers: new Map() }) as unknown as Parameters<ReturnType<typeof enforceMasterOnlyPolicy>>[0]['req']
  const guard = enforceMasterOnlyPolicy('test surface')

  const tryGuard = async (name: string, user: unknown) => {
    try {
      const r = guard({ req: mkReq(user) })
      console.log(`${name}:`, r === true ? 'ALLOWED' : `where-clause ${JSON.stringify(r)}`)
    } catch (e) {
      const err = e as { status?: number; message?: string }
      console.log(`${name}: DENIED status=${err.status} (${err.message?.slice(0, 60)}…)`)
    }
  }
  await tryGuard('guard(anonymous)', anon)
  await tryGuard('guard(human)', human)
  await tryGuard('guard(agent)', agent)

  label('AC-7 evidence: native readVersions with agent-like req.user → expect 403')
  try {
    await payload.findVersions({
      collection: 'tickets',
      where: { parent: { equals: String(ticket.id) } },
      overrideAccess: false,
      user: agent as never,
    })
    console.log('agent findVersions: ALLOWED (unexpected!)')
  } catch (e) {
    console.log('agent findVersions: DENIED ->', (e as Error).message.slice(0, 80))
  }

  label('AC-7 evidence: native readVersions with master-user req.user → expect success')
  const humanVersions = await payload.findVersions({
    collection: 'tickets',
    where: { parent: { equals: String(ticket.id) } },
    overrideAccess: false,
    user: human as never,
  })
  console.log('human findVersions: OK, docs:', humanVersions.docs.length)

  label('AC-7 evidence: restoreVersion as agent → expect denial')
  try {
    await payload.restoreVersion({ collection: 'tickets', id: String(vToRestore.id), overrideAccess: false, user: agent as never })
    console.log('agent restore: ALLOWED (unexpected!)')
  } catch (e) {
    console.log('agent restore: DENIED ->', (e as Error).message.slice(0, 80))
  }

  label('AC-7 evidence: restoreVersion as master user → expect success')
  const restoredAsHuman = await payload.restoreVersion({ collection: 'tickets', id: String(vToRestore.id), overrideAccess: false, user: human as never })
  console.log('human restore: OK ->', (restoredAsHuman as unknown as { status: string }).status)

  label('AC-6: cleanup of verification data')
  await payload.delete({ collection: 'tickets', id: ticket.id })
  await payload.delete({ collection: 'projects', id: project.id })
  await payload.delete({ collection: 'teams', id: team.id })
  console.log('verification docs deleted')

  console.log('\nALL LOCAL VERIFICATION STEPS COMPLETED')
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('VERIFY FAILED:', e)
  process.exit(1)
})
