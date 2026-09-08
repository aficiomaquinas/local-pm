import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { importExportPlugin } from '@payloadcms/plugin-import-export'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { dataManagementAccess } from './access/dataManagementPolicy'
import { Projects } from './collections/Projects'
import { Teams } from './collections/Teams'
import { Tickets } from './collections/Tickets'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// SPC-004 §5.6 / D-3: snapshot files must survive container rebuilds, so the
// exports collection stores uploads on the compose-mounted volume
// (`local-pm-snapshots:/app/snapshots`), overridable via SNAPSHOT_DIR.
const SNAPSHOT_STATIC_DIR = process.env.SNAPSHOT_DIR || '/app/snapshots'

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Projects, Teams, Tickets, Users],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
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
