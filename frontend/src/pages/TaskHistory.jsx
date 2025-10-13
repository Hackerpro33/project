import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listTaskHistory, getTaskHistoryEntry, retryTask, previewDataset } from '@/api/tasks'
import { useToast } from '@/components/ui/use-toast'
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
  Activity,
  Timer,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
  FileText,
  FileSpreadsheet,
  Braces,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { utils as XLSXUtils, writeFile as writeXlsxFile } from 'xlsx'
import { downloadBlob, downloadTextFile } from '@/utils/download'
import { generateCSV } from '@/utils/dataTransformation'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'queued', label: 'В очереди' },
  { value: 'running', label: 'Выполняется' },
  { value: 'finished', label: 'Завершено' },
  { value: 'failed', label: 'Ошибка' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'Все типы' },
  { value: 'extraction', label: 'Извлечение данных' },
]

const STATUS_BADGES = {
  queued: 'bg-blue-100 text-blue-700',
  running: 'bg-amber-100 text-amber-700',
  finished: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  queued: 'В очереди',
  running: 'Выполняется',
  finished: 'Завершено',
  failed: 'Ошибка',
  unknown: 'Неизвестно',
  other: 'Другое',
}

const LEVEL_BADGES = {
  info: 'bg-slate-100 text-slate-700',
  error: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-emerald-100 text-emerald-700',
}

const PREVIEW_PAGE_SIZE = 25
const DEFAULT_HISTORY_LIMIT = 50

const SORT_FIELDS = [
  { value: 'updated_at', label: 'Дата обновления' },
  { value: 'duration', label: 'Длительность' },
  { value: 'task_type', label: 'Тип задачи' },
  { value: 'status', label: 'Статус' },
]

function formatTimestamp(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch (error) {
    return value
  }
}

function parseIsoDate(value) {
  if (!value && value !== 0) {
    return null
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    const multiplier = value < 10_000_000_000 ? 1000 : 1
    const date = new Date(value * multiplier)
    return Number.isNaN(date.getTime()) ? null : date
  }
  try {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  } catch (error) {
    return null
  }
}

function formatDuration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return '—'
  }
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`
  }
  if (minutes > 0) {
    return `${minutes} мин ${seconds} с`
  }
  return `${seconds} с`
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—'
  }
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)}%`
}

function extractLastError(log = []) {
  const reversed = [...log].reverse()
  const entry = reversed.find((item) => item?.level === 'error')
  return entry?.message || null
}

function getStatusBadgeClass(status) {
  return STATUS_BADGES[status] || 'bg-slate-100 text-slate-700'
}

function getLevelBadgeClass(level) {
  return LEVEL_BADGES[level] || 'bg-slate-100 text-slate-700'
}

