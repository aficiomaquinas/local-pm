'use client'

import { useCallback, useEffect, useState } from 'react'
import { Settings, Loader2, Check } from 'lucide-react'

/**
 * Options panel (SPC-005 action-plan item 3) — MINIMAL superadmin surface
 * for the soft-delete toggle.
 *
 * ACL: reads /api/globals/site-settings (open read) but WRITES go through
 * POST /api/globals/site-settings, which runs the global's superadmin-only
 * `update` access — the server is the gate, exactly like Data Management
 * (SPC-004 §4e). Non-superadmin users see the current mode read-only; a
 * failed save surfaces the server's 403 text.
 *
 * Not an elaborate settings page: one functional toggle with feedback.
 */

interface SiteSettingsShape {
  softDeleteBehavior?: 'visible' | 'silent'
}

export function OptionsPanel() {
  const [behavior, setBehavior] = useState<'visible' | 'silent'>('visible')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/globals/site-settings')
      if (res.ok) {
        const json = (await res.json()) as SiteSettingsShape
        if (json.softDeleteBehavior === 'silent' || json.softDeleteBehavior === 'visible') {
          setBehavior(json.softDeleteBehavior)
        }
      }
    } catch {
      // Leave the default; the save attempt will surface real errors.
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (next: 'visible' | 'silent') => {
    setSaving(true)
    setError(null)
    setSavedAt(null)
    try {
      const res = await fetch('/api/globals/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ softDeleteBehavior: next }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null
        const msg = typeof body?.error === 'string' ? body.error : `Save failed (${res.status})`
        throw new Error(msg)
      }
      setBehavior(next)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-foreground rounded-md flex items-center justify-center">
          <Settings className="w-4 h-4 text-background" />
        </div>
        <h1 className="text-xl font-semibold text-white">Options</h1>
        <span className="text-xs text-gray-500">operator settings · superadmin only</span>
      </div>

      <section className="bg-[#18181b] border border-[#27272a] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-white mb-1">Soft delete behavior</h2>
        <p className="text-xs text-gray-500 mb-4">
          Applies when Delete is used on tickets, projects and teams. Hard delete stays
          blocked from every request path in both modes; the version trail is never
          destroyed.
        </p>

        <div className="flex flex-col gap-2">
          {(
            [
              {
                value: 'visible' as const,
                title: 'Visible (default)',
                detail: 'Delete soft-deletes the item and the change appears in History.',
              },
              {
                value: 'silent' as const,
                title: 'Silent',
                detail:
                  'Delete soft-deletes the item, but the History entry is hidden. Flip back to Visible to reveal it again — nothing is lost.',
              },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => void save(opt.value)}
              disabled={saving || behavior === opt.value}
              className={`flex items-start gap-3 text-left border rounded-lg px-4 py-3 transition-colors ${
                behavior === opt.value
                  ? 'border-indigo-500/50 bg-indigo-500/10'
                  : 'border-[#27272a] hover:border-[#3f3f46] bg-[#131316]'
              } disabled:cursor-default`}
              data-testid={`soft-delete-${opt.value}`}
            >
              <span
                className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                  behavior === opt.value ? 'border-indigo-400 bg-indigo-500/30' : 'border-zinc-600'
                }`}
              >
                {behavior === opt.value && <Check className="w-3 h-3 text-indigo-300" />}
              </span>
              <span>
                <span className="block text-sm text-white">{opt.title}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{opt.detail}</span>
              </span>
              {saving && behavior !== opt.value && opt.value === 'silent' ? null : null}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs h-5">
          {saving && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span className="text-gray-400">Saving…</span>
            </>
          )}
          {!saving && savedAt && <span className="text-green-400">Saved at {savedAt}</span>}
          {!saving && error && <span className="text-red-400">{error}</span>}
        </div>
      </section>
    </div>
  )
}
