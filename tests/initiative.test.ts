import { describe, it, expect } from 'vitest'
import {
  EMPTY_INITIATIVE_ROLLUP,
  describeInitiativeRollup,
  projectIdsOf,
  projectPercent,
  projectRefsOf,
  rollupInitiative,
  type ProjectRollup,
} from '@/lib/initiative'
import type { Initiative, Project } from '@/payload-types'

const project = (over: Partial<ProjectRollup> = {}): ProjectRollup => ({
  id: 'p1',
  name: 'Project',
  total: 0,
  done: 0,
  cancelled: 0,
  started: 0,
  ...over,
})

const asProject = (id: string): Project => ({ id, name: `Project ${id}` }) as unknown as Project

describe('rollupInitiative', () => {
  it('reports an all-zero rollup for an initiative with no projects', () => {
    expect(rollupInitiative([])).toEqual(EMPTY_INITIATIVE_ROLLUP)
  })

  it('sums ticket counts across every project', () => {
    const rollup = rollupInitiative([
      project({ id: 'a', total: 4, done: 2, started: 1 }),
      project({ id: 'b', total: 6, done: 1, started: 3 }),
    ])

    expect(rollup.projects).toBe(2)
    expect(rollup.total).toBe(10)
    expect(rollup.done).toBe(3)
    expect(rollup.started).toBe(4)
  })

  it('drops cancelled tickets from the denominator but keeps them in the total', () => {
    const rollup = rollupInitiative([
      project({ id: 'a', total: 5, done: 2, cancelled: 1 }),
      project({ id: 'b', total: 5, done: 2, cancelled: 1 }),
    ])

    expect(rollup.total).toBe(10)
    expect(rollup.cancelled).toBe(2)
    expect(rollup.counted).toBe(8)
    expect(rollup.open).toBe(4)
    expect(rollup.percent).toBe(50)
  })

  it('reads 100% when every countable ticket is done', () => {
    const rollup = rollupInitiative([project({ total: 3, done: 2, cancelled: 1 })])

    expect(rollup.counted).toBe(2)
    expect(rollup.open).toBe(0)
    expect(rollup.percent).toBe(100)
  })

  it('reads 0% rather than dividing by zero when every ticket is cancelled', () => {
    const rollup = rollupInitiative([project({ total: 2, cancelled: 2 })])

    expect(rollup.counted).toBe(0)
    expect(rollup.percent).toBe(0)
  })

  it('counts a project that holds no tickets towards the project count only', () => {
    const rollup = rollupInitiative([project({ id: 'a' }), project({ id: 'b', total: 2, done: 1 })])

    expect(rollup.projects).toBe(2)
    expect(rollup.total).toBe(2)
    expect(rollup.percent).toBe(50)
  })

  it('rounds the percentage to a whole number', () => {
    expect(rollupInitiative([project({ total: 3, done: 1 })]).percent).toBe(33)
    expect(rollupInitiative([project({ total: 3, done: 2 })]).percent).toBe(67)
  })
})

describe('projectPercent', () => {
  it('scores one project the same way the initiative scores all of them', () => {
    expect(projectPercent(project({ total: 4, done: 1 }))).toBe(25)
    expect(projectPercent(project({ total: 4, done: 1, cancelled: 2 }))).toBe(50)
    expect(projectPercent(project())).toBe(0)
  })
})

describe('describeInitiativeRollup', () => {
  it('separates an empty initiative from projects with no tickets', () => {
    expect(describeInitiativeRollup(rollupInitiative([]))).toBe('No projects in this initiative yet')
    expect(describeInitiativeRollup(rollupInitiative([project()]))).toBe(
      'No tickets in these projects yet',
    )
  })

  it('names progress without relying on colour', () => {
    const summary = describeInitiativeRollup(
      rollupInitiative([project({ total: 6, done: 2, started: 1, cancelled: 1 })]),
    )

    expect(summary).toBe('2 of 5 done, 1 in progress, 1 cancelled')
  })

  it('leaves out clauses that would read as zero', () => {
    expect(describeInitiativeRollup(rollupInitiative([project({ total: 2, done: 1 })]))).toBe(
      '1 of 2 done',
    )
  })
})

describe('projectIdsOf', () => {
  it('reads ids whether the relationship is populated or not', () => {
    const initiative = { projects: ['a', asProject('b')] } as unknown as Initiative
    expect(projectIdsOf(initiative)).toEqual(['a', 'b'])
  })

  it('drops duplicates so a project cannot be counted twice', () => {
    const initiative = { projects: ['a', asProject('a'), 'b'] } as unknown as Initiative
    expect(projectIdsOf(initiative)).toEqual(['a', 'b'])
  })

  it('treats a missing or empty relationship as no projects', () => {
    expect(projectIdsOf({ projects: null } as unknown as Initiative)).toEqual([])
    expect(projectIdsOf({ projects: [] } as unknown as Initiative)).toEqual([])
    expect(projectIdsOf({} as unknown as Initiative)).toEqual([])
  })
})

describe('projectRefsOf', () => {
  it('returns only the projects that came back populated', () => {
    const initiative = { projects: ['a', asProject('b')] } as unknown as Initiative
    expect(projectRefsOf(initiative).map((p) => p.id)).toEqual(['b'])
  })
})
