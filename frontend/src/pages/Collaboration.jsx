import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import PageContainer from '@/components/layout/PageContainer'
import {
  CalendarCheck2,
  Link as LinkIcon,
  Mail,
  Share2,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'

const TEAM_MEMBERS = [
  { name: 'Мария Иванова', role: 'Аналитик', status: 'online' },
  { name: 'Алексей Смирнов', role: 'Руководитель продукта', status: 'busy' },
  { name: 'Екатерина Петрова', role: 'Data Scientist', status: 'offline' },
  { name: 'Дмитрий Кузнецов', role: 'Инженер данных', status: 'online' },
  { name: 'Ольга Лебедева', role: 'Customer Success', status: 'online' },
]

const ACCESS_POLICIES = [
  {
    id: 'finance-deck',
    name: 'Финансовая витрина',
    description: 'Доступ к отчётам по выручке, ARR и показателям удержания.',
    lastUpdated: 'Обновлено вчера',
  },
  {
    id: 'ml-sandbox',
    name: 'Песочница ML',
    description: 'Совместная работа над моделями прогнозирования спроса.',
    lastUpdated: 'Обновлено 3 часа назад',
  },
]

const RECENT_UPDATES = [
  {
    id: 1,
    title: 'Датасет «Продажи за 2024 год» обновлён',
    description: 'Добавлены новые показатели для сегмента EMEA и обновлены SLA.',
    time: '20 минут назад',
  },
  {
    id: 2,
    title: 'Создана рабочая группа «Logistics Pulse»',
    description: 'Команда из 5 человек отслеживает SLA поставок и задержки.',
    time: '2 часа назад',
  },
]

const INVITES = [
  { id: 1, email: 'irina@company.ru', role: 'Аналитик', status: 'Ожидает подтверждения' },
  { id: 2, email: 'max@company.ru', role: 'Дата-инженер', status: 'Отправлено' },
]

function MemberStatus({ status }) {
  const statusConfig = {
    online: { label: 'В сети', className: 'bg-emerald-100 text-emerald-600' },
    busy: { label: 'Занят', className: 'bg-amber-100 text-amber-600' },
    offline: { label: 'Не в сети', className: 'bg-slate-200 text-slate-600' },
  }

  const config = statusConfig[status] ?? statusConfig.offline

  return <Badge className={`rounded-full px-3 py-1 text-xs ${config.className}`}>{config.label}</Badge>
}

export default function Collaboration() {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')

  const filteredMembers = useMemo(() => {
    if (!searchTerm) return TEAM_MEMBERS
    return TEAM_MEMBERS.filter((member) =>
      member.name.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }, [searchTerm])

  return (
    <PageContainer>
      <div className="space-y-8">
        <header className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-8 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs uppercase tracking-wide">
                <Users className="h-4 w-4" aria-hidden />
                {t('navigation.collaboration')}
              </div>
              <h1 className="text-3xl font-semibold leading-tight">
                Совместная работа над аналитикой и датасетами
              </h1>
              <p className="max-w-xl text-sm text-slate-200">
                Приглашайте коллег, контролируйте доступ и отслеживайте активность команд в одном месте.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
                <UserPlus className="h-4 w-4" aria-hidden />
                Пригласить участника
              </Button>
              <Button variant="secondary" className="gap-2 bg-white/10 text-white hover:bg-white/20">
                <Share2 className="h-4 w-4" aria-hidden />
                Поделиться витриной
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card className="border-none bg-white/70 p-0 shadow-sm dark:bg-slate-900/60">
            <CardHeader className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
              <div>
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                  Команда продукта
                </CardTitle>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  Управляйте доступом и ролями, следите за статусом коллег.
                </p>
              </div>
              <div className="w-full max-w-xs">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Поиск по имени"
                  className="bg-white/60"
                />
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredMembers.map((member) => (
                  <div
                    key={member.name}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <Avatar>
                      <AvatarFallback>{member.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{member.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">{member.role}</p>
                      <MemberStatus status={member.status} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-white/70 p-0 shadow-sm dark:bg-slate-900/60">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                Последние события
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ScrollArea className="h-64 px-6">
                <ul className="space-y-4">
                  {RECENT_UPDATES.map((item) => (
                    <li key={item.id} className="rounded-2xl bg-indigo-50/60 p-4 dark:bg-indigo-950/30">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                      <p className="mt-2 text-xs uppercase tracking-wide text-indigo-500">{item.time}</p>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="access" className="space-y-4">
          <TabsList className="rounded-2xl bg-white/70 p-1 backdrop-blur dark:bg-slate-900/60">
            <TabsTrigger value="access" className="rounded-xl px-4 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Политики доступа
            </TabsTrigger>
            <TabsTrigger value="invites" className="rounded-xl px-4 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Приглашения
            </TabsTrigger>
          </TabsList>

          <TabsContent value="access" className="space-y-4">
            {ACCESS_POLICIES.map((policy) => (
              <Card key={policy.id} className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
                <CardHeader className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                  <div>
                    <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                      {policy.name}
                    </CardTitle>
                    <p className="text-sm text-slate-500 dark:text-slate-300">{policy.description}</p>
                  </div>
                  <Badge variant="outline" className="border-emerald-200 text-emerald-600 dark:border-emerald-600 dark:text-emerald-300">
                    {policy.lastUpdated}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3 px-6 pb-6 text-sm text-slate-600 dark:text-slate-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden />
                  Роли: Аналитики, PM, Data Science • Разрешено: чтение, экспорт, комментирование
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="invites">
            <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
              <CardHeader className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    Пригласить по почте
                  </CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Отправьте приглашение или сгенерируйте ссылку с ограничением по времени.
                  </p>
                </div>
                <Button className="gap-2">
                  <LinkIcon className="h-4 w-4" aria-hidden />
                  Создать ссылку
                </Button>
              </CardHeader>
              <CardContent className="space-y-6 px-6 pb-6">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                  <Input placeholder="email@company.ru" className="bg-white/70" />
                  <Input placeholder="Роль" className="bg-white/70" />
                  <Button className="gap-2">
                    <Mail className="h-4 w-4" aria-hidden />
                    Отправить
                  </Button>
                </div>
                <Separator className="bg-slate-200/70 dark:bg-slate-800" />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Роль</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {INVITES.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell className="font-medium text-slate-800 dark:text-slate-100">{invite.email}</TableCell>
                        <TableCell>{invite.role}</TableCell>
                        <TableCell>{invite.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
          <CardHeader className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                Согласованный план
              </CardTitle>
              <p className="text-sm text-slate-500 dark:text-slate-300">
                Назначенные задачи и контрольные точки для команд на текущий квартал.
              </p>
            </div>
            <Button variant="secondary" className="gap-2">
              <CalendarCheck2 className="h-4 w-4" aria-hidden />
              Экспортировать в календарь
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 px-6 pb-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              <p className="font-medium text-slate-800 dark:text-slate-100">Обновление дашборда EMEA</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Дедлайн: 18 февраля • Ответственный: Мария</p>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              <p className="font-medium text-slate-800 dark:text-slate-100">Синхронизация с отделом продаж</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Дедлайн: 24 февраля • Ответственный: Алексей</p>
            </div>
            <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              <p className="font-medium text-slate-800 dark:text-slate-100">Выгрузка данных для ML-команды</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Дедлайн: 2 марта • Ответственный: Дмитрий</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
