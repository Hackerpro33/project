

import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
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
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useFeatureFlag } from "@/contexts/FeatureFlagContext.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AutoRefreshController from "@/components/layout/AutoRefreshController.jsx";
import { useAppPreferencesStore } from "@/store/appPreferences.js";

const navigationConfig = [
  {
    key: "navigation.dashboard",
    page: "Dashboard",
    id: "dashboard",
    title: "Панель управления",
    url: createPageUrl("Dashboard"),
    icon: Home,
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    key: "navigation.assistant",
    page: "Assistant",
    id: "assistant",
    title: "Аналитический ассистент",
    url: createPageUrl("Assistant"),
    icon: MessageSquare,
    gradient: "from-violet-500 to-purple-600",
  },
  {
    key: "navigation.advanced",
    page: "AdvancedAnalytics",
    icon: ShieldCheck,
    gradient: "from-blue-600 to-purple-600",
  },
  {
    key: "navigation.sources",
    page: "DataSources",
    id: "advanced-analytics",
    title: "Продвинутая аналитика",
    url: createPageUrl("AdvancedAnalytics"),
    icon: ShieldCheck,
    gradient: "from-blue-600 to-purple-600",
    featureFlag: "advanced_analytics"
  },
  {
    id: "sources",
    title: "Источники данных",
    url: createPageUrl("DataSources"),
    icon: Database,
    gradient: "from-blue-500 to-cyan-600",
  },
  {
    key: "navigation.transformation",
    page: "DataTransformation",
    id: "transformation",
    title: "Версии наборов",
    url: createPageUrl("DatasetVersions"),
    icon: FileDiff,
    gradient: "from-indigo-500 to-blue-600",
  },
  {
    title: "Преобразование данных",
    url: createPageUrl("DataTransformation"),
    icon: RefreshCw,
    gradient: "from-green-500 to-emerald-600",
  },
  {
    key: "navigation.maps",
    page: "Maps",
    title: "История задач",
    url: createPageUrl("TaskHistory"),
    icon: History,
    gradient: "from-amber-500 to-orange-600"
  },
  {
    id: "maps",
    title: "Карты",
    url: createPageUrl("Maps"),
    icon: Map,
    gradient: "from-purple-500 to-indigo-600",
  },
  {
    key: "navigation.charts",
    page: "Charts",
    id: "charts",
    title: "Графики",
    url: createPageUrl("Charts"),
    icon: BarChart3,
    gradient: "from-orange-500 to-red-600",
  },
  {
    key: "navigation.forecasting",
    page: "Forecasting",
    id: "forecasting",
    title: "Прогнозирование",
    url: createPageUrl("Forecasting"),
    icon: TrendingUp,
    gradient: "from-pink-500 to-rose-600",
  },
  {
    key: "navigation.networks",
    page: "NetworkGraphs",
    id: "network",
    title: "Графы связей",
    url: createPageUrl("NetworkGraphs"),
    icon: Network,
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    key: "navigation.constructor",
    page: "Constructor",
    id: "constructor",
    title: "Конструктор",
    url: createPageUrl("Constructor"),
    icon: Component,
    gradient: "from-slate-500 to-slate-600",
  },
  {
    key: "navigation.settings",
    page: "Settings",
    id: "settings",
    title: "Совместная работа",
    url: createPageUrl("Collaboration"),
    icon: Users,
    gradient: "from-indigo-500 to-blue-600"
    gradient: "from-sky-500 to-blue-600"
  },
  {
    title: "Настройки",
    url: createPageUrl("Settings"),
    icon: SettingsIcon,
    gradient: "from-gray-500 to-slate-600",
  },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { t } = useTranslation();
  const languageValue = useAppPreferencesStore((state) => state.language);
  const setLanguage = useAppPreferencesStore((state) => state.setLanguage);
  const navigationItems = useMemo(
    () =>
      navigationConfig.map((item) => ({
        ...item,
        title: item.key ? t(item.key) : item.title,
        url: createPageUrl(item.page),
      })),
    [t],
  );
  const advancedAnalyticsEnabled = useFeatureFlag("advanced_analytics", false);
  const filteredNavigationItems = useMemo(
    () =>
      navigationItems.filter((item) => {
        if (!item.featureFlag) {
          return true;
        }
        if (item.featureFlag === "advanced_analytics") {
          return advancedAnalyticsEnabled;
        }
        return true;
      }),
    [advancedAnalyticsEnabled, navigationItems]
  );

  return (
    <SidebarProvider>
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
      
      <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <Sidebar className="border-none bg-slate-900/95 backdrop-blur-xl">
          <SidebarHeader className="border-b border-slate-700/50 p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-r from-emerald-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                      <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full flex items-center justify-center">
                      <Sparkles className="w-2 h-2 text-white" />
                    </div>
                  </div>
                  <div>
                    <h2 className="font-bold text-lg elegant-text text-orange-400">{t('app.brand')}</h2>
                    <p className="text-xs text-slate-400 elegant-text">{t('app.tagline')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Select value={languageValue} onValueChange={setLanguage}>
                    <SelectTrigger className="w-28 bg-slate-800/70 border-slate-700 text-slate-200">
                      <SelectValue placeholder={t('language.ru')} />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 text-slate-200">
                      <SelectItem value="ru">{t('language.ru')}</SelectItem>
                      <SelectItem value="en">{t('language.en')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <AutoRefreshController />
                </div>
              </div>
              <div className="relative">
                <SidebarTrigger className="md:hidden" />
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 py-3 elegant-text">
                {t('navigation.sectionTitle')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-2">
                  {filteredNavigationItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <Link 
                            to={item.url} 
                            className={`nav-item flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 elegant-text ${
                              isActive 
                                ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg shadow-blue-500/25`
                                : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                            }`}
                          >
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.title}</span>
                            {isActive && (
                              <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <div className="mt-8 p-4 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm elegant-text">Локальная аналитика</p>
                  <p className="text-slate-400 text-xs elegant-text">на базе ML</p>
                </div>
              </div>
              <div className="space-y-2 text-xs elegant-text">
                <div className="flex justify-between text-slate-300">
                  <span>Точность модели</span>
                  <span className="text-green-300 font-medium">94.2%</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Точек данных</span>
                  <span className="text-blue-300 font-medium">1.2M</span>
                </div>
              </div>
            </div>
          </SidebarContent>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white/70 backdrop-blur-xl border-b border-white/20 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200" />
              <h1 className="text-xl font-bold heading-text text-orange-600">Анализатор</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

