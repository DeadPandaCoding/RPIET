import { getThemePref, type ThemePref } from './prefs'

export type ResolvedTheme = 'light' | 'dark'

/** Resolves a preference to an actual theme ('system' consults the OS). */
export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'system') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  }
  return pref
}

/** Toggles the `.dark` class on <html> to match the resolved theme. */
export function applyTheme(pref: ThemePref): void {
  document.documentElement.classList.toggle('dark', resolveTheme(pref) === 'dark')
}

/**
 * Applies the saved theme once on startup and keeps it in sync:
 * - when the preference changes (toggle / Settings),
 * - when the OS scheme changes while the preference is 'system'.
 */
export function initTheme(): void {
  applyTheme(getThemePref())
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onPrefChange = (e: Event) => applyTheme((e as CustomEvent<ThemePref>).detail)
  const onSystemChange = () => {
    if (getThemePref() === 'system') applyTheme('system')
  }
  window.addEventListener('pl:themeChanged', onPrefChange)
  mq.addEventListener('change', onSystemChange)
}
