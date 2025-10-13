import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { MoonStar, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function ThemeToggle() {
  const { theme, systemTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const resolvedTheme = useMemo(() => {
    if (!mounted) return 'light'
    if (theme === 'system') {
      return systemTheme || 'light'
    }
    return theme
  }, [mounted, theme, systemTheme])

  const isDark = resolvedTheme === 'dark'

  const handleToggle = () => {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      className="text-slate-200 hover:text-white dark:text-slate-200"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      data-tour="theme-toggle"
    >
      {mounted && isDark ? (
        <Sun className="h-5 w-5" />
      ) : (
        <MoonStar className="h-5 w-5" />
      )}
    </Button>
  )
}
