import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useTheme } from 'next-themes'
import { MoonStar, SunMedium } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useHotkeys } from '@/hooks/useHotkeys'

const HOTKEYS = ['ctrl+shift+t', 'meta+shift+t']

export default function ThemeToggle({ enableHotkeys = true }) {
  const { setTheme, resolvedTheme } = useTheme()
  const { t } = useTranslation()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
  }

  useHotkeys(
    enableHotkeys ? HOTKEYS.map((combo) => ({ combo, handler: toggleTheme })) : [],
    [resolvedTheme, enableHotkeys]
  )

  const icon = useMemo(() => {
    if (!isMounted) {
      return <MoonStar className="h-4 w-4" aria-hidden />
    }

    return resolvedTheme === 'dark' ? (
      <SunMedium className="h-4 w-4" aria-hidden />
    ) : (
      <MoonStar className="h-4 w-4" aria-hidden />
    )
  }, [isMounted, resolvedTheme])

  const label = isMounted
    ? resolvedTheme === 'dark'
      ? t('theme.switchToLight')
      : t('theme.switchToDark')
    : t('theme.toggleLabel')

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-100 dark:border-slate-200/40 dark:bg-slate-700/60 dark:text-slate-100 dark:hover:bg-slate-600/60"
      aria-label={t('theme.toggleAria')}
      title={`${label} (${HOTKEYS[0].split('+').join(' + ').toUpperCase()})`}
      data-testid="theme-toggle"
    >
      {icon}
      <span className="sr-only" data-testid="theme-toggle-label">
        {t('theme.toggleAria')}
      </span>
      <span aria-hidden>{label}</span>
    </button>
  )
}

ThemeToggle.propTypes = {
  enableHotkeys: PropTypes.bool,
}
