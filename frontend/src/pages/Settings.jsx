import React, { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import PageContainer from "@/components/layout/PageContainer"
import { Activity, Cpu, Database, HardDrive, Server, ShieldCheck, User, UserCog } from "lucide-react"

import AIModelSettings from "../components/settings/AIModelSettings"
import BiasAuditCenter from "../components/settings/BiasAuditCenter"
import DataManagement from "../components/settings/DataManagement"
import SystemLogs from "../components/settings/SystemLogs"
import SystemMonitor from "../components/settings/SystemMonitor"
import UserManagement from "../components/settings/UserManagement"
import UserPreferencesPanel from "../components/settings/UserPreferencesPanel"

export default function Settings() {
  const [activeTab, setActiveTab] = useState("preferences")
  const [systemStats] = useState({
    totalDatasets: 0,
    totalVisualizations: 0,
    storageUsed: 0,
    activeUsers: 1,
  })

  const settingsTabs = [
    {
      id: "preferences",
      label: "Профиль",
      icon: UserCog,
    },
    {
      id: "modules",
      label: "Локальные алгоритмы",
      icon: Cpu,
    },
    {
      id: "data",
      label: "Управление данными",
      icon: Database,
    },
    {
      id: "logs",
      label: "Логи системы",
      icon: Activity,
    },
    {
      id: "monitor",
      label: "Мониторинг",
      icon: Server,
    },
    {
      id: "audit",
      label: "Аудит алгоритмов",
      icon: ShieldCheck,
    },
    {
      id: "users",
      label: "Пользователи",
      icon: User,
    },
  ]

  return (
    <PageContainer className="space-y-8">
      <div className="space-y-4 text-center">
        <h1 className="heading-text bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-4xl font-bold text-transparent dark:from-white dark:via-blue-200 dark:to-purple-200">
          Настройки системы
        </h1>
        <p className="elegant-text mx-auto max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          Управляйте локальными алгоритмами, данными, мониторингом и другими параметрами системы
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg dark:bg-slate-900/60">
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600">
              <Database className="h-6 w-6 text-white" />
            </div>
            <div className="heading-text text-2xl font-bold text-slate-900 dark:text-white">{systemStats.totalDatasets}</div>
            <div className="elegant-text text-sm text-slate-600 dark:text-slate-300">Наборов данных</div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg dark:bg-slate-900/60">
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div className="heading-text text-2xl font-bold text-slate-900 dark:text-white">{systemStats.totalVisualizations}</div>
            <div className="elegant-text text-sm text-slate-600 dark:text-slate-300">Визуализаций</div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg dark:bg-slate-900/60">
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600">
              <HardDrive className="h-6 w-6 text-white" />
            </div>
            <div className="heading-text text-2xl font-bold text-slate-900 dark:text-white">{systemStats.storageUsed}GB</div>
            <div className="elegant-text text-sm text-slate-600 dark:text-slate-300">Использовано места</div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg dark:bg-slate-900/60">
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-red-600">
              <User className="h-6 w-6 text-white" />
            </div>
            <div className="heading-text text-2xl font-bold text-slate-900 dark:text-white">{systemStats.activeUsers}</div>
            <div className="elegant-text text-sm text-slate-600 dark:text-slate-300">Активных пользователей</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg dark:bg-slate-900/60">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-8 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
              {settingsTabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex flex-col items-center gap-2 rounded-xl bg-white/60 p-4 text-xs transition data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white dark:bg-slate-900/60"
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="hidden sm:block">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="preferences" className="mt-0">
              <UserPreferencesPanel />
            </TabsContent>

            <TabsContent value="modules" className="mt-0">
              <AIModelSettings />
            </TabsContent>

            <TabsContent value="data" className="mt-0">
              <DataManagement />
            </TabsContent>

            <TabsContent value="logs" className="mt-0">
              <SystemLogs />
            </TabsContent>

            <TabsContent value="monitor" className="mt-0">
              <SystemMonitor />
            </TabsContent>

            <TabsContent value="audit" className="mt-0">
              <BiasAuditCenter />
            </TabsContent>

            <TabsContent value="users" className="mt-0">
              <UserManagement />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </PageContainer>
  )
}
