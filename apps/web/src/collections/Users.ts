import type { CollectionConfig, TypedUser } from 'payload'
import { isOidcEnabled } from '@/lib/oidc/env'
import { resolveOidcActor } from '@/lib/oidc/actor'

/** The strategy contract's user shape (TypedUser + the doc's own fields). */
type OidcStrategyUser = TypedUser & Record<string, unknown>

/**
 * SPC-004 §5.5/D-2 minimal bridge users collection, extended by SPC-006
 * (ADR-002 implementation design) with additive OIDC identity fields.
 *
 * D-1 (SPC-006 §4): a custom `oidc` auth strategy authenticates
 * `Authorization: Bearer` tokens against the configured issuer — humans by
 * `(iss, sub)`, agents by client-id claim (§6). It is a pure
 * request→user function: no redirects, no state/PKCE (those live in the
 * /api/auth/oidc/* route handlers, §5). `disableLocalStrategy` stays false
 * while OD-1 is open: local email/password login, first-register and the
 * master user keep working unchanged (§12) — the flag-gated flip is M7 and
 * requires explicit operator confirmation.
 *
 * Added fields (§8, all additive — nothing existing is removed):
 *   - identityIss / identitySub: the token identity PAIR (ADR-002); email
 *     becomes an attribute. Uniqueness of the pair is enforced by the upsert
 *     (find-then-create with duplicate-key retry, lib/oidc/upsert.ts).
 *   - roles (superadmin|human|agent): re-derived from claims at every login
 *     (effective revocation at token expiry). actorPolicy keeps accepting
 *     both this array and the bridge actorType — zero ACL-module changes
 *     beyond dataManagementPolicy's roles-array read (§9).
 *   - rawGroups: unmapped claim values, for mapping audit (ADR-002).
 *   - lastLoginAt / lastChannel: diagnostics + best-effort channel stamp (§9).
 *
 * The existing `actorType` field keeps its SPC-004 semantics and is
 * re-derived from mapped roles on every OIDC login (§7 bridge
 * reconciliation). `active` is the local agent kill-switch (§6, AC-11).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  // OD-1 (open): the local strategy stays (first-register E-7 and fallback
  // login preserved, §12). When the collection declares `auth.strategies`,
  // Payload's `Auth` type requires `disableLocalStrategy` to be present —
  // expressed here as the explicit object form enabling auth fields, which
  // the sanitizer treats exactly like `false` (local strategy keeps running;
  // §12). The gated M7 flip is `disableLocalStrategy: true`.
  auth: {
    disableLocalStrategy: {
      enableFields: true,
      optionalPassword: true,
    },
    strategies: [
      {
        name: 'oidc',
        // Fail-closed (§4): any failure → { user: null }, never a throw into
        // the request pipeline. The returned document satisfies the strategy
        // contract ({ id, collection, email, updatedAt, createdAt } + the
        // doc's own fields); the loose shape is deliberate — OIDC docs are
        // validated by Payload at write time, not by this cast.
        authenticate: async ({ payload, headers }) => {
          if (!isOidcEnabled()) return { user: null }
          const header = headers.get('authorization') ?? ''
          if (!header.toLowerCase().startsWith('bearer ')) return { user: null }
          const token = header.slice(7).trim()
          if (!token) return { user: null }
          try {
            const actor = await resolveOidcActor(payload, token, headers)
            return { user: actor as unknown as OidcStrategyUser | null }
          } catch {
            return { user: null }
          }
        },
      },
    ],
  },
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'actorType',
      type: 'select',
      label: 'Actor Type',
      required: true,
      defaultValue: 'human',
      options: [
        { label: 'Superadmin', value: 'superadmin' },
        { label: 'Human', value: 'human' },
        { label: 'Agent', value: 'agent' },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      label: 'Active',
      defaultValue: true,
    },
    // ── SPC-006 §8 — additive OIDC identity fields ──────────────────────────
    {
      name: 'identityIss',
      type: 'text',
      index: true,
      label: 'OIDC Issuer (identity pair)',
      admin: {
        description: 'Token iss, exactly as emitted. Identity key is the (identityIss, identitySub) pair.',
        condition: (data: Record<string, unknown>) => Boolean(data['identityIss'] || data['identitySub']),
      },
    },
    {
      name: 'identitySub',
      type: 'text',
      index: true,
      label: 'OIDC Subject (identity pair)',
      admin: {
        description: 'Token sub. Email is an attribute; the identity is the pair.',
        condition: (data: Record<string, unknown>) => Boolean(data['identityIss'] || data['identitySub']),
      },
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      label: 'Roles (OIDC-derived)',
      defaultValue: ['human'],
      options: [
        { label: 'Superadmin', value: 'superadmin' },
        { label: 'Human', value: 'human' },
        { label: 'Agent', value: 'agent' },
      ],
      admin: {
        description: 'Re-derived from token claims at every login (effective revocation at token expiry).',
      },
    },
    {
      name: 'rawGroups',
      type: 'json',
      label: 'Raw Groups (mapping audit)',
      admin: {
        description: 'Unmapped group-claim values, kept for mapping audit (ADR-002 rawGroups).',
      },
    },
    {
      name: 'lastLoginAt',
      type: 'date',
      label: 'Last Login At',
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description: 'Diagnostics: last successful OIDC authentication.',
      },
    },
    {
      name: 'lastChannel',
      type: 'select',
      label: 'Last Channel',
      defaultValue: 'webui',
      options: [
        { label: 'Web UI', value: 'webui' },
        { label: 'REST', value: 'rest' },
        { label: 'MCP', value: 'mcp' },
      ],
      admin: {
        description: 'Best-effort channel stamp (X-LocalPM-Channel), set at login time only (§9).',
      },
    },
  ],
  timestamps: true,
}
