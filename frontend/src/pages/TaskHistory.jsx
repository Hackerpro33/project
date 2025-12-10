import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageContainer from '@/components/layout/PageContainer'
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  Timer,
  XCircle,
} from 'lucide-react'
import { useTaskDetailQuery, useTaskHistoryQuery, useTaskPreviewQuery } from '@/hooks/tasks'

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

const numberFormatter = new Intl.NumberFormat('ru-RU')

function formatDateTime(value) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return date.toLocaleString('ru-RU')
  } catch (error) {
    return value
  }
}

function calculateDurationMs(start, end) {
  if (!start || !end) return null
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null
  }
  return Math.max(endDate.getTime() - startDate.getTime(), 0)
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor(ms / 1000) % 60
  if (minutes === 0) {
    return `${seconds} с`
  }
  return `${minutes} мин ${seconds.toString().padStart(2, '0')} с`
}

function formatTaskDuration(task) {
  const duration = calculateDurationMs(task?.created_at, task?.updated_at)
  return formatDuration(duration)
}

function formatCellValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (error) {
      return String(value)
    }
  }
  return String(value)
}

function DetailStat({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}

function TaskDetailPanel({ taskId }) {
  const { t } = useTranslation()
  const { data: detail } = useTaskDetailQuery(taskId)
  const fileUrl = detail?.params?.file_url
  const previewQuery = useTaskPreviewQuery(
    { fileUrl, mode: 'page', page: 1, pageSize: 5 },
    { enabled: Boolean(fileUrl) }
  )

  const previewRows = previewQuery.data?.rows ?? []
  const previewColumns = previewRows.length ? Object.keys(previewRows[0]) : []

  return (
    <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
      <CardHeader className="space-y-3 px-6 py-5">
        <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
          {t('taskHistory.detail.title', { taskId: detail?.task_id ?? taskId })}
        </CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('taskHistory.detail.timestamps', {
            created: formatDateTime(detail?.created_at),
            updated: formatDateTime(detail?.updated_at),
          })}
        </p>
      </CardHeader>
      <CardContent className="space-y-6 px-6 pb-6">
        <div className="grid gap-4 md:grid-cols-2">
          <DetailStat
            label={t('taskHistory.detail.status')}
            value={STATUS_CONFIG[detail?.status]?.label ?? detail?.status ?? '—'}
          />
          <DetailStat
            label={t('taskHistory.detail.type')}
            value={TYPE_LABELS[detail?.task_type] ?? detail?.task_type ?? '—'}
          />
          <DetailStat
            label={t('taskHistory.detail.file')}
            value={fileUrl ?? t('taskHistory.noAdditionalInfo')}
          />
          <DetailStat
            label={t('taskHistory.detail.parent')}
            value={detail?.parent_task_id ?? t('taskHistory.noAdditionalInfo')}
          />
          <DetailStat
            label={t('taskHistory.detail.rows')}
            value={
              detail?.result_summary?.row_count !== undefined
                ? numberFormatter.format(detail.result_summary.row_count)
                : '—'
            }
          />
          <DetailStat
            label={t('taskHistory.detail.columns')}
            value={
              detail?.result_summary?.column_count !== undefined
                ? numberFormatter.format(detail.result_summary.column_count)
                : '—'
            }
          />
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('taskHistory.preview.title')}
          </h3>
          {fileUrl ? (
            previewQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t('taskHistory.preview.loading')}
              </div>
            ) : previewRows.length ? (
              <ScrollArea className="max-h-56 rounded-lg border border-slate-200 dark:border-slate-800">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {previewColumns.map((column) => (
                        <TableHead key={column}>{column}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, index) => (
                      <TableRow key={row.id ?? index}>
                        {previewColumns.map((column) => (
                          <TableCell key={column}>{formatCellValue(row?.[column])}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('taskHistory.preview.empty')}
              </p>
            )
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('taskHistory.noAdditionalInfo')}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('taskHistory.logTitle')}
          </h3>
          {detail?.log?.length ? (
            <div className="space-y-2">
              {detail.log.map((entry, index) => (
                <div
                  key={`${entry.timestamp}-${index}`}
                  className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {formatDateTime(entry.timestamp)} • {entry.level}
                  </p>
                  <p className="mt-1">{entry.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('taskHistory.noAdditionalInfo')}
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

export default function TaskHistory() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [selectedTaskId, setSelectedTaskId] = useState(null)

  const queryFilters = useMemo(() => {
    const filters = {}
    const trimmedSearch = search.trim()
    if (trimmedSearch) {
      filters.search = trimmedSearch
    }
    if (status !== 'all') {
      filters.status = status
    }
    if (type !== 'all') {
      filters.task_type = type
    }
    return filters
  }, [search, status, type])

  const historyQuery = useTaskHistoryQuery(queryFilters, { suspense: true })
  const tasks = historyQuery.data?.items ?? []

  const filteredTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return tasks.filter((task) => {
      const matchesSearch = normalizedSearch
        ? [task.task_id, task.task_type, task.status, task.log?.map((entry) => entry.message).join(' ') || '']
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedSearch))
        : true
      const matchesStatus = status === 'all' ? true : task.status === status
      const matchesType = type === 'all' ? true : task.task_type === type
      return matchesSearch && matchesStatus && matchesType
    })
  }, [tasks, search, status, type])

  useEffect(() => {
    if (!filteredTasks.length) {
      setSelectedTaskId(null)
      return
    }
    if (!selectedTaskId || !filteredTasks.some((task) => task.task_id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0].task_id)
    }
  }, [filteredTasks, selectedTaskId])

  const summary = useMemo(() => {
    const finished = filteredTasks.filter((task) => task.status === 'finished').length
    const failed = filteredTasks.filter((task) => task.status === 'failed').length
    const running = filteredTasks.filter((task) => ['running', 'queued'].includes(task.status)).length
    return { finished, failed, running }
  }, [filteredTasks])

  const timelineEntries = useMemo(() => {
    return [...filteredTasks]
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 6)
  }, [filteredTasks])

  const hasFailures = filteredTasks.some((task) => task.status === 'failed')

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
              <h1 className="text-3xl font-semibold leading-tight">{t('taskHistory.title')}</h1>
              <p className="max-w-2xl text-sm text-slate-200">{t('taskHistory.subtitle')}</p>
            </div>
            <Button
              variant="secondary"
              className="gap-2 bg-white/10 text-white hover:bg-white/20"
              onClick={() => historyQuery.refetch()}
              disabled={historyQuery.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${historyQuery.isFetching ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Обновить список
            </Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-none bg-white/70 p-5 shadow-sm dark:bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Успешно</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{summary.finished}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden />
            </div>
          </Card>
          <Card className="border-none bg-white/70 p-5 shadow-sm dark:bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ошибки</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{summary.failed}</p>
              </div>
              <XCircle className="h-8 w-8 text-rose-500" aria-hidden />
            </div>
          </Card>
          <Card className="border-none bg-white/70 p-5 shadow-sm dark:bg-slate-900/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">В работе</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{summary.running}</p>
              </div>
              <Timer className="h-8 w-8 text-amber-500" aria-hidden />
            </div>
          </Card>
        </section>

        <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
          <CardHeader className="space-y-4 px-6 py-5">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('taskHistory.filters.title')}
            </CardTitle>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('taskHistory.filters.searchPlaceholder')}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setStatus('all')
                  setType('all')
                }}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Сбросить фильтры
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  {t('taskHistory.filters.statusLabel')}
                </p>
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  {t('taskHistory.filters.typeLabel')}
                </p>
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
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Обновлено</TableHead>
                    <TableHead>Длительность</TableHead>
                    <TableHead>Последнее сообщение</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.length ? (
                    filteredTasks.map((task) => {
                      const isSelected = task.task_id === selectedTaskId
                      const latestLog = Array.isArray(task.log)
                        ? [...task.log]
                            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.message
                        : null

                      return (
                        <TableRow
                          key={task.task_id}
                          onClick={() => setSelectedTaskId(task.task_id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedTaskId(task.task_id)
                            }
                          }}
                          tabIndex={0}
                          aria-selected={isSelected}
                          className={`cursor-pointer transition hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:hover:bg-slate-800/60 ${
                            isSelected ? 'bg-indigo-50/80 dark:bg-indigo-500/10' : ''
                          }`}
                        >
                          <TableCell className="font-medium text-slate-800 dark:text-slate-100">
                            {task.task_id}
                          </TableCell>
                          <TableCell>{TYPE_LABELS[task.task_type] ?? task.task_type ?? '—'}</TableCell>
                          <TableCell>
                            <Badge className={`rounded-full px-3 py-1 text-xs ${STATUS_CONFIG[task.status]?.className ?? ''}`}>
                              {STATUS_CONFIG[task.status]?.label ?? task.status ?? '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateTime(task.updated_at || task.created_at)}</TableCell>
                          <TableCell>{formatTaskDuration(task)}</TableCell>
                          <TableCell className="max-w-xs truncate text-slate-500 dark:text-slate-300">
                            {latestLog ?? '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-sm text-slate-500">
                        {t('taskHistory.emptyHistory')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {hasFailures ? (
          <Alert className="border-none bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
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
            {timelineEntries.length ? (
              <div className="space-y-4">
                {timelineEntries.map((task) => (
                  <div key={task.task_id} className="flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      <CalendarClock className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {TYPE_LABELS[task.task_type] ?? task.task_type ?? 'Задача'} • {task.task_id}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(task.updated_at || task.created_at)} • {STATUS_CONFIG[task.status]?.label ?? task.status}
                      </p>
                      {Array.isArray(task.log) && task.log.length ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {task.log[task.log.length - 1]?.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('taskHistory.emptyHistory')}</p>
            )}
          </CardContent>
        </Card>

        {selectedTaskId ? (
          <Suspense
            fallback={
              <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
                <CardHeader className="px-6 py-5">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    {t('taskHistory.detail.title', { taskId: selectedTaskId })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3 px-6 pb-6 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('taskHistory.preview.loading')}
                </CardContent>
              </Card>
            }
          >
            <TaskDetailPanel taskId={selectedTaskId} />
          </Suspense>
        ) : (
          <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('taskHistory.detail.emptyTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 text-sm text-slate-500 dark:text-slate-400">
              {t('taskHistory.selectTaskPlaceholder')}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  )
}
