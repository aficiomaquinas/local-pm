import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SOURCE_URI,
  databaseNameFor,
  databaseNameOf,
  distDirFor,
  outputDirFor,
  parsePort,
  resolveRunContext,
  withDatabase,
  type RunEnv,
} from '../e2e/run-context'

const env = (overrides: Record<string, string> = {}): RunEnv => ({
  DATABASE_URI: 'mongodb://localhost:27018/local-pm',
  E2E_PORT: '3020',
  ...overrides,
})

describe('withDatabase', () => {
  it('swaps the database name and keeps the query string', () => {
    expect(withDatabase('mongodb://localhost:27018/local-pm', 'x')).toBe(
      'mongodb://localhost:27018/x',
    )
    expect(withDatabase('mongodb+srv://u:p@host/local-pm?retryWrites=true', 'x')).toBe(
      'mongodb+srv://u:p@host/x?retryWrites=true',
    )
  })
})

describe('databaseNameOf', () => {
  it('reads the database out of a uri', () => {
    expect(databaseNameOf('mongodb://localhost:27018/local-pm-e2e-3020')).toBe('local-pm-e2e-3020')
    expect(databaseNameOf('mongodb+srv://u:p@host/db?retryWrites=true')).toBe('db')
  })
})

describe('parsePort', () => {
  it('treats absent and empty as unset', () => {
    expect(parsePort(undefined)).toBeNull()
    expect(parsePort('   ')).toBeNull()
  })

  it('accepts a port in range', () => {
    expect(parsePort('3021')).toBe(3021)
  })

  it('rejects anything that is not a usable port', () => {
    expect(() => parsePort('nope')).toThrow(/between 1 and 65535/)
    expect(() => parsePort('0')).toThrow()
    expect(() => parsePort('70000')).toThrow()
    expect(() => parsePort('3020.5')).toThrow()
  })
})

describe('resolveRunContext', () => {
  it('derives every shared resource from the port', () => {
    const run = resolveRunContext(env())

    expect(run.port).toBe(3020)
    expect(run.baseUrl).toBe('http://127.0.0.1:3020')
    expect(run.databaseUri).toBe('mongodb://localhost:27018/local-pm-e2e-3020')
    expect(run.databaseName).toBe('local-pm-e2e-3020')
    expect(run.distDir).toBe('.next-e2e-3020')
    expect(run.outputDir).toBe('test-results-3020')
  })

  it('gives two runs on different ports no shared resource', () => {
    const a = resolveRunContext(env({ E2E_PORT: '3020' }))
    const b = resolveRunContext(env({ E2E_PORT: '3021' }))

    expect(a.port).not.toBe(b.port)
    expect(a.databaseUri).not.toBe(b.databaseUri)
    expect(a.distDir).not.toBe(b.distDir)
    expect(a.outputDir).not.toBe(b.outputDir)
    expect(a.baseUrl).not.toBe(b.baseUrl)
  })

  it('publishes the resolution so a later call in the same run agrees', () => {
    const shared = env({ E2E_PORT: '3022' })
    const first = resolveRunContext(shared)

    expect(shared.E2E_PORT).toBe('3022')
    expect(shared.E2E_DATABASE_URI).toBe(first.databaseUri)
    expect(resolveRunContext(shared)).toEqual(first)
  })

  it('honours an explicitly pinned database', () => {
    const run = resolveRunContext(env({ E2E_DATABASE_URI: 'mongodb://localhost:27018/pinned' }))

    expect(run.databaseUri).toBe('mongodb://localhost:27018/pinned')
    expect(run.databaseName).toBe('pinned')
  })

  it('refuses to point the suite at the working database', () => {
    expect(() =>
      resolveRunContext(env({ E2E_DATABASE_URI: 'mongodb://localhost:27018/local-pm' })),
    ).toThrow(/Refusing to run e2e/)
  })

  it('falls back to the local default source uri', () => {
    const bare: RunEnv = { E2E_PORT: '3023' }
    expect(resolveRunContext(bare).databaseUri).toBe(
      withDatabase(DEFAULT_SOURCE_URI, databaseNameFor(3023)),
    )
  })
})

describe('resource names', () => {
  it('are unique per port', () => {
    const ports = [3020, 3021, 3022]
    const names = ports.flatMap((p) => [databaseNameFor(p), distDirFor(p), outputDirFor(p)])
    expect(new Set(names).size).toBe(names.length)
  })
})
