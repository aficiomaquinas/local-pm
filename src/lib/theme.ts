export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'local-pm:theme'

export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var pref = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (pref === 'light' || pref === 'dark') {
      document.documentElement.setAttribute('data-theme', pref);
    }
  } catch (e) {}
})();
`.trim()

export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement
  if (pref === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', pref)
  }
  try {
    if (pref === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
  }
}

export function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
  }
  return 'system'
}