export default function TaskHistory() {
  const [history, setHistory] = useState([])
  const [filters, setFilters] = useState({ status: 'all', type: 'all', search: '', since: null, until: null })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewState, setPreviewState] = useState({ mode: 'page', page: 1, hasMore: false })
  const [previewLoading, setPreviewLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [pagination, setPagination] = useState({ count: 0, limit: DEFAULT_HISTORY_LIMIT, offset: 0 })
  const [sorting, setSorting] = useState({ field: 'updated_at', direction: 'desc' })
  const { toast } = useToast()
  const searchDebounceRef = useRef()
  const invalidDateRef = useRef(false)

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    searchDebounceRef.current = setTimeout(() => {
      setFilters((prev) => {
        if ((prev.search || '') === searchTerm.trim()) {
          return prev
        }
        return { ...prev, search: searchTerm.trim() }
      })
    }, 350)
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [searchTerm])

  useEffect(() => {
    loadHistory()
  }, [filters.status, filters.type, filters.search, filters.since, filters.until])

  useEffect(() => {
    if (!selectedTask?.params?.file_url) {
      setPreviewData(null)
      return
    }
    loadPreview({ mode: 'page', page: 1 })
  }, [selectedTask?.task_id])

  function toIsoString(value, endOfDay = false) {
    if (!value) return null
    const date = new Date(`${value}${endOfDay ? 'T23:59:59.999Z' : 'T00:00:00Z'}`)
    if (Number.isNaN(date.getTime())) {
      return null
    }
    return date.toISOString()
  }

  async function loadHistory() {
    const sinceDate = filters.since ? new Date(filters.since) : null
    const untilDate = filters.until ? new Date(filters.until) : null
    if (sinceDate && untilDate && sinceDate > untilDate) {
      if (!invalidDateRef.current) {
        toast({
          title: 'Некорректный период',
          description: 'Дата начала не может быть позже даты окончания.',
          variant: 'destructive',
        })
        invalidDateRef.current = true
      }
      setIsLoading(false)
      return
    }
    invalidDateRef.current = false
    setIsLoading(true)
    try {
      const params = { limit: DEFAULT_HISTORY_LIMIT, offset: 0 }
      if (filters.status !== 'all') {
        params.status = filters.status
      }
      if (filters.type !== 'all') {
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
      const payload = await listTaskHistory(params)
      const items = Array.isArray(payload.items) ? payload.items : []
      setHistory(items)
      setPagination({
        count: payload.count ?? items.length,
        limit: payload.limit ?? params.limit,
        offset: payload.offset ?? params.offset,
      })
      if (items.length) {
        const first = items.find((item) => item.task_id === selectedTaskId) || items[0]
        selectTask(first.task_id, false)
      } else {
        setSelectedTaskId(null)
        setSelectedTask(null)
      }
    } catch (error) {
      console.error('Не удалось загрузить историю задач', error)
      toast({
        title: 'Ошибка загрузки',
        description: 'Не удалось получить историю фоновых задач. Попробуйте позже.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  function handleDateFilter(key, value, { endOfDay = false } = {}) {
    const iso = value ? toIsoString(value, endOfDay) : null
    setFilters((prev) => ({ ...prev, [key]: iso }))
  }

  function resetFilters() {
    setFilters({ status: 'all', type: 'all', search: '', since: null, until: null })
    setSearchTerm('')
    invalidDateRef.current = false
  }

  async function selectTask(taskId, forceReload = true) {
    if (!taskId) return
    setSelectedTaskId(taskId)
    setDetailLoading(true)
    try {
      if (!forceReload && selectedTask && selectedTask.task_id === taskId) {
        setDetailLoading(false)
        return
      }
      const detail = await getTaskHistoryEntry(taskId)
      setSelectedTask(detail)
    } catch (error) {
      console.error('Не удалось загрузить детали задачи', error)
      toast({
        title: 'Ошибка загрузки деталей',
        description: 'Не удалось получить детали задачи. Попробуйте обновить страницу.',
        variant: 'destructive',
      })
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleRetry(taskId) {
    if (!taskId) return
    try {
      const response = await retryTask(taskId)
      toast({
        title: 'Задача поставлена в очередь',
        description: `Создана новая задача ${response.task_id}`,
      })
      await loadHistory()
      await selectTask(response.task_id)
    } catch (error) {
      console.error('Не удалось перезапустить задачу', error)
      toast({
        title: 'Ошибка перезапуска',
        description: 'Не удалось перезапустить задачу. Проверьте очередь заданий.',
        variant: 'destructive',
      })
    }
  }

  async function loadPreview({ mode, page }) {
    if (!selectedTask?.params?.file_url) {
      setPreviewData(null)
      return
    }
    setPreviewLoading(true)
    try {
      const options = { mode }
      if (mode === 'page') {
        options.page = page
        options.page_size = PREVIEW_PAGE_SIZE
      } else {
        options.sample_size = PREVIEW_PAGE_SIZE
      }
      const payload = await previewDataset(selectedTask.params.file_url, options)
      setPreviewData(payload.rows || [])
      setPreviewState({
        mode: payload.mode,
        page: payload.page || 1,
        hasMore: Boolean(payload.has_more),
      })
    } catch (error) {
      console.error('Не удалось загрузить предпросмотр', error)
      toast({
        title: 'Ошибка предпросмотра',
        description: 'Предпросмотр файла временно недоступен.',
        variant: 'destructive',
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  const processedHistory = useMemo(() => {
    return history.map((item) => {
      const createdDate = parseIsoDate(item.created_at)
      const updatedDate = parseIsoDate(item.updated_at)
      const durationMs =
        createdDate && updatedDate ? Math.max(0, updatedDate.getTime() - createdDate.getTime()) : null

      return {
        ...item,
        createdDate,
        updatedDate,
        durationMs,
        durationMinutes: durationMs != null ? durationMs / 60000 : null,
        lastError: extractLastError(item.log),
      }
    })
  }, [history])

  const sortedHistory = useMemo(() => {
    const items = [...processedHistory]
    items.sort((a, b) => {
      switch (sorting.field) {
        case 'duration': {
          const valueA = a.durationMs ?? -1
          const valueB = b.durationMs ?? -1
          return valueA - valueB
        }
        case 'task_type':
          return (a.task_type || '').localeCompare(b.task_type || '', 'ru-RU', { sensitivity: 'base' })
        case 'status':
          return (a.status || '').localeCompare(b.status || '', 'ru-RU', { sensitivity: 'base' })
        case 'updated_at':
        default: {
          const valueA = a.updatedDate?.getTime() ?? 0
          const valueB = b.updatedDate?.getTime() ?? 0
          return valueA - valueB
        }
      }
    })
    if (sorting.direction === 'desc') {
      items.reverse()
    }
    return items
  }, [processedHistory, sorting])

  const performanceMetrics = useMemo(() => {
    if (processedHistory.length === 0) {
      return {
        total: 0,
        successes: 0,
        failures: 0,
        active: 0,
        averageDurationMs: null,
        maxDurationMs: null,
        minDurationMs: null,
        successRate: 0,
        failureRate: 0,
        completedToday: 0,
      }
    }

    const durations = []
    let successes = 0
    let failures = 0
    let active = 0
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    let completedToday = 0

    processedHistory.forEach((item) => {
      if (item.status === 'finished') {
        successes += 1
      } else if (item.status === 'failed') {
        failures += 1
      } else {
        active += 1
      }

      if (typeof item.durationMs === 'number') {
        durations.push(item.durationMs)
      }

      if (item.updatedDate && item.updatedDate >= startOfDay && item.updatedDate <= now) {
        completedToday += 1
      }
    })

    const total = processedHistory.length
    const averageDurationMs =
      durations.length > 0 ? durations.reduce((acc, value) => acc + value, 0) / durations.length : null
    const maxDurationMs = durations.length > 0 ? Math.max(...durations) : null
    const minDurationMs = durations.length > 0 ? Math.min(...durations) : null
    const successRate = total ? (successes / total) * 100 : 0
    const failureRate = total ? (failures / total) * 100 : 0

    return {
      total,
      successes,
      failures,
      active,
      averageDurationMs,
      maxDurationMs,
      minDurationMs,
      successRate,
      failureRate,
      completedToday,
    }
  }, [processedHistory])

  const statusSummary = useMemo(() => {
    return processedHistory.reduce(
      (acc, item) => {
        const key = item.status || 'unknown'
        acc[key] = (acc[key] || 0) + 1
        return acc
      },
      {},
    )
  }, [processedHistory])

  const statusSummaryEntries = useMemo(() => {
    return Object.entries(statusSummary).sort((a, b) => b[1] - a[1])
  }, [statusSummary])

  const statusTrendData = useMemo(() => {
    if (processedHistory.length === 0) {
      return []
    }

    const map = new Map()
    processedHistory.forEach((item) => {
      const reference = item.updatedDate || item.createdDate
      if (!reference) {
        return
      }
      const key = reference.toISOString().slice(0, 10)
      if (!map.has(key)) {
        map.set(key, { finished: 0, failed: 0, running: 0, queued: 0, other: 0 })
      }
      const entry = map.get(key)
      const status = (item.status || 'other').toLowerCase()
      if (status === 'finished') {
        entry.finished += 1
      } else if (status === 'failed') {
        entry.failed += 1
      } else if (status === 'running') {
        entry.running += 1
      } else if (status === 'queued') {
        entry.queued += 1
      } else {
        entry.other += 1
      }
    })

    return Array.from(map.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-14)
      .map(([dateKey, value]) => {
        const label = new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: 'short',
        }).format(new Date(`${dateKey}T00:00:00Z`))
        return {
          ...value,
          date: dateKey,
          label,
        }
      })
  }, [processedHistory])

  const durationTrendData = useMemo(() => {
    const withDurations = processedHistory
      .filter((item) => typeof item.durationMs === 'number' && item.updatedDate)
      .map((item) => ({
        taskId: item.task_id,
        updatedDate: item.updatedDate,
        durationMinutes: Number((item.durationMs / 60000).toFixed(2)),
      }))
      .sort((a, b) => a.updatedDate.getTime() - b.updatedDate.getTime())

    const recent = withDurations.slice(-20)
    let cumulative = 0

    return recent.map((entry, index) => {
      cumulative += entry.durationMinutes
      return {
        taskId: entry.taskId,
        label: new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(entry.updatedDate),
        duration: Number(entry.durationMinutes.toFixed(2)),
        avg: Number((cumulative / (index + 1)).toFixed(2)),
      }
    })
  }, [processedHistory])

  const exportDataset = useMemo(() => {
    return processedHistory.map((item) => ({
      task_id: item.task_id,
      task_type: item.task_type,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at,
      duration_seconds: item.durationMs != null ? Math.round(item.durationMs / 1000) : null,
      duration_human: item.durationMs != null ? formatDuration(item.durationMs) : null,
      success: item.status === 'finished',
      error_message: item.lastError,
    }))
  }, [processedHistory])

  const exportData = useCallback(
    (format) => {
      if (!exportDataset.length) {
        toast({
          title: 'Нет данных для экспорта',
          description: 'Список задач пустой или активные фильтры ничего не нашли.',
          variant: 'destructive',
        })
        return
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const baseName = `task-history-${timestamp}`

      try {
        if (format === 'csv') {
          const columns = [
            { key: 'task_id', header: 'ID задачи' },
            { key: 'task_type', header: 'Тип задачи' },
            { key: 'status', header: 'Статус' },
            { key: 'created_at', header: 'Создана' },
            { key: 'updated_at', header: 'Обновлена' },
            { key: 'duration_seconds', header: 'Длительность (с)' },
            { key: 'duration_human', header: 'Длительность (формат)' },
            { key: 'error_message', header: 'Ошибка' },
          ]

          const normalizedRows = exportDataset.map((row) => {
            return columns.reduce((acc, column) => {
              acc[column.header] = row[column.key]
              return acc
            }, {})
          })

          const csvColumns = columns.map((column) => ({ name: column.header }))
          const csvContent = generateCSV(csvColumns, normalizedRows)
          if (!csvContent) {
            throw new Error('CSV export is empty')
          }
          const blob = new Blob([`\uFEFF${csvContent}`], {
            type: 'text/csv;charset=utf-8;',
          })
          downloadBlob(blob, `${baseName}.csv`)
        } else if (format === 'json') {
          downloadTextFile(JSON.stringify(exportDataset, null, 2), `${baseName}.json`, 'application/json;charset=utf-8;')
        } else if (format === 'xlsx') {
          const worksheet = XLSXUtils.json_to_sheet(exportDataset)
          const workbook = XLSXUtils.book_new()
          XLSXUtils.book_append_sheet(workbook, worksheet, 'Tasks')
          writeXlsxFile(workbook, `${baseName}.xlsx`)
        }

        toast({
          title: 'Экспорт выполнен',
          description: `Файл ${format.toUpperCase()} сохранён на устройство.`,
        })
      } catch (error) {
        console.error('Ошибка экспорта', error)
        toast({
          title: 'Ошибка экспорта',
          description: 'Не удалось подготовить файл. Попробуйте ещё раз.',
          variant: 'destructive',
        })
      }
    },
    [exportDataset, toast],
  )

  const toggleSortingDirection = useCallback(() => {
    setSorting((prev) => ({
      ...prev,
      direction: prev.direction === 'desc' ? 'asc' : 'desc',
    }))
  }, [])

  return (
    <PageContainer className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
          История фоновых задач
        </h1>
        <p className="text-slate-600 text-lg max-w-2xl mx-auto">
          Просматривайте детали выполненных задач, анализируйте логи и при необходимости перезапускайте обработку.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">Всего задач</p>
                <p className="text-3xl font-semibold text-slate-900">{performanceMetrics.total}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {performanceMetrics.completedToday
                    ? `+${performanceMetrics.completedToday} за сегодня`
                    : 'Нет запусков сегодня'}
                </p>
              </div>
              <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">Среднее время</p>
                <p className="text-3xl font-semibold text-slate-900">
                  {formatDuration(performanceMetrics.averageDurationMs)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {performanceMetrics.minDurationMs !== null && performanceMetrics.maxDurationMs !== null
                    ? `от ${formatDuration(performanceMetrics.minDurationMs)} до ${formatDuration(performanceMetrics.maxDurationMs)}`
                    : 'Данных для расчёта пока нет'}
                </p>
              </div>
              <div className="w-11 h-11 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                <Timer className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">Успешные обработки</p>
                <p className="text-3xl font-semibold text-emerald-600">{performanceMetrics.successes}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Доля: {formatPercent(performanceMetrics.successRate)}
                </p>
              </div>
              <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">Ошибки</p>
                <p className="text-3xl font-semibold text-rose-600">{performanceMetrics.failures}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Доля: {formatPercent(performanceMetrics.failureRate)}
                </p>
              </div>
              <div className="w-11 h-11 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Activity className="w-5 h-5 text-blue-500" />
              Динамика задач по статусам
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {statusTrendData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={statusTrendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                  <RechartsTooltip
                    formatter={(value, name) => {
                      const labels = {
                        finished: 'Завершено',
                        failed: 'Ошибки',
                        running: 'Выполняется',
                        queued: 'В очереди',
                        other: 'Прочие',
                      }
                      return [value, labels[name] || name]
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="finished" name="Завершено" stackId="1" stroke="#10b981" fill="#10b98133" />
                  <Area type="monotone" dataKey="failed" name="Ошибки" stackId="1" stroke="#ef4444" fill="#ef444433" />
                  <Area type="monotone" dataKey="running" name="Выполняется" stackId="1" stroke="#f59e0b" fill="#f59e0b33" />
                  <Area type="monotone" dataKey="queued" name="В очереди" stackId="1" stroke="#3b82f6" fill="#3b82f633" />
                  <Area type="monotone" dataKey="other" name="Прочие" stackId="1" stroke="#64748b" fill="#64748b33" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500">
                Недостаточно данных, чтобы построить график. Выполните несколько задач.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Timer className="w-5 h-5 text-purple-500" />
              Время обработки задач
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {durationTrendData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={durationTrendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `${value} мин`} />
                  <RechartsTooltip
                    formatter={(value, name) => {
                      const label = name === 'avg' ? 'Среднее время' : 'Длительность'
                      return [`${value} мин`, label]
                    }}
                  />
                  <Legend formatter={(value) => (value === 'avg' ? 'Среднее' : 'Задача')} />
                  <Line type="monotone" dataKey="duration" stroke="#6366f1" name="Задача" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="avg" stroke="#a855f7" name="avg" strokeWidth={2} dot={false} strokeDasharray="6 4" />
                </RechartsLineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500">
                Пока нет завершённых задач, чтобы рассчитать длительность обработки.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardHeader className="flex flex-col gap-4">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              Фильтры и статус
            </CardTitle>
            <div className="grid grid-cols-1 gap-3">
              <div className="relative">
                <label className="text-xs uppercase text-slate-500 mb-1 block">Поиск</label>
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ID задачи, тип, сообщение лога..."
                  className="pl-9 bg-white/70"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-9" />
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 mb-1">Статус задачи</p>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger className="bg-white/70">
                    <SelectValue placeholder="Выберите статус" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 mb-1">Тип задачи</p>
                <Select value={filters.type} onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}>
                  <SelectTrigger className="bg-white/70">
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 mb-1 flex items-center gap-1">
                  <ArrowUpDown className="w-4 h-4 text-slate-400" /> Сортировка
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={sorting.field}
                    onValueChange={(value) => setSorting((prev) => ({ ...prev, field: value }))}
                  >
                    <SelectTrigger className="bg-white/70 min-w-[160px]">
                      <SelectValue placeholder="Поле сортировки" />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_FIELDS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleSortingDirection}
                    title={`Направление: ${sorting.direction === 'desc' ? 'по убыванию' : 'по возрастанию'}`}
                  >
                    <ArrowUpDown
                      className={`w-4 h-4 transition-transform ${sorting.direction === 'desc' ? 'rotate-180' : ''}`}
                    />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-slate-400" /> С
                  </p>
                  <Input
                    type="date"
                    value={filters.since ? filters.since.slice(0, 10) : ''}
                    onChange={(event) => handleDateFilter('since', event.target.value)}
                    className="bg-white/70"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-slate-400" /> По
                  </p>
                  <Input
                    type="date"
                    value={filters.until ? filters.until.slice(0, 10) : ''}
                    onChange={(event) => handleDateFilter('until', event.target.value, { endOfDay: true })}
                    className="bg-white/70"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex gap-2 flex-wrap">
                  {statusSummaryEntries.length === 0 && (
                    <Badge className="bg-slate-100 text-slate-700 text-xs font-medium">Нет данных</Badge>
                  )}
                  {statusSummaryEntries.map(([status, count]) => (
                    <Badge key={status} className={`${getStatusBadgeClass(status)} text-xs font-medium`}>
                      {(STATUS_LABELS[status] || status)}: {count}
                    </Badge>
                  ))}
                  <Badge className="bg-slate-100 text-slate-700 text-xs font-medium">
                    Всего: {pagination.count}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={resetFilters} title="Сбросить фильтры">
                    <XCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setIsRefreshing(true)
                      loadHistory().finally(() => setIsRefreshing(false))
                    }}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase text-slate-500">Экспорт результатов</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => exportData('csv')}
                    disabled={!processedHistory.length}
                  >
                    <FileText className="w-4 h-4 mr-2" /> CSV
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => exportData('xlsx')}
                    disabled={!processedHistory.length}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => exportData('json')}
                    disabled={!processedHistory.length}
                  >
                    <Braces className="w-4 h-4 mr-2" /> JSON
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[28rem]">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-500">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Загрузка истории...
                </div>
              ) : sortedHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                  <AlertCircle className="w-6 h-6 mb-2" />
                  История задач пока пустая.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {sortedHistory.map((task) => {
                    const isActive = task.task_id === selectedTaskId
                    return (
                      <button
                        key={task.task_id}
                        onClick={() => selectTask(task.task_id)}
                        className={`w-full text-left px-5 py-4 transition ${isActive ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{task.task_type}</p>
                            <p className="text-xs text-slate-500">{formatTimestamp(task.updated_at)}</p>
                          </div>
                          <Badge className={`${getStatusBadgeClass(task.status)} text-xs`}>
                            {STATUS_LABELS[task.status] || task.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-600 line-clamp-2">
                          {task.log?.slice(-1)[0]?.message || 'Без дополнительных сведений'}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                          <span>
                            Длительность:{' '}
                            {task.durationMs != null ? formatDuration(task.durationMs) : '—'}
                          </span>
                          <span className="flex items-center gap-1">
                            {task.lastError ? (
                              <>
                                <AlertTriangle className="w-3 h-3 text-rose-500" /> Ошибка
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                {task.status === 'finished' ? 'Успешно' : 'Без ошибок'}
                              </>
                            )}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader className="border-b border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Layers className="w-5 h-5 text-purple-500" />
                  {selectedTask ? `Задача ${selectedTask.task_id}` : 'Выберите задачу'}
                </CardTitle>
                {selectedTask && (
                  <p className="text-sm text-slate-500 mt-1">
                    Создана {formatTimestamp(selectedTask.created_at)} • Обновлена {formatTimestamp(selectedTask.updated_at)}
                  </p>
                )}
              </div>
              {selectedTask?.status === 'failed' && (
                <Button variant="destructive" onClick={() => handleRetry(selectedTask.task_id)}>
                  <RotateCw className="w-4 h-4 mr-2" /> Перезапустить как новую
                </Button>
              )}
              {selectedTask?.status !== 'failed' && selectedTask && (
                <Button variant="outline" onClick={() => handleRetry(selectedTask.task_id)}>
                  <RotateCw className="w-4 h-4 mr-2" /> Повторить обработку
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {detailLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-500">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Загрузка деталей...
              </div>
            ) : !selectedTask ? (
              <div className="flex items-center justify-center py-20 text-slate-500">
                Выберите задачу из списка слева, чтобы просмотреть детали.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                    <p className="text-xs text-blue-600 uppercase">Статус</p>
                    <p className="text-lg font-semibold text-blue-700 mt-1">{selectedTask.status}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100">
                    <p className="text-xs text-emerald-600 uppercase">Тип задачи</p>
                    <p className="text-lg font-semibold text-emerald-700 mt-1">{selectedTask.task_type}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100">
                    <p className="text-xs text-purple-600 uppercase">Связанный файл</p>
                    <p className="text-lg font-semibold text-purple-700 mt-1">
                      {selectedTask.params?.file_url || '—'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100">
                    <p className="text-xs text-amber-600 uppercase">Родительская задача</p>
                    <p className="text-lg font-semibold text-amber-700 mt-1">
                      {selectedTask.parent_task_id || '—'}
                    </p>
                  </div>
                </div>

                {selectedTask.result_summary && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-slate-200 rounded-lg bg-white/80">
                      <p className="text-xs uppercase text-slate-500">Строк в выборке</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {selectedTask.result_summary.row_count ?? '—'}
                      </p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-lg bg-white/80">
                      <p className="text-xs uppercase text-slate-500">Столбцов</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {selectedTask.result_summary.column_count ?? '—'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">Предпросмотр данных</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={previewLoading || previewState.mode !== 'page' || previewState.page <= 1}
                        onClick={() => loadPreview({ mode: 'page', page: Math.max(1, previewState.page - 1) })}
                      >
                        Предыдущая
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={previewLoading || previewState.mode !== 'page' || !previewState.hasMore}
                        onClick={() => loadPreview({ mode: 'page', page: previewState.page + 1 })}
                      >
                        Следующая
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={previewLoading}
                        onClick={() => loadPreview({ mode: 'sample' })}
                      >
                        Случайный сэмпл
                      </Button>
                    </div>
                  </div>
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-12 text-slate-500">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Загрузка предпросмотра...
                    </div>
                  ) : !previewData?.length ? (
                    <p className="text-sm text-slate-500">Нет данных для предпросмотра.</p>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <ScrollArea className="max-h-72">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {Object.keys(previewData[0] || {}).map((column) => (
                                <TableHead key={column} className="bg-slate-50 text-slate-600">
                                  {column}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewData.map((row, index) => (
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
                  <h3 className="text-lg font-semibold text-slate-900">Журнал выполнения</h3>
                  <div className="space-y-3">
                    {(selectedTask.log || []).map((entry, index) => (
                      <div key={`${entry.timestamp}-${index}`} className="p-3 border border-slate-200 rounded-lg bg-white/70">
                        <div className="flex items-center justify-between">
                          <Badge className={`${getLevelBadgeClass(entry.level)} text-xs font-medium`}>
                            {entry.level.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-slate-500">{formatTimestamp(entry.timestamp)}</span>
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
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
