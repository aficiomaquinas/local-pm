/**
 * Actor resolution shared by SPC-004 (Data Management) surfaces.
 *
 * This is the exact `resolveDataManagementActor` logic from
 * access/dataManagementPolicy.ts, extracted so privileged ACLs can
 * reuse it without importing the whole Data Management module (and so the
 * policy vocabularies cannot drift apart):
 *
 *   - agent markers win → 'agent' (barred BY POLICY everywhere privileged);
 *   - 'superadmin'/'human'/'user' actorType → 'user' (the master user
 *     pre-claims IS the superadmin identity);
 *   - legacy roles/isAgent markers;
 *   - no user → null (deny-by-default).
 */

type DataManagementActor = 'agent' | 'user' | null

export type { DataManagementActor }

export function resolveDataManagementActor(
  user: unknown,
): DataManagementActor {
  if (!user) return null
  const marker = (user as { actorType?: unknown }).actorType
  if (marker === 'agent') return 'agent'
  if (marker === 'superadmin' || marker === 'human' || marker === 'user') return 'user'
  const roles = (user as { roles?: unknown }).roles
  if (Array.isArray(roles) && roles.includes('agent')) return 'agent'
  if ((user as { isAgent?: unknown }).isAgent === true) return 'agent'
  return 'user'
}
