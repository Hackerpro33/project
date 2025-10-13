import React, { useMemo } from 'react'
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

import ThemeToggle from '@/components/common/ThemeToggle'
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
import { useFeatureFlag } from '@/contexts/FeatureFlagContext.jsx'
import { createPageUrl } from '@/utils'

const navigationConfig = [
  {
    key: 'navigation.dashboard',
    page: 'Dashboard',
    icon: Home,
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    key: 'navigation.assistant',
    page: 'Assistant',
    icon: MessageSquare,
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    key: 'navigation.sources',
    page: 'DataSources',
    icon: Database,
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    key: 'navigation.transformation',
    page: 'DataTransformation',
    icon: RefreshCw,
    gradient: 'from-green-500 to-emerald-600',
  },
  {
    key: 'navigation.maps',
    page: 'Maps',
    icon: Map,
    gradient: 'from-purple-500 to-indigo-600',
  },
  {
    key: 'navigation.charts',
    page: 'Charts',
    icon: BarChart3,
    gradient: 'from-orange-500 to-red-600',
  },
  {
    key: 'navigation.forecasting',
    page: 'Forecasting',
    icon: TrendingUp,
    gradient: 'from-pink-500 to-rose-600',
  },
  {
    key: 'navigation.networks',
    page: 'NetworkGraphs',
    icon: Network,
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    key: 'navigation.constructor',
    page: 'Constructor',
    icon: Component,
    gradient: 'from-slate-500 to-slate-600',
  },
  {
    key: 'navigation.taskHistory',
    page: 'TaskHistory',
    icon: History,
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    key: 'navigation.datasetVersions',
    page: 'DatasetVersions',
    icon: FileDiff,
    gradient: 'from-indigo-500 to-blue-600',
  },
  {
    key: 'navigation.collaboration',
    page: 'Collaboration',
    icon: Users,
    gradient: 'from-sky-500 to-blue-600',
  },
  {
    key: 'navigation.settings',
    page: 'Settings',
    icon: SettingsIcon,
    gradient: 'from-gray-500 to-slate-600',
  },
  {
    key: 'navigation.advanced',
    page: 'AdvancedAnalytics',
    icon: ShieldCheck,
    gradient: 'from-blue-600 to-purple-600',
    featureFlag: 'advanced_analytics',
  },
]

export default function Layout({ children }) {
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const languageValue = i18n.language?.startsWith('en') ? 'en' : 'ru'
  const advancedAnalyticsEnabled = useFeatureFlag('advanced_analytics', false)

  const navigationItems = useMemo(
    () =>
      navigationConfig
        .map((item) => ({
          ...item,
          title: t(item.key),
          url: createPageUrl(item.page),
        }))
        .filter((item) => {
          if (!item.featureFlag) return true
          if (item.featureFlag === 'advanced_analytics') {
            return advancedAnalyticsEnabled
          }
          return true
        }),
    [advancedAnalyticsEnabled, t]
  )

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 transition-colors dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
        <Sidebar className="border-none bg-slate-900/95 backdrop-blur-xl dark:bg-slate-950/90">
          <SidebarHeader className="border-b border-slate-700/40 p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-blue-500 shadow-lg">
                      <Activity className="h-6 w-6 text-white" />
                    </div>
                    <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-pink-400 to-purple-500">
                      <Sparkles className="h-2 w-2 text-white" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-orange-400">{t('app.brand')}</h2>
                    <p className="text-xs text-slate-400">{t('app.tagline')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <Select value={languageValue} onValueChange={(value) => i18n.changeLanguage(value)}>
                    <SelectTrigger className="w-28 bg-slate-800/70 border-slate-700 text-slate-200">
                      <SelectValue placeholder={t('language.ru')} />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 text-slate-200">
                      <SelectItem value="ru">{t('language.ru')}</SelectItem>
                      <SelectItem value="en">{t('language.en')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <SidebarTrigger className="md:hidden" />
                </div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-4" data-tour="sidebar-navigation">
            <SidebarGroup>
              <SidebarGroupLabel className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {t('navigation.sectionTitle')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-2">
                  {navigationItems.map((item) => {
                    const isActive = location.pathname === item.url
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton asChild>
                          <Link
                            to={item.url}
                            className={`nav-item flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${
                              isActive
                                ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg shadow-blue-500/25`
                                : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                            }`}
                          >
                            <item.icon className="h-5 w-5" />
                            <span className="font-medium">{item.title}</span>
                            {isActive && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-white" />}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <div className="mt-8 rounded-xl border border-slate-600/40 bg-gradient-to-r from-slate-800 to-slate-700 p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-green-400 to-blue-500">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{t('dashboard.taskStatus.sidebarTitle')}</p>
                  <p className="text-xs text-slate-300">{t('dashboard.taskStatus.sidebarDescription')}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs text-slate-200">
                <div className="flex justify-between">
                  <span>{t('dashboard.taskStatus.sidebarModel')}</span>
                  <span className="font-medium text-green-300">94.2%</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('dashboard.taskStatus.sidebarDataPoints')}</span>
                  <span className="font-medium text-blue-300">1.2M</span>
                </div>
              </div>
            </div>
          </SidebarContent>
        </Sidebar>

        <main className="flex flex-1 flex-col">
          <header className="border-b border-white/20 bg-white/70 px-6 py-4 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/60 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="rounded-lg p-2 transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800" />
              <h1 className="text-xl font-bold text-orange-600 dark:text-orange-300">{t('app.brand')}</h1>
            </div>
          </header>
          <div className="flex-1 overflow-auto px-4 py-6 md:px-8 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
