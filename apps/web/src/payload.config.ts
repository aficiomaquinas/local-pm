import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { importExportPlugin } from '@payloadcms/plugin-import-export'
import path from 'path'
import { buildConfig } from 'payload'
import type { CollectionConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { dataManagementAccess, enforceDataManagementEndpointPolicy } from './access/dataManagementPolicy'
import { Projects } from './collections/Projects'
import { Teams } from './collections/Teams'
import { Tickets } from './collections/Tickets'
import { Users } from './collections/Users'
import { SiteSettings } from './globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// SPC-004 §5.6 / D-3: snapshot files must survive container rebuilds, so the
// exports collection stores uploads on the compose-mounted volume
// (`local-pm-snapshots:/app/snapshots`), overridable via SNAPSHOT_DIR.
const SNAPSHOT_STATIC_DIR = process.env.SNAPSHOT_DIR || '/app/snapshots'

/**
 * R-4: wrap the plugin's custom-endpoint handlers so the Data Management
 * policy runs BEFORE them (Payload does not apply collection access to
 * custom endpoints). The plugin handlers are already-bound closures, so
 * wrapping preserves their behavior exactly.
 */
function gatePluginEndpoints(
  collection: CollectionConfig,
  policy: (surface: string) => (args: { req: PayloadRequest }) => boolean,
): CollectionConfig['endpoints'] {
  const endpoints = collection.endpoints
  if (!endpoints) return endpoints
  return endpoints.map((endpoint) =>
    typeof endpoint === 'object'
      ? {
          ...endpoint,
          handler: (req: PayloadRequest) => {
            policy(endpoint.path)({ req })
            return endpoint.handler(req)
          },
        }
      : endpoint,
  )
}

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Projects, Teams, Tickets, Users],
  // SPC-005 options panel: operator-level runtime switches (soft-delete
  // visible/silent). Superadmin-only writes via the global's access config.
  globals: [SiteSettings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
    // Bound mongoose's server selection so an unreachable mongodb fails fast
    // and deterministically (30s default). 3s stays under the 5s vitest
    // testTimeout — a stale DATABASE_URI in any test environment errors
    // inside the test instead of hanging it — while comfortably covering
    // runtime reconnects on the compose-internal network (mongodb health
    // gate in docker-compose.yml ensures the app starts against a live DB).
    connectOptions: {
      serverSelectionTimeoutMS: 3000,
    },
  }),
  plugins: [
    // SPC-004 §4a — import/export for the business collections. JSON-only
    // (D-4): the schema is structurally rich (Lexical bodies, nested arrays,
    // hasMany self-relation) and CSV is the lossy path for exactly those
    // shapes. disableJobsQueue (D/G-3): single-process local deployment
    // without a jobs runner — queued operations would sit pending forever;
    // the synchronous path blocks the request but is instant at local scale.
    importExportPlugin({
      collections: [
        {
          slug: 'projects',
          export: { format: 'json', disableJobsQueue: true },
          import: { disableJobsQueue: true },
        },
        {
          slug: 'teams',
          export: { format: 'json', disableJobsQueue: true },
          import: { disableJobsQueue: true },
        },
        {
          slug: 'tickets',
          export: { format: 'json', disableJobsQueue: true },
          import: { disableJobsQueue: true },
        },
      ],
      overrideExportCollection: ({ collection }) => ({
        ...collection,
        // R-3/D-3: upload staticDir on the compose volume.
        upload: {
          ...((collection as { upload?: Record<string, unknown> }).upload ?? {}),
          staticDir: SNAPSHOT_STATIC_DIR,
        },
        // R-4: the plugin's /download + /export-preview custom endpoints are
        // gated by the same policy (collection access does not run for them).
        endpoints: gatePluginEndpoints(collection, enforceDataManagementEndpointPolicy),
        access: {
          ...collection.access,
          read: dataManagementAccess,
          create: dataManagementAccess,
        },
        admin: {
          ...collection.admin,
          group: 'Data Management',
        },
      }),
      overrideImportCollection: ({ collection }) => ({
        ...collection,
        // R-4: gate the /preview-data custom endpoint identically.
        endpoints: gatePluginEndpoints(collection, enforceDataManagementEndpointPolicy),
        access: {
          ...collection.access,
          read: dataManagementAccess,
          create: dataManagementAccess,
        },
        admin: {
          ...collection.admin,
          group: 'Data Management',
        },
      }),
    }),
  ],
})
