import { MoonStar, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/contexts/ThemeContext.jsx'

export default function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="text-slate-200 hover:text-white dark:text-slate-200"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      data-tour="theme-toggle"
    >
      {isDark ? <Sun className="h-5 w-5" /> : <MoonStar className="h-5 w-5" />}
    </Button>
  )
}
