/**
 * SPC-006 §7 — claims → roles mapping (config, not code; ADR-002 D4).
 *
 * Pure functions: no I/O, no env reads at import (readers live in env.ts, so
 * tests can drive them via process.env). Fail-safe rule: an empty/absent
 * groups claim maps to `['human']` — lowest privilege, never `superadmin` by
 * absence of claims (§7). Superadmin comes only from an explicit mapped group
 * (OIDC_ROLE_MAP value or OIDC_SUPERADMIN_GROUP).
 *
 * Reference: SPC-006 §7 derivation:
 *   raw = token[OIDC_GROUPS_CLAIM] ?? []
 *   roles = raw.map(v => OIDC_ROLE_MAP[v] ?? (v === OIDC_SUPERADMIN_GROUP ? 'superadmin' : null)).filter(Boolean)
 *   if empty → ['human']
 */

import type { AppRole } from './env'
import { getGroupsClaim, getRoleMap, getSuperadminGroup } from './env'

/** AppRole vocabulary of the users collection's `roles` field (§8). */
export const APP_ROLES: readonly AppRole[] = ['superadmin', 'human', 'agent'] as const

function isAppRole(v: unknown): v is AppRole {
  return v === 'superadmin' || v === 'human' || v === 'agent'
}

/**
 * Raw groups claim values off a validated token payload. Accepts a string,
 * a string[], a space-separated string, or absent — normalizes to string[].
 */
export function extractRawGroups(payload: Record<string, unknown>, claim = getGroupsClaim()): string[] {
  const v = payload[claim]
  if (typeof v === 'string') {
    // Tolerate space-separated group strings ("grp-a grp-b").
    const parts = v.split(/\s+/).filter(Boolean)
    return parts.length === 1 ? [v] : parts
  }
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

/**
 * Map raw claim values to AppRoles. Unmapped values are dropped (kept
 * separately as rawGroups for mapping audit, §8). `superadmin` only via an
 * explicit mapping (OIDC_ROLE_MAP value or OIDC_SUPERADMIN_GROUP).
 */
export function mapRawGroupsToRoles(raw: string[]): AppRole[] {
  const roleMap = getRoleMap()
  const superadminGroup = getSuperadminGroup()
  const out = new Set<AppRole>()
  for (const v of raw) {
    const mapped = roleMap[v]
    if (isAppRole(mapped)) {
      out.add(mapped)
      continue
    }
    if (superadminGroup && v === superadminGroup) out.add('superadmin')
  }
  return [...out]
}

/**
 * Full human-token derivation (§7): extract → map → fail-safe `['human']`.
 * The fail-safe fires when NOTHING maps — `['human']` is the floor.
 */
export function deriveRolesForTokenPayload(payload: Record<string, unknown>): { roles: AppRole[]; rawGroups: string[] } {
  const rawGroups = extractRawGroups(payload)
  const roles = mapRawGroupsToRoles(rawGroups)
  return { roles: roles.length > 0 ? roles : ['human'], rawGroups }
}

/**
 * Re-derive the persisted bridge `actorType` from mapped roles (§7 bridge
 * reconciliation): `superadmin ∈ roles` → 'superadmin'; otherwise 'human'
 * (agent is decided by the client-id path, §6, not by roles).
 */
export function deriveActorTypeFromRoles(roles: AppRole[]): 'superadmin' | 'human' {
  return roles.includes('superadmin') ? 'superadmin' : 'human'
}
