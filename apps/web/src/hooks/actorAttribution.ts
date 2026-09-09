import type { CollectionBeforeChangeHook, Field } from 'payload'
import { actorLabel as resolveActorLabelText, resolveActorType } from '@/access/actorPolicy'

/**
 * SPC-005 D-1/D-2 — actor attribution on the document.
 *
 * Payload versions persist the FULL doc snapshot and never persist `req.user`
 * (verified against @payloadcms/db-mongodb@3.88.0 dist/createVersion.js), so
 * the audit trail could answer what/when but not who. These three doc
 * fields are stamped on every write; because versions snapshot the whole doc,
 * every current and future version is attributed automatically — no version
 * collection changes, no migrations, no custom event store.
 *
 * Classification reuses SPC-001's `resolveActorType`:
 *   - `req.user` with agent markers  → 'agent'
 *   - any other `req.user`           → 'user'   (superadmin/human bridge
 *      vocabulary from the Users collection maps here — a user present is
 *      NEVER demoted to anonymous, per SPC-005 D-2)
 *   - no user at all                 → 'anonymous' (local/terminal writes:
 *      script purges are the operator's direct writes and must stay visible
 *      as such)
 *
 * D-3: restore needs NO special casing — Payload's restoreVersion runs a
 * normal update whose beforeChange passes here, so the restorer's identity
 * lands on the restored snapshot (the new state was produced by whoever
 * restored).
 *
 * The hook always overwrites the three fields: admin-side `readOnly` is
 * presentational, so client-sent `actorType` values can never forge
 * attribution.
 */

/** The three attribution fields, spread into each audited collection. */
export const ACTOR_ATTRIBUTION_FIELDS: Field[] = [
  {
    name: 'actorType',
    type: 'select',
    options: ['user', 'agent', 'anonymous'],
    defaultValue: 'anonymous',
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'SPC-005: identity class that produced this state (set by the attribution hook)',
    },
  },
  {
    name: 'actorId',
    type: 'relationship',
    relationTo: 'users',
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'SPC-005: the acting user document, if any',
    },
  },
  {
    name: 'actorLabel',
    type: 'text',
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'SPC-005: denormalized display label; snapshots stay readable after user deletion',
    },
  },
] as const

/**
 * Shared `beforeChange` hook — register in every audit-attributed collection
 * (projects, teams, tickets).
 */
export const attributeActor: CollectionBeforeChangeHook = ({ data, req }) => {
  const user = req?.user ?? null
  data.actorType = resolveActorType(user) ?? 'anonymous'
  data.actorId = user?.id ?? null
  data.actorLabel = resolveActorLabelText(user)
  return data
}
