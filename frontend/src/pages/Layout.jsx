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
import { Button } from '@/components/ui/button'
import PropTypes from 'prop-types'
import CommandMenu from '@/components/navigation/CommandMenu.jsx'
import ThemeToggle from '@/components/navigation/ThemeToggle.jsx'
import { useFeatureFlag } from '@/contexts/FeatureFlagContext.jsx'
import { useHotkeys } from '@/hooks/useHotkeys'

const navigationConfig = [
  { translationKey: 'navigation.dashboard', page: 'Dashboard', icon: Home },
  { translationKey: 'navigation.assistant', page: 'Assistant', icon: MessageSquare },
  { translationKey: 'navigation.sources', page: 'DataSources', icon: Database },
  { translationKey: 'navigation.versions', page: 'DatasetVersions', icon: FileDiff },
  { translationKey: 'navigation.transformation', page: 'DataTransformation', icon: RefreshCw },
  { translationKey: 'navigation.maps', page: 'Maps', icon: Map },
  { translationKey: 'navigation.charts', page: 'Charts', icon: BarChart3 },
  { translationKey: 'navigation.forecasting', page: 'Forecasting', icon: TrendingUp },
  { translationKey: 'navigation.networks', page: 'NetworkGraphs', icon: Network },
  { translationKey: 'navigation.constructor', page: 'Constructor', icon: Component },
  { translationKey: 'navigation.collaboration', page: 'Collaboration', icon: Users },
  { translationKey: 'navigation.settings', page: 'Settings', icon: SettingsIcon },
  {
    translationKey: 'navigation.advanced',
    page: 'AdvancedAnalytics',
    icon: ShieldCheck,
    featureFlag: 'advanced_analytics',
  },
  {
    translationKey: 'navigation.history',
    page: 'TaskHistory',
    icon: History,
  },
]

function NavigationMenu({ items, currentPath, label }) {
  return (
    <SidebarMenu role="menu" aria-label={label}>
      {items.map((item) => {
        const isActive = currentPath === item.url
        return (
          <SidebarMenuItem key={item.url} role="none">
            <SidebarMenuButton
              asChild
              isActive={isActive}
              className="px-3 py-2 text-sm font-medium"
            >
              <Link
                to={item.url}
                className="flex items-center gap-3"
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden />
                <span className="truncate">{item.title}</span>
                {isActive ? (
                  <span
                    className="ml-auto inline-flex h-2 w-2 rounded-full bg-primary-foreground"
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
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground"
      >
        {t('a11y.skipToContent')}
      </a>

      <div className="flex min-h-screen w-full bg-background text-foreground">
        <Sidebar className="hidden border-r border-border/60 bg-card/70 text-card-foreground backdrop-blur md:flex">
          <SidebarHeader className="border-b border-border/60 px-4 py-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    <Activity className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold leading-tight">{t('app.brand')}</span>
                    <span className="text-xs text-muted-foreground">{t('app.tagline')}</span>
                  </div>
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <ThemeToggle />
                  <Button
                    type="button"
                    variant="outline"
                    className="whitespace-nowrap"
                    onClick={() => setIsCommandOpen(true)}
                    aria-haspopup="dialog"
                    aria-controls="command-menu"
                    aria-label={t('hotkeys.openPalette')}
                    title={`${t('hotkeys.openPalette')} (Ctrl + K)`}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden />
                    <span>{t('hotkeys.commandButton')}</span>
                  </Button>
                  <Select value={languageValue} onValueChange={(value) => i18n.changeLanguage(value)}>
                    <SelectTrigger className="w-28" aria-label={t('language.label')} id="language-select">
                      <SelectValue placeholder={t('language.ru')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">{t('language.ru')}</SelectItem>
                      <SelectItem value="en">{t('language.en')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between md:hidden">
                <SidebarTrigger aria-label={t('navigation.toggleSidebar')} />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCommandOpen(true)}
                    aria-haspopup="dialog"
                    aria-controls="command-menu"
                    aria-label={t('hotkeys.openPalette')}
                  >
                    ⌘K
                  </Button>
                  <ThemeToggle enableHotkeys={false} />
                  <Select value={languageValue} onValueChange={(value) => i18n.changeLanguage(value)}>
                    <SelectTrigger className="w-24" aria-label={t('language.label')}>
                      <SelectValue placeholder={t('language.ru')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">{t('language.ru')}</SelectItem>
                      <SelectItem value="en">{t('language.en')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="px-3 py-5" asChild>
            <nav aria-label={t('navigation.sectionTitle')}>
              <SidebarGroup>
                <SidebarGroupLabel className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

              <div className="mt-8 rounded-lg border border-border/60 bg-card/80 p-4" role="complementary" aria-label={t('hotkeys.title')}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <TrendingUp className="h-4 w-4" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-tight text-foreground">{t('hotkeys.title')}</p>
                    <p className="text-xs text-muted-foreground">{t('hotkeys.subtitle')}</p>
                  </div>
                </div>
                <dl className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t('hotkeys.openPalette')}</dt>
                    <dd className="flex items-center gap-2" aria-label={t('hotkeys.openPalette')}>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">Ctrl</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">K</kbd>
                      </span>
                      <span aria-hidden className="text-muted-foreground">/</span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">⌘</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">K</kbd>
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t('hotkeys.theme')}</dt>
                    <dd className="flex items-center gap-2" aria-label={t('hotkeys.theme')}>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">Ctrl</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">Shift</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">T</kbd>
                      </span>
                      <span aria-hidden className="text-muted-foreground">/</span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">⌘</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">Shift</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">T</kbd>
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t('hotkeys.language')}</dt>
                    <dd className="flex items-center gap-2" aria-label={t('hotkeys.language')}>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">Ctrl</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">Shift</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">L</kbd>
                      </span>
                      <span aria-hidden className="text-muted-foreground">/</span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">⌘</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">Shift</kbd>
                        <span aria-hidden>+</span>
                        <kbd className="rounded-md bg-muted px-2 py-1 font-semibold">L</kbd>
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            </nav>
          </SidebarContent>
        </Sidebar>

        <main id="main-content" className="flex flex-1 flex-col bg-muted/10">
          <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="md:hidden" aria-label={t('navigation.toggleSidebar')} />
                <h1 className="text-lg font-semibold leading-tight text-foreground">{currentPageName}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCommandOpen(true)}
                  aria-haspopup="dialog"
                  aria-controls="command-menu"
                  aria-label={t('hotkeys.openPalette')}
                  className="hidden md:inline-flex"
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  <span>{t('hotkeys.openPalette')}</span>
                  <span className="ml-2 hidden items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground md:flex">
                    Ctrl
                    <span aria-hidden>+</span>
                    K
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setIsCommandOpen(true)}
                  aria-haspopup="dialog"
                  aria-controls="command-menu"
                  aria-label={t('hotkeys.openPalette')}
                >
                  ⌘K
                </Button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-background/70">
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

NavigationMenu.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      url: PropTypes.string.isRequired,
      icon: PropTypes.elementType.isRequired,
    })
  ).isRequired,
  currentPath: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
  currentPageName: PropTypes.string,
}

Layout.defaultProps = {
  currentPageName: '',
}
