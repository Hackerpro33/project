import React, { useCallback, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  BarChart3,
  Component,
  Database,
  FileDiff,
  History,
  Home,
  Map,
  MessageSquare,
  Network,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'

import { createPageUrl } from '@/utils'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import CommandMenu from '@/components/navigation/CommandMenu.jsx'
import ThemeToggle from '@/components/navigation/ThemeToggle.jsx'
import { useFeatureFlag } from '@/contexts/FeatureFlagContext.jsx'
import { useHotkeys } from '@/hooks/useHotkeys'

const navigationConfig = [
  { translationKey: 'navigation.dashboard', page: 'Dashboard', icon: Home, gradient: 'from-emerald-500 to-teal-600' },
  { translationKey: 'navigation.assistant', page: 'Assistant', icon: MessageSquare, gradient: 'from-violet-500 to-purple-600' },
  { translationKey: 'navigation.sources', page: 'DataSources', icon: Database, gradient: 'from-blue-500 to-cyan-600' },
  {
    translationKey: 'navigation.versions',
    page: 'DatasetVersions',
    icon: FileDiff,
    gradient: 'from-indigo-500 to-blue-600',
  },
  { translationKey: 'navigation.transformation', page: 'DataTransformation', icon: RefreshCw, gradient: 'from-green-500 to-emerald-600' },
  { translationKey: 'navigation.maps', page: 'Maps', icon: Map, gradient: 'from-purple-500 to-indigo-600' },
  { translationKey: 'navigation.charts', page: 'Charts', icon: BarChart3, gradient: 'from-orange-500 to-red-600' },
  { translationKey: 'navigation.forecasting', page: 'Forecasting', icon: TrendingUp, gradient: 'from-pink-500 to-rose-600' },
  { translationKey: 'navigation.networks', page: 'NetworkGraphs', icon: Network, gradient: 'from-cyan-500 to-blue-600' },
  { translationKey: 'navigation.constructor', page: 'Constructor', icon: Component, gradient: 'from-slate-500 to-slate-600' },
  { translationKey: 'navigation.collaboration', page: 'Collaboration', icon: Users, gradient: 'from-sky-500 to-blue-600' },
  { translationKey: 'navigation.settings', page: 'Settings', icon: SettingsIcon, gradient: 'from-gray-500 to-slate-600' },
  {
    translationKey: 'navigation.advanced',
    page: 'AdvancedAnalytics',
    icon: ShieldCheck,
    gradient: 'from-blue-600 to-purple-600',
    featureFlag: 'advanced_analytics',
  },
  {
    translationKey: 'navigation.history',
    page: 'TaskHistory',
    icon: History,
    gradient: 'from-amber-500 to-orange-600',
  },
]

function NavigationMenu({ items, currentPath, label }) {
  return (
    <SidebarMenu className="space-y-2" role="menu" aria-label={label}>
      {items.map((item) => {
        const isActive = currentPath === item.url
        return (
          <SidebarMenuItem key={item.url} role="none">
            <SidebarMenuButton asChild>
              <Link
                to={item.url}
                className={`nav-item flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 elegant-text ${
                  isActive
                    ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg shadow-blue-500/25`
                    : 'text-slate-200 hover:text-white hover:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700/60'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="w-5 h-5" aria-hidden />
                <span className="font-medium">{item.title}</span>
                {isActive ? (
                  <span
                    className="ml-auto inline-flex h-2 w-2 animate-pulse rounded-full bg-white"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const [isCommandOpen, setIsCommandOpen] = useState(false)
  const advancedAnalyticsEnabled = useFeatureFlag('advanced_analytics', false)

  const languageValue = i18n.language?.startsWith('en') ? 'en' : 'ru'

  const navigationItems = useMemo(() => {
    return navigationConfig
      .filter((item) => !item.featureFlag || (item.featureFlag === 'advanced_analytics' && advancedAnalyticsEnabled))
      .map((item) => ({
        ...item,
        title: t(item.translationKey),
        url: createPageUrl(item.page),
      }))
  }, [advancedAnalyticsEnabled, t])

  const commandItems = useMemo(
    () =>
      navigationItems.map((item) => ({
        title: item.title,
        url: item.url,
      })),
    [navigationItems]
  )

  const toggleLanguage = useCallback(() => {
    const nextLanguage = languageValue === 'en' ? 'ru' : 'en'
    i18n.changeLanguage(nextLanguage)
  }, [i18n, languageValue])

  useHotkeys(
    [
      { combo: 'ctrl+k', handler: () => setIsCommandOpen(true) },
      { combo: 'meta+k', handler: () => setIsCommandOpen(true) },
      { combo: 'ctrl+shift+l', handler: toggleLanguage },
      { combo: 'meta+shift+l', handler: toggleLanguage },
    ],
    [toggleLanguage]
  )

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900 dark:focus:bg-slate-800 dark:focus:text-slate-100"
      >
        {t('a11y.skipToContent')}
      </a>

      <style>{`
        :root {
          --gradient-mesh: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          --glass-bg: rgba(255, 255, 255, 0.08);
          --glass-border: rgba(255, 255, 255, 0.12);
        }

        .glass-effect {
          backdrop-filter: blur(20px);
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
        }

        .nav-item {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .nav-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }

        .gradient-text {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .elegant-text {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          letter-spacing: -0.02em;
          line-height: 1.5;
        }

        .heading-text {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          letter-spacing: -0.03em;
          font-weight: 700;
        }
      `}</style>

      <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-slate-900 transition-colors dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
        <Sidebar className="border-none bg-slate-900/95 text-slate-100 backdrop-blur-xl dark:bg-slate-900/90" aria-label={t('navigation.sectionTitle')}>
          <SidebarHeader className="border-b border-slate-700/50 p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
                <div className="flex items-center gap-3">
                  <div className="relative" aria-hidden>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-blue-500 shadow-lg">
                      <Activity className="h-6 w-6 text-white" />
                    </div>
                    <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-pink-400 to-purple-500">
                      <Sparkles className="h-2 w-2 text-white" />
                    </div>
                  </div>
                  <div>
                    <h2 className="gradient-text text-lg font-bold elegant-text">{t('app.brand')}</h2>
                    <p className="elegant-text text-xs text-slate-300">{t('app.tagline')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden md:block">
                    <ThemeToggle />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCommandOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-100 dark:border-slate-200/40 dark:bg-slate-700/60 dark:text-slate-100 dark:hover:bg-slate-600/60"
                    aria-haspopup="dialog"
                    aria-controls="command-menu"
                    aria-label={t('hotkeys.openPalette')}
                    title={`${t('hotkeys.openPalette')} (Ctrl + K)`}
                  >
                    <span aria-hidden>⌘K</span>
                    <span className="sr-only">{t('hotkeys.openPalette')}</span>
                    <span aria-hidden className="font-medium tracking-wide">{t('hotkeys.commandButton')}</span>
                  </button>
                  <label className="sr-only" htmlFor="language-select">
                    {t('language.label')}
                  </label>
                  <Select value={languageValue} onValueChange={(value) => i18n.changeLanguage(value)}>
                    <SelectTrigger
                      id="language-select"
                      className="w-28 bg-slate-800/70 border-slate-700 text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-100"
                      aria-label={t('language.label')}
                    >
                      <SelectValue placeholder={t('language.ru')} />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 text-slate-200">
                      <SelectItem value="ru">{t('language.ru')}</SelectItem>
                      <SelectItem value="en">{t('language.en')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="relative flex items-center justify-between">
                <SidebarTrigger className="md:hidden" aria-label={t('navigation.toggleSidebar')} />
                <div className="md:hidden">
                  <ThemeToggle enableHotkeys={false} />
                </div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-4" asChild>
            <nav aria-label={t('navigation.sectionTitle')}>
              <SidebarGroup>
                <SidebarGroupLabel className="elegant-text px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {t('navigation.sectionTitle')}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <NavigationMenu
                    items={navigationItems}
                    currentPath={location.pathname}
                    label={t('navigation.sectionTitle')}
                  />
                </SidebarGroupContent>
              </SidebarGroup>

              <div className="mt-8 rounded-xl border border-slate-700/40 bg-gradient-to-r from-slate-800 to-slate-700 p-4" role="complementary" aria-label={t('hotkeys.title')}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-green-400 to-blue-500">
                    <TrendingUp className="h-4 w-4 text-white" aria-hidden />
                  </div>
                  <div>
                    <p className="elegant-text text-sm font-medium text-white">{t('hotkeys.title')}</p>
                    <p className="elegant-text text-xs text-slate-300">{t('hotkeys.subtitle')}</p>
                  </div>
                </div>
                <dl className="space-y-2 text-xs text-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t('hotkeys.openPalette')}</dt>
                    <dd aria-label={t('hotkeys.openPalette')} className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">Ctrl</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">K</kbd>
                      </span>
                      <span aria-hidden className="text-slate-400">/</span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">⌘</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">K</kbd>
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t('hotkeys.theme')}</dt>
                    <dd aria-label={t('hotkeys.theme')} className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">Ctrl</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">Shift</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">T</kbd>
                      </span>
                      <span aria-hidden className="text-slate-400">/</span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">⌘</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">Shift</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">T</kbd>
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t('hotkeys.language')}</dt>
                    <dd aria-label={t('hotkeys.language')} className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">Ctrl</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">Shift</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">L</kbd>
                      </span>
                      <span aria-hidden className="text-slate-400">/</span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">⌘</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">Shift</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-slate-900/70 px-2 py-1 font-semibold">L</kbd>
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            </nav>
          </SidebarContent>
        </Sidebar>

        <main id="main-content" className="flex flex-1 flex-col" role="main" tabIndex={-1}>
          <header className="border-b border-white/20 bg-white/70 px-6 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/70 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                className="rounded-lg p-2 transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={t('navigation.toggleSidebar')}
              />
              <h1 className="heading-text text-xl font-bold text-orange-600 dark:text-orange-300">{currentPageName}</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto" role="presentation">
            {children}
          </div>
        </main>
      </div>

      <CommandMenu
        open={isCommandOpen}
        onOpenChange={setIsCommandOpen}
        items={commandItems}
      />
    </SidebarProvider>
  )
}
