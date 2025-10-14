import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageContainer from '@/components/layout/PageContainer'
import { CalendarClock, CheckCircle2, RefreshCw, RotateCw, Search, Timer, XCircle } from 'lucide-react'

const SAMPLE_TASKS = [
  {
    id: 'tsk-1024',
    name: 'Обновление витрины продаж',
    type: 'extraction',
    status: 'finished',
    startedAt: '2024-02-11T08:00:00Z',
    finishedAt: '2024-02-11T08:04:30Z',
    durationMs: 270000,
    records: 128_450,
    author: 'Мария Иванова',
  },
  {
    id: 'tsk-1025',
    name: 'Репликация CRM → DWH',
    type: 'replication',
    status: 'failed',
    startedAt: '2024-02-11T09:10:00Z',
    finishedAt: '2024-02-11T09:12:10Z',
    durationMs: 130000,
    records: 45_230,
    author: 'Дмитрий Кузнецов',
    error: 'Превышен лимит запросов к API CRM',
  },
  {
    id: 'tsk-1026',
    name: 'Пересчёт прогноза спроса',
    type: 'analytics',
    status: 'running',
    startedAt: '2024-02-11T09:45:00Z',
    durationMs: 420000,
    records: 9_800,
    author: 'Екатерина Петрова',
  },
  {
    id: 'tsk-1027',
    name: 'Инкрементальная загрузка логов',
    type: 'extraction',
    status: 'queued',
    startedAt: '2024-02-11T10:00:00Z',
    author: 'Система',
  },
]

const STATUS_CONFIG = {
  finished: { label: 'Завершено', className: 'bg-emerald-100 text-emerald-600' },
  running: { label: 'Выполняется', className: 'bg-amber-100 text-amber-600' },
  failed: { label: 'Ошибка', className: 'bg-rose-100 text-rose-600' },
  queued: { label: 'В очереди', className: 'bg-slate-200 text-slate-600' },
}

const TYPE_LABELS = {
  extraction: 'Загрузка данных',
  replication: 'Репликация',
  analytics: 'Аналитика',
}

function formatDuration(ms) {
  if (!ms) return '—'
  const minutes = Math.floor(ms / 1000 / 60)
  const seconds = Math.floor(ms / 1000) % 60
  if (minutes === 0) {
    return `${seconds} с`
  }
  return `${minutes} мин ${seconds.toString().padStart(2, '0')} с`
}

function formatDate(value) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    return date.toLocaleString('ru-RU')
  } catch (error) {
    return value
  }
}

export default function TaskHistory() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')

  const filteredTasks = useMemo(() => {
    return SAMPLE_TASKS.filter((task) => {
      const matchesSearch = search
        ? task.name.toLowerCase().includes(search.toLowerCase()) ||
          task.id.toLowerCase().includes(search.toLowerCase())
        : true
      const matchesStatus = status === 'all' ? true : task.status === status
      const matchesType = type === 'all' ? true : task.type === type
      return matchesSearch && matchesStatus && matchesType
    })
  }, [search, status, type])

  const finishedCount = filteredTasks.filter((task) => task.status === 'finished').length
  const failedCount = filteredTasks.filter((task) => task.status === 'failed').length
  const runningCount = filteredTasks.filter((task) => task.status === 'running').length

  return (
    <PageContainer>
      <div className="space-y-8">
        <header className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-900 to-violet-900 p-8 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs uppercase tracking-wide">
                <RotateCw className="h-4 w-4" aria-hidden />
                {t('navigation.history')}
              </div>
              <h1 className="text-3xl font-semibold leading-tight">
                Мониторинг фоновых заданий и обработок данных
              </h1>
              <p className="max-w-2xl text-sm text-slate-200">
                Используйте поиск и фильтры, чтобы быстро отследить статус, длительность и результаты выполнения задач.
              </p>
            </div>
            <Button variant="secondary" className="gap-2 bg-white/10 text-white hover:bg-white/20">
              <RefreshCw className="h-4 w-4" aria-hidden />
              Обновить список
            </Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-none bg-white/70 p-5 shadow-sm dark:bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Успешно</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{finishedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden />
            </div>
          </Card>
          <Card className="border-none bg-white/70 p-5 shadow-sm dark:bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ошибки</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{failedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-rose-500" aria-hidden />
            </div>
          </Card>
          <Card className="border-none bg-white/70 p-5 shadow-sm dark:bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">В работе</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{runningCount}</p>
              </div>
              <Timer className="h-8 w-8 text-amber-500" aria-hidden />
            </div>
          </Card>
        </section>

        <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
          <CardHeader className="space-y-4 px-6 py-5">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
              Фильтры и поиск
            </CardTitle>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Найдите задачу по названию или идентификатору"
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={() => { setSearch(''); setStatus('all'); setType('all') }} className="gap-2">
                <RefreshCw className="h-4 w-4" aria-hidden />
                Сбросить фильтры
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Статус</p>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    onClick={() => setStatus('all')}
                    className={`cursor-pointer px-3 py-1 text-xs transition ${
                      status === 'all'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Все
                  </Badge>
                  {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                    <Badge
                      key={value}
                      onClick={() => setStatus(value)}
                      className={`cursor-pointer px-3 py-1 text-xs transition ${
                        status === value
                          ? 'bg-indigo-500 text-white shadow dark:bg-indigo-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {config.label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Тип</p>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    onClick={() => setType('all')}
                    className={`cursor-pointer px-3 py-1 text-xs transition ${
                      type === 'all'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Все
                  </Badge>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <Badge
                      key={value}
                      onClick={() => setType(value)}
                      className={`cursor-pointer px-3 py-1 text-xs transition ${
                        type === value
                          ? 'bg-indigo-500 text-white shadow dark:bg-indigo-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-0">
            <ScrollArea className="h-[420px] px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Старт</TableHead>
                    <TableHead>Длительность</TableHead>
                    <TableHead>Строк обработано</TableHead>
                    <TableHead>Автор</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium text-slate-800 dark:text-slate-100">{task.id}</TableCell>
                      <TableCell>{task.name}</TableCell>
                      <TableCell>{TYPE_LABELS[task.type] ?? task.type}</TableCell>
                      <TableCell>
                        <Badge className={`rounded-full px-3 py-1 text-xs ${STATUS_CONFIG[task.status]?.className ?? ''}`}>
                          {STATUS_CONFIG[task.status]?.label ?? task.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(task.startedAt)}</TableCell>
                      <TableCell>{formatDuration(task.durationMs)}</TableCell>
                      <TableCell>{new Intl.NumberFormat('ru-RU').format(task.records ?? 0)}</TableCell>
                      <TableCell>{task.author}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {filteredTasks.some((task) => task.error) ? (
          <Alert variant="destructive" className="border-none bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertDescription className="flex items-center gap-2 text-sm">
              <XCircle className="h-4 w-4" aria-hidden />
              Есть задачи с ошибками. Проверьте логи и попробуйте повторить выполнение.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
              Хронология действий
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="space-y-4">
              {SAMPLE_TASKS.map((task) => (
                <div key={task.id} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <CalendarClock className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{task.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(task.startedAt)} • {STATUS_CONFIG[task.status]?.label ?? task.status}
                    </p>
                    {task.error ? (
                      <p className="text-xs text-rose-500">Ошибка: {task.error}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
