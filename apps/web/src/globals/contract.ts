/**
 * Shared constants + runtime helpers for the site-settings global
 * (SPC-005 options panel). Kept dependency-free so both the Payload config
 * (server) and client components can import it.
 */

export const SITE_SETTINGS_SLUG = 'site-settings'

export const SOFT_DELETE_BEHAVIORS = ['visible', 'silent'] as const
export type SoftDeleteBehavior = (typeof SOFT_DELETE_BEHAVIORS)[number]

export const DEFAULT_SOFT_DELETE_BEHAVIOR: SoftDeleteBehavior = 'visible'

/** True when the given value is a known soft-delete behavior. */
export function isSoftDeleteBehavior(v: unknown): v is SoftDeleteBehavior {
  return v === 'visible' || v === 'silent'
}

/** Normalize an unknown stored value to a safe behavior (never throws). */
export function normalizeSoftDeleteBehavior(v: unknown): SoftDeleteBehavior {
  return isSoftDeleteBehavior(v) ? v : DEFAULT_SOFT_DELETE_BEHAVIOR
}
