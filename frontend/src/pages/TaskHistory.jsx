import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Loader2,
  RefreshCw,
  Clock,
  Layers,
  AlertCircle,
  RotateCw,
  Search,
  Calendar,
  XCircle,
} from 'lucide-react'
import {
  useRetryTaskMutation,
  useTaskDetailQuery,
  useTaskHistoryQuery,
  useTaskPreviewQuery,
} from '@/hooks/tasks'
import { emitTaskEvent, TASK_EVENT_TYPES } from '@/lib/taskEvents'
import { useToast } from '@/components/ui/use-toast.jsx'

const PREVIEW_PAGE_SIZE = 25
const DEFAULT_HISTORY_LIMIT = 50

function formatTimestamp(value, locale) {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return date.toLocaleString(locale)
  } catch (error) {
    return value
  }
}

function buildHistoryFilters(filters) {
  const params = { limit: DEFAULT_HISTORY_LIMIT, offset: 0 }

  if (filters.status && filters.status !== 'all') {
    params.status = filters.status
  }
  if (filters.type && filters.type !== 'all') {
    params.type = filters.type
  }
  if (filters.search) {
    params.q = filters.search
  }
  if (filters.since) {
    params.since = filters.since
  }
  if (filters.until) {
    params.until = filters.until
  }

  return params
}

function HistorySkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-52" />
      <Skeleton className="h-56" />
    </div>
  )
}

export default function TaskHistory() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    search: '',
    since: null,
    until: null,
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [previewParams, setPreviewParams] = useState({ mode: 'page', page: 1 })
  const invalidDateToastRef = useRef(false)
  const searchDebounceRef = useRef()

  const hasInvalidRange = useMemo(() => {
    if (!filters.since || !filters.until) {
      return false
    }
    return new Date(filters.since) > new Date(filters.until)
  }, [filters.since, filters.until])

  useEffect(() => {
    if (!hasInvalidRange) {
      invalidDateToastRef.current = false
      return
    }

    if (!invalidDateToastRef.current) {
      toast({
        variant: 'destructive',
        title: t('taskHistory.invalidRangeTitle'),
        description: t('taskHistory.invalidRangeDescription'),
      })
      invalidDateToastRef.current = true
    }
  }, [hasInvalidRange, t, toast])

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    searchDebounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchTerm.trim() }))
    }, 350)

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [searchTerm])

  const historyFilters = useMemo(() => buildHistoryFilters(filters), [filters])

  const historyQuery = useTaskHistoryQuery(historyFilters, {
    enabled: !hasInvalidRange,
  })

  const historyItems = historyQuery.data?.items ?? []
  const pagination = {
    count: historyQuery.data?.count ?? historyItems.length,
    limit: historyQuery.data?.limit ?? DEFAULT_HISTORY_LIMIT,
    offset: historyQuery.data?.offset ?? 0,
  }

  useEffect(() => {
    if (!historyItems.length) {
      setSelectedTaskId(null)
      return
    }

    setSelectedTaskId((current) => {
      if (current && historyItems.some((task) => task.task_id === current)) {
        return current
      }
      return historyItems[0].task_id
    })
  }, [historyItems])

  const detailQuery = useTaskDetailQuery(selectedTaskId, { suspense: false })
  const selectedTask = detailQuery.data ?? null

  useEffect(() => {
    if (!selectedTask?.params?.file_url) {
      setPreviewParams({ mode: 'page', page: 1 })
      return
    }
    setPreviewParams((prev) => ({ ...prev, page: 1, mode: prev.mode }))
  }, [selectedTask?.params?.file_url])

  const previewQuery = useTaskPreviewQuery(
    {
      fileUrl: selectedTask?.params?.file_url,
      mode: previewParams.mode,
      page: previewParams.page,
      pageSize: PREVIEW_PAGE_SIZE,
    },
    { enabled: Boolean(selectedTask?.params?.file_url), suspense: false },
  )

  const previewRows = previewQuery.data?.rows ?? []
  const previewState = {
    mode: previewQuery.data?.mode ?? previewParams.mode,
    page: previewQuery.data?.page ?? previewParams.page,
    hasMore: Boolean(previewQuery.data?.has_more),
  }

  const statusSummary = useMemo(() => {
    return historyItems.reduce((acc, item) => {
      const key = item.status || 'unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [historyItems])

  const retryTaskMutation = useRetryTaskMutation({
    onSuccess: (data) => {
      if (data?.task_id) {
        setSelectedTaskId(data.task_id)
        emitTaskEvent(TASK_EVENT_TYPES.DETAIL_INVALIDATED, { taskId: data.task_id })
      }
    },
  })

  function handleDateFilter(key, value, { endOfDay = false } = {}) {
    if (!value) {
      setFilters((prev) => ({ ...prev, [key]: null }))
      return
    }

    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00Z'
    const iso = `${value}${suffix}`
    setFilters((prev) => ({ ...prev, [key]: iso }))
  }

  function resetFilters() {
    setFilters({ status: 'all', type: 'all', search: '', since: null, until: null })
    setSearchTerm('')
    invalidDateToastRef.current = false
  }

  function handleRetry(taskId) {
    if (!taskId) return
    retryTaskMutation.mutate(taskId)
  }

  function triggerPreview(params) {
    setPreviewParams((prev) => ({ ...prev, ...params }))
    emitTaskEvent(TASK_EVENT_TYPES.PREVIEW_INVALIDATED, {
      fileUrl: selectedTask?.params?.file_url,
    })
  }

  const isRefreshing = historyQuery.isRefetching

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: t('taskHistory.filters.status.all') },
      { value: 'queued', label: t('taskHistory.filters.status.queued') },
      { value: 'running', label: t('taskHistory.filters.status.running') },
      { value: 'finished', label: t('taskHistory.filters.status.finished') },
      { value: 'failed', label: t('taskHistory.filters.status.failed') },
    ],
    [t],
  )

  const typeOptions = useMemo(
    () => [
      { value: 'all', label: t('taskHistory.filters.type.all') },
      { value: 'extraction', label: t('taskHistory.filters.type.extraction') },
    ],
    [t],
  )

  function renderHistoryContent() {
    if (historyQuery.isPending) {
      return <HistorySkeleton />
    }

    if (historyItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
          <AlertCircle className="w-6 h-6 mb-2" />
          {t('taskHistory.emptyHistory')}
        </div>
      )
    }

    return (
      <div className="divide-y divide-slate-200">
        {historyItems.map((task) => {
          const isActive = task.task_id === selectedTaskId
          return (
            <button
              key={task.task_id}
              type="button"
              onClick={() => setSelectedTaskId(task.task_id)}
              className={`w-full text-left px-5 py-4 transition ${isActive ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{task.task_type}</p>
                  <p className="text-xs text-slate-500">
                    {formatTimestamp(task.updated_at, i18n.language)}
                  </p>
                </div>
                <Badge className="bg-slate-100 text-slate-700 text-xs font-medium uppercase">
                  {task.status}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-slate-600 line-clamp-2">
                {task.log?.slice(-1)[0]?.message || t('taskHistory.noAdditionalInfo')}
              </p>
            </button>
          )
        })}
      </div>
    )
  }

  function renderDetailContent() {
    if (!selectedTaskId) {
      return (
        <div className="flex items-center justify-center py-20 text-slate-500">
          {t('taskHistory.selectTaskPlaceholder')}
        </div>
      )
    }

    if (detailQuery.isPending) {
      return <DetailSkeleton />
    }

    if (detailQuery.isError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500 gap-4">
          <AlertCircle className="w-6 h-6" />
          <p>{t('taskHistory.detailLoadError')}</p>
          <Button onClick={() => detailQuery.refetch()}>{t('taskHistory.retryLoad')}</Button>
        </div>
      )
    }

    if (!selectedTask) {
      return null
    }

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
            <p className="text-xs text-blue-600 uppercase">{t('taskHistory.detail.status')}</p>
            <p className="text-lg font-semibold text-blue-700 mt-1">{selectedTask.status}</p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100">
            <p className="text-xs text-emerald-600 uppercase">{t('taskHistory.detail.type')}</p>
            <p className="text-lg font-semibold text-emerald-700 mt-1">{selectedTask.task_type}</p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100">
            <p className="text-xs text-purple-600 uppercase">{t('taskHistory.detail.file')}</p>
            <p className="text-lg font-semibold text-purple-700 mt-1">
              {selectedTask.params?.file_url || '—'}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100">
            <p className="text-xs text-amber-600 uppercase">{t('taskHistory.detail.parent')}</p>
            <p className="text-lg font-semibold text-amber-700 mt-1">
              {selectedTask.parent_task_id || '—'}
            </p>
          </div>
        </div>

        {selectedTask.result_summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-slate-200 rounded-lg bg-white/80">
              <p className="text-xs uppercase text-slate-500">{t('taskHistory.detail.rows')}</p>
              <p className="text-2xl font-bold text-slate-900">
                {selectedTask.result_summary.row_count ?? '—'}
              </p>
            </div>
            <div className="p-4 border border-slate-200 rounded-lg bg-white/80">
              <p className="text-xs uppercase text-slate-500">{t('taskHistory.detail.columns')}</p>
              <p className="text-2xl font-bold text-slate-900">
                {selectedTask.result_summary.column_count ?? '—'}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">{t('taskHistory.preview.title')}</h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  previewQuery.isPending ||
                  previewState.mode !== 'page' ||
                  previewState.page <= 1
                }
                onClick={() => triggerPreview({ mode: 'page', page: Math.max(1, previewState.page - 1) })}
              >
                {t('taskHistory.preview.previous')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  previewQuery.isPending ||
                  previewState.mode !== 'page' ||
                  !previewState.hasMore
                }
                onClick={() => triggerPreview({ mode: 'page', page: previewState.page + 1 })}
              >
                {t('taskHistory.preview.next')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={previewQuery.isPending}
                onClick={() => triggerPreview({ mode: 'sample', page: 1 })}
              >
                {t('taskHistory.preview.random')}
              </Button>
            </div>
          </div>
          {previewQuery.isPending ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t('taskHistory.preview.loading')}
            </div>
          ) : !previewRows.length ? (
            <p className="text-sm text-slate-500">{t('taskHistory.preview.empty')}</p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <ScrollArea className="max-h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(previewRows[0] || {}).map((column) => (
                        <TableHead key={column} className="bg-slate-50 text-slate-600">
                          {column}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, index) => (
                      <TableRow key={index}>
                        {Object.keys(row || {}).map((column) => (
                          <TableCell key={column} className="text-xs text-slate-700">
                            {row[column] ?? ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">{t('taskHistory.logTitle')}</h3>
          <div className="space-y-3">
            {(selectedTask.log || []).map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`} className="p-3 border border-slate-200 rounded-lg bg-white/70">
                <div className="flex items-center justify-between">
                  <Badge className="bg-slate-100 text-slate-700 text-xs font-medium">
                    {entry.level.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {formatTimestamp(entry.timestamp, i18n.language)}
                  </span>
                </div>
                <p className="text-sm text-slate-900 mt-2">{entry.message}</p>
                {entry.details && Object.keys(entry.details).length > 0 && (
                  <pre className="mt-2 text-[11px] bg-slate-900/90 text-slate-100 rounded-md p-3 overflow-x-auto">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <PageContainer className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
          {t('taskHistory.title')}
        </h1>
        <p className="text-slate-600 text-lg max-w-2xl mx-auto">{t('taskHistory.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardHeader className="flex flex-col gap-4">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              {t('taskHistory.filters.title')}
            </CardTitle>
            <div className="grid grid-cols-1 gap-3">
              <div className="relative">
                <label className="text-xs uppercase text-slate-500 mb-1 block" htmlFor="task-history-search">
                  {t('taskHistory.filters.searchLabel')}
                </label>
                <Input
                  id="task-history-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={t('taskHistory.filters.searchPlaceholder')}
                  className="pl-9 bg-white/70"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-9" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 mb-1">{t('taskHistory.filters.statusLabel')}</p>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger
                    className="bg-white/70"
                    aria-label={t('taskHistory.filters.statusLabel')}
                  >
                    <SelectValue placeholder={t('taskHistory.filters.statusPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 mb-1">{t('taskHistory.filters.typeLabel')}</p>
                <Select value={filters.type} onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}>
                  <SelectTrigger
                    className="bg-white/70"
                    aria-label={t('taskHistory.filters.typeLabel')}
                  >
                    <SelectValue placeholder={t('taskHistory.filters.typePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    {t('taskHistory.filters.dateFrom')}
                  </p>
                  <Input
                    type="date"
                    value={filters.since ? filters.since.slice(0, 10) : ''}
                    onChange={(event) => handleDateFilter('since', event.target.value)}
                    className="bg-white/70"
                    aria-label={t('taskHistory.filters.dateFrom')}
                  />
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    {t('taskHistory.filters.dateTo')}
                  </p>
                  <Input
                    type="date"
                    value={filters.until ? filters.until.slice(0, 10) : ''}
                    onChange={(event) => handleDateFilter('until', event.target.value, { endOfDay: true })}
                    className="bg-white/70"
                    aria-label={t('taskHistory.filters.dateTo')}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(statusSummary).map(([status, count]) => (
                    <Badge key={status} className="bg-slate-100 text-slate-700 text-xs font-medium">
                      {status}: {count}
                    </Badge>
                  ))}
                  <Badge className="bg-slate-100 text-slate-700 text-xs font-medium">
                    {t('taskHistory.total')} {pagination.count}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={resetFilters}
                    title={t('taskHistory.filters.reset')}
                    aria-label={t('taskHistory.filters.reset')}
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => historyQuery.refetch()}
                    disabled={isRefreshing}
                    aria-label={t('taskHistory.filters.refresh')}
                  >
                    {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0" role="region" aria-live="polite">
            <ScrollArea className="h-[28rem]">{renderHistoryContent()}</ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader className="border-b border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Layers className="w-5 h-5 text-purple-500" />
                  {selectedTask ? t('taskHistory.detail.title', { taskId: selectedTask.task_id }) : t('taskHistory.detail.emptyTitle')}
                </CardTitle>
                {selectedTask && (
                  <p className="text-sm text-slate-500 mt-1">
                    {t('taskHistory.detail.timestamps', {
                      created: formatTimestamp(selectedTask.created_at, i18n.language),
                      updated: formatTimestamp(selectedTask.updated_at, i18n.language),
                    })}
                  </p>
                )}
              </div>
              {selectedTask && (
                <Button
                  variant={selectedTask.status === 'failed' ? 'destructive' : 'outline'}
                  onClick={() => handleRetry(selectedTask.task_id)}
                  disabled={retryTaskMutation.isPending}
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  {selectedTask.status === 'failed'
                    ? t('taskHistory.retryFailed')
                    : t('taskHistory.retryGeneral')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6" role="region" aria-live="polite">
            {renderDetailContent()}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

