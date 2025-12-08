import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/use-toast'
import { getDatasets, getVisualizations } from '@/api/entities'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { CalendarClock, Filter, ListChecks, Share2, Sparkles } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

const STORAGE_KEYS = {
  savedViews: 'collaboration:savedViews',
  notificationPrefs: 'collaboration:notificationPrefs',
  draft: 'collaboration:draft',
}

const DEFAULT_COLUMNS = {
  type: true,
  owner: true,
  folder: true,
  status: true,
  updatedAt: true,
  tags: true,
}

const PERMISSION_OPTIONS = [
  { value: 'view', label: 'Только просмотр' },
  { value: 'comment', label: 'Комментирование' },
  { value: 'edit', label: 'Редактирование' },
]

const PERMISSION_LABELS = PERMISSION_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label
  return acc
}, {})

const ALLOWED_TYPE_FILTERS = new Set(['all', 'dataset', 'visualization'])
const ALLOWED_SORT_OPTIONS = new Set(['updatedAt:desc', 'name:asc', 'name:desc', 'owner:asc'])
const ALLOWED_PERMISSIONS = new Set(PERMISSION_OPTIONS.map((option) => option.value))

const CHANNEL_OPTIONS = [
  { id: 'email', label: 'E-mail' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'webpush', label: 'Web Push' },
]

const DEFAULT_NOTIFICATION_PREFS = {
  finished: ['email'],
  failed: ['email'],
  includeLogs: true,
}

const EMPTY_DRAFT = {
  name: '',
  description: '',
  schedule: 'on_demand',
  tags: '',
  owner: '',
  updatedAt: null,
}

const isBrowser = typeof window !== 'undefined'

function encodeBase64(value) {
  try {
    if (isBrowser && typeof window.btoa === 'function') {
      const bytes = new TextEncoder().encode(value)
      let binary = ''
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte)
      })
      return window.btoa(binary)
    }
    if (typeof globalThis !== 'undefined' && globalThis.Buffer) {
      return globalThis.Buffer.from(value, 'utf-8').toString('base64')
    }
  } catch (error) {
    console.error('Не удалось закодировать данные для шаринга', error)
  }
  return ''
}

function decodeBase64(value) {
  try {
    if (isBrowser && typeof window.atob === 'function') {
      const binary = window.atob(value)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    }
    if (typeof globalThis !== 'undefined' && globalThis.Buffer) {
      return globalThis.Buffer.from(value, 'base64').toString('utf-8')
    }
  } catch (error) {
    console.error('Не удалось раскодировать данные из шаринга', error)
  }
  return ''
}

function encodeSharePayload(config) {
  try {
    return encodeBase64(JSON.stringify(config))
  } catch (error) {
    console.error('Не удалось подготовить payload сохранённого вида', error)
    return ''
  }
}

function decodeSharePayload(token) {
  try {
    const raw = decodeBase64(token)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch (error) {
    console.error('Не удалось прочитать payload сохранённого вида', error)
    return null
  }
}

function parseDate(value) {
  if (!value && value !== 0) return null
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function normalizeItem(entity, type) {
  if (!entity) return null
  const tags = Array.isArray(entity.tags)
    ? entity.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
    : []

  return {
    id: entity.id || `${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: entity.name || 'Без названия',
    description: entity.description || '',
    owner: entity.owner || entity.created_by || 'Неизвестно',
    updatedAt:
      entity.updated_date || entity.updated_at || entity.modified_at || entity.created_at || entity.created_date,
    status: entity.status || entity.pipeline_status || 'неизвестно',
    folder: entity.folder || entity.collection || 'Общие',
    tags,
    raw: entity,
  }
}

function buildShareLink(viewId, permission, payload) {
  const base = isBrowser && window.location ? window.location.origin : 'https://app.local'
  const url = new URL('/collaboration', base)
  if (viewId) {
    url.searchParams.set('view', viewId)
  }
  if (permission) {
    url.searchParams.set('perm', permission)
  }
  if (payload) {
    url.searchParams.set('payload', payload)
  }
  return url.toString()
}

function getShareableConfig(view) {
  return {
    name: view.name,
    filters: view.filters,
    sortBy: view.sortBy,
    columns: view.columns,
    permission: view.permission,
    shareWith: view.shareWith,
  }
}

function sanitizeViewConfig(view = {}) {
  const rawFilters = typeof view.filters === 'object' && view.filters !== null ? view.filters : {}
  const selectedTags = Array.isArray(rawFilters.selectedTags)
    ? Array.from(
        new Set(
          rawFilters.selectedTags
            .filter((tag) => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      )
    : []

  const typeFilter = ALLOWED_TYPE_FILTERS.has(rawFilters.typeFilter) ? rawFilters.typeFilter : 'all'
  const statusFilter =
    typeof rawFilters.statusFilter === 'string' && rawFilters.statusFilter.trim().length > 0
      ? rawFilters.statusFilter
      : 'all'

  const normalizedColumns = { ...DEFAULT_COLUMNS }
  if (view.columns && typeof view.columns === 'object') {
    Object.entries(view.columns).forEach(([columnId, isEnabled]) => {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_COLUMNS, columnId)) {
        normalizedColumns[columnId] = Boolean(isEnabled)
      }
    })
  }

  const sortBy = ALLOWED_SORT_OPTIONS.has(view.sortBy) ? view.sortBy : 'updatedAt:desc'
  const permission = ALLOWED_PERMISSIONS.has(view.permission) ? view.permission : 'view'

  const name = typeof view.name === 'string' && view.name.trim().length > 0 ? view.name.trim().slice(0, 120) : 'Без названия'
  const shareWith = typeof view.shareWith === 'string' ? view.shareWith.trim().slice(0, 160) : ''

  const id = typeof view.id === 'string' && view.id.trim().length > 0 ? view.id.trim() : null
  const updatedAt =
    typeof view.updatedAt === 'string'
      ? view.updatedAt
      : view.updatedAt instanceof Date
      ? view.updatedAt.toISOString()
      : null

  return {
    id,
    name,
    filters: {
      search: typeof rawFilters.search === 'string' ? rawFilters.search : '',
      typeFilter,
      statusFilter,
      selectedTags,
    },
    sortBy,
    columns: normalizedColumns,
    permission,
    shareWith,
    updatedAt,
  }
}

function createShareMetadata(view) {
  const resolvedId = typeof view.id === 'string' && view.id.trim().length > 0 ? view.id.trim() : `view-${Math.random().toString(36).slice(2, 10)}`
  const sharePayload = encodeSharePayload(getShareableConfig({ ...view, id: resolvedId }))
  return {
    sharePayload,
    shareLink: buildShareLink(resolvedId, view.permission, sharePayload),
    id: resolvedId,
  }
}

export default function Collaboration() {
  const { toast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTags, setSelectedTags] = useState([])
  const [sortBy, setSortBy] = useState('updatedAt:desc')
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [selectedIds, setSelectedIds] = useState([])
  const [savedViews, setSavedViews] = useLocalStorage(STORAGE_KEYS.savedViews, [])
  const [activeViewId, setActiveViewId] = useState(null)
  const [sharedView, setSharedView] = useState(null)
  const [lastProcessedPayload, setLastProcessedPayload] = useState(null)
  const [notificationPrefs, setNotificationPrefs] = useLocalStorage(
    STORAGE_KEYS.notificationPrefs,
    DEFAULT_NOTIFICATION_PREFS
  )
  const [draft, setDraft] = useLocalStorage(STORAGE_KEYS.draft, EMPTY_DRAFT)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [viewForm, setViewForm] = useState({ name: '', permission: 'view', shareWith: '' })

  useEffect(() => {
    setSavedViews((current) => {
      let changed = false
      const next = current.map((view) => {
        const sanitized = sanitizeViewConfig(view)
        const metadata = createShareMetadata({ ...sanitized, id: sanitized.id })
        const normalized = { ...sanitized, id: metadata.id }
        const updatedAt = view.updatedAt || normalized.updatedAt || null

        const hasDifference =
          view.id !== normalized.id ||
          view.name !== normalized.name ||
          JSON.stringify(view.filters || {}) !== JSON.stringify(normalized.filters) ||
          view.sortBy !== normalized.sortBy ||
          JSON.stringify(view.columns || {}) !== JSON.stringify(normalized.columns) ||
          view.permission !== normalized.permission ||
          view.shareWith !== normalized.shareWith ||
          view.shareLink !== metadata.shareLink ||
          view.sharePayload !== metadata.sharePayload ||
          view.updatedAt !== updatedAt

        if (!hasDifference) {
          return view
        }

        changed = true
        return { ...normalized, shareLink: metadata.shareLink, sharePayload: metadata.sharePayload, updatedAt }
      })

      return changed ? next : current
    })
  }, [setSavedViews])

  useEffect(() => {
    let ignore = false

    async function load() {
      setIsLoading(true)
      try {
        const [datasets, visualizations] = await Promise.all([getDatasets(), getVisualizations()])
        if (ignore) return
        const normalized = [
          ...(Array.isArray(datasets) ? datasets.map((item) => normalizeItem(item, 'dataset')) : []),
          ...(Array.isArray(visualizations)
            ? visualizations.map((item) => normalizeItem(item, 'visualization'))
            : []),
        ].filter(Boolean)
        setItems(normalized)
      } catch (error) {
        console.error('Не удалось загрузить объекты для совместной работы', error)
        if (!ignore) {
          toast({
            title: 'Ошибка загрузки',
            description: 'Не удалось загрузить список объектов. Попробуйте обновить страницу позже.',
            variant: 'destructive',
          })
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [toast])

  useEffect(() => {
    if (!isBrowser) return
    const params = new URLSearchParams(location.search)
    const payloadParam = params.get('payload')

    if (!payloadParam) {
      if (lastProcessedPayload !== null) {
        setLastProcessedPayload(null)
      }
      return
    }

    if (payloadParam === lastProcessedPayload) {
      return
    }

    const decoded = decodeSharePayload(payloadParam)
    if (!decoded) {
      toast({
        title: 'Не удалось открыть вид',
        description: 'Ссылка повреждена или устарела. Попросите коллег пересохранить вид.',
        variant: 'destructive',
      })
      setLastProcessedPayload(payloadParam)
      params.delete('payload')
      const nextSearch = params.toString()
      navigate(
        { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
        { replace: true }
      )
      return
    }

    const shareId = params.get('view') || decoded.id || `shared-${Math.random().toString(36).slice(2, 8)}`
    const sharePermission = params.get('perm') || decoded.permission || 'view'
    const applied = handleApplyView(
      { ...decoded, id: shareId, permission: sharePermission },
      { markActive: false, showToast: false, updateForm: false }
    )

    if (!applied) {
      setLastProcessedPayload(payloadParam)
      return
    }

    const metadata = createShareMetadata({ ...applied, id: applied.id || shareId })
    const sharedRecord = {
      ...applied,
      id: metadata.id,
      shareLink: metadata.shareLink,
      sharePayload: metadata.sharePayload,
      updatedAt: applied.updatedAt || new Date().toISOString(),
    }

    setSharedView(sharedRecord)
    setViewForm({
      name: sharedRecord.name,
      permission: sharedRecord.permission,
      shareWith: sharedRecord.shareWith,
    })
    setActiveViewId(null)
    toast({
      title: `Применён расшаренный вид «${sharedRecord.name}»`,
      description: 'Фильтры, сортировка и колонки обновлены по ссылке.',
    })
    setLastProcessedPayload(payloadParam)

    params.delete('payload')
    params.set('view', sharedRecord.id)
    params.set('perm', sharedRecord.permission)
    const nextSearch = params.toString()
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
      { replace: true }
    )
  }, [
    handleApplyView,
    lastProcessedPayload,
    location.pathname,
    location.search,
    navigate,
    setActiveViewId,
    setLastProcessedPayload,
    setSharedView,
    setViewForm,
    toast,
  ])

  const availableTags = useMemo(() => {
    const tagSet = new Set()
    items.forEach((item) => {
      item.tags.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [items])

  const availableStatuses = useMemo(() => {
    const statusSet = new Set(items.map((item) => item.status || 'неизвестно'))
    return Array.from(statusSet)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'ru'))
  }, [items])

  const savedViewsWithMetadata = useMemo(
    () =>
      savedViews.map((view) => {
        const sanitized = sanitizeViewConfig(view)
        const metadata = createShareMetadata({ ...sanitized, id: sanitized.id })
        const normalized = { ...sanitized, id: metadata.id }
        return {
          ...normalized,
          shareLink: metadata.shareLink,
          sharePayload: metadata.sharePayload,
          updatedAt: normalized.updatedAt || view.updatedAt || null,
        }
      }),
    [savedViews]
  )

  const applyViewConfiguration = useCallback(
    (view) => {
      const sanitized = sanitizeViewConfig(view)
      setSearch(sanitized.filters.search)
      setTypeFilter(sanitized.filters.typeFilter)
      setStatusFilter(sanitized.filters.statusFilter)
      setSelectedTags(sanitized.filters.selectedTags)
      setSortBy(sanitized.sortBy)
      setColumns(sanitized.columns)
      return sanitized
    },
    [setColumns, setSearch, setSelectedTags, setSortBy, setStatusFilter, setTypeFilter]
  )

  const filteredItems = useMemo(() => {
    let result = [...items]

    if (search.trim()) {
      const query = search.trim().toLowerCase()
      result = result.filter((item) => {
        const haystack = [item.name, item.description, ...item.tags].join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    if (typeFilter !== 'all') {
      result = result.filter((item) => item.type === typeFilter)
    }

    if (statusFilter !== 'all') {
      result = result.filter((item) => (item.status || '').toLowerCase() === statusFilter.toLowerCase())
    }

    if (selectedTags.length > 0) {
      result = result.filter((item) => selectedTags.every((tag) => item.tags.includes(tag)))
    }

    const [key, direction] = sortBy.split(':')
    result.sort((a, b) => {
      const valueA = a[key] || ''
      const valueB = b[key] || ''
      if (valueA === valueB) return 0
      if (direction === 'asc') {
        return valueA > valueB ? 1 : -1
      }
      return valueA < valueB ? 1 : -1
    })

    return result
  }, [items, search, typeFilter, statusFilter, selectedTags, sortBy])

  const activeSelection = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  )

  const isAllSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id))

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredItems.map((item) => item.id))
    }
  }

  function toggleItem(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    )
  }

  function handleTagSelect(value) {
    if (!value) return
    setSelectedTags((current) => (current.includes(value) ? current : [...current, value]))
  }

  function removeTag(tag) {
    setSelectedTags((current) => current.filter((item) => item !== tag))
  }

  function toggleColumn(columnId) {
    setColumns((current) => ({ ...current, [columnId]: !current[columnId] }))
  }

  function resetColumns() {
    setColumns(DEFAULT_COLUMNS)
  }

  function handleSaveView(event) {
    event?.preventDefault()
    if (!viewForm.name.trim()) {
      toast({
        title: 'Введите название вида',
        description: 'Укажите понятное имя, чтобы коллеги могли быстро найти нужную конфигурацию.',
        variant: 'destructive',
      })
      return
    }

    const baseView = {
      id: activeViewId || `view-${Date.now().toString(36)}`,
      name: viewForm.name.trim(),
      filters: {
        search,
        typeFilter,
        statusFilter,
        selectedTags,
      },
      sortBy,
      columns,
      permission: viewForm.permission,
      shareWith: viewForm.shareWith.trim(),
      updatedAt: new Date().toISOString(),
    }

    const sanitized = sanitizeViewConfig(baseView)
    const metadata = createShareMetadata({ ...sanitized, id: sanitized.id || baseView.id })
    const payload = {
      ...sanitized,
      id: metadata.id,
      shareLink: metadata.shareLink,
      sharePayload: metadata.sharePayload,
      updatedAt: sanitized.updatedAt || baseView.updatedAt,
    }

    setSavedViews((current) => {
      const exists = current.some((view) => view.id === payload.id)
      return exists ? current.map((view) => (view.id === payload.id ? payload : view)) : [...current, payload]
    })
    setActiveViewId(payload.id)
    setViewForm({ name: payload.name, permission: payload.permission, shareWith: payload.shareWith })
    setIsViewDialogOpen(false)
    toast({
      title: 'Вид сохранён',
      description: 'Настройки фильтров, сортировки и колонок доступны для повторного использования и шаринга.',
    })
  }

  const handleApplyView = useCallback(
    (view, options = {}) => {
      if (!view) return null
      const sanitized = applyViewConfiguration(view)
      const markActive = options.markActive ?? true
      const showToast = options.showToast ?? true
      const updateForm = options.updateForm ?? true

      if (markActive) {
        if (sanitized.id) {
          setActiveViewId(sanitized.id)
        } else {
          setActiveViewId(null)
        }
        setSharedView(null)
      }

      if (updateForm) {
        setViewForm({ name: sanitized.name, permission: sanitized.permission, shareWith: sanitized.shareWith })
      }

      if (showToast) {
        toast({
          title: `Вид «${sanitized.name}» применён`,
          description: 'Список объектов обновлён в соответствии с сохранёнными параметрами.',
        })
      }

      return sanitized
    },
    [applyViewConfiguration, setActiveViewId, setSharedView, setViewForm, toast]
  )

  function handleDeleteView(id) {
    setSavedViews((current) => current.filter((view) => view.id !== id))
    if (activeViewId === id) {
      setActiveViewId(null)
    }
    if (sharedView?.id === id) {
      setSharedView(null)
    }
    toast({ title: 'Вид удалён', description: 'Вы всегда можете создать новый вариант настроек.' })
  }

  function handleShareView(view) {
    if (!view) return
    const sanitized = sanitizeViewConfig(view)
    const metadata = createShareMetadata({ ...sanitized, id: sanitized.id || view.id })
    const payload = {
      ...sanitized,
      id: metadata.id,
      shareLink: metadata.shareLink,
      sharePayload: metadata.sharePayload,
      updatedAt: view.updatedAt || sanitized.updatedAt || null,
    }

    setSavedViews((current) => {
      if (!current.some((item) => item.id === payload.id)) {
        return current
      }
      return current.map((item) => (item.id === payload.id ? payload : item))
    })

    const linkToShare = payload.shareLink

    navigator.clipboard
      ?.writeText(linkToShare)
      .then(() => {
        toast({ title: 'Ссылка скопирована', description: 'Коллеги получат доступ с указанными правами.' })
      })
      .catch(() => {
        toast({
          title: 'Скопируйте ссылку вручную',
          description: linkToShare,
        })
      })
  }

  function handleAdoptSharedView() {
    if (!sharedView) return
    const newId = `view-${Date.now().toString(36)}`
    const sanitized = sanitizeViewConfig({ ...sharedView, id: newId })
    const metadata = createShareMetadata({ ...sanitized, id: sanitized.id || newId })
    const payload = {
      ...sanitized,
      id: metadata.id,
      shareLink: metadata.shareLink,
      sharePayload: metadata.sharePayload,
      updatedAt: new Date().toISOString(),
    }

    setSavedViews((current) => [...current, payload])
    setActiveViewId(payload.id)
    setSharedView(null)
    setViewForm({ name: payload.name, permission: payload.permission, shareWith: payload.shareWith })
    toast({
      title: 'Вид сохранён',
      description: 'Полученная конфигурация добавлена в список ваших видов.',
    })
  }

  function handleDismissSharedView() {
    setSharedView(null)
  }

  function toggleNotification(channel, event) {
    setNotificationPrefs((current) => {
      const next = new Set(current[event] || [])
      if (next.has(channel)) {
        next.delete(channel)
      } else {
        next.add(channel)
      }
      return { ...current, [event]: Array.from(next) }
    })
  }

  function toggleIncludeLogs() {
    setNotificationPrefs((current) => ({ ...current, includeLogs: !current.includeLogs }))
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value, updatedAt: new Date().toISOString() }))
  }

  function resetDraft() {
    setDraft({ ...EMPTY_DRAFT, updatedAt: new Date().toISOString() })
  }

  function handleBulkAction(action) {
    if (activeSelection.length === 0) {
      toast({ title: 'Выберите объекты', description: 'Чтобы применить массовое действие, отметьте хотя бы один элемент.' })
      return
    }

    if (action === 'delete') {
      setItems((current) => current.filter((item) => !selectedIds.includes(item.id)))
      setSelectedIds([])
      toast({ title: 'Объекты удалены', description: 'Выбранные элементы перемещены в архив.' })
      return
    }

    if (action === 'move') {
      toast({
        title: 'Объекты помечены для переноса',
        description: 'Доступны настройки целевой папки и прав доступа.',
      })
      return
    }

    if (action === 'recalculate') {
      toast({
        title: 'Пересчёт запущен',
        description: 'После завершения вы получите уведомление с ссылкой на лог выполнения.',
      })
    }
  }

  return (
    <PageContainer>
      <div className="space-y-8">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Совместная работа</h1>
              <p className="text-sm text-muted-foreground">
                Управляйте представлениями, тегами и уведомлениями, чтобы команда работала синхронно.
              </p>
            </div>
            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={() => {
                    setActiveViewId(null)
                    setViewForm({ name: '', permission: 'view', shareWith: '' })
                  }}
                >
                  <Sparkles className="h-4 w-4" /> Сохранить вид
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleSaveView} className="space-y-4">
                  <DialogHeader>
                    <DialogTitle>Сохранить текущий вид</DialogTitle>
                    <DialogDescription>
                      В конфигурацию попадут выбранные фильтры, теги, порядок сортировки и набор колонок.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="view-name">Название</Label>
                    <Input
                      id="view-name"
                      value={viewForm.name}
                      onChange={(event) => setViewForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Например, Маркетинговые кампании"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="view-share">Поделиться с</Label>
                    <Input
                      id="view-share"
                      value={viewForm.shareWith}
                      onChange={(event) => setViewForm((current) => ({ ...current, shareWith: event.target.value }))}
                      placeholder="team@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Права доступа</Label>
                    <Select
                      value={viewForm.permission}
                      onValueChange={(value) => setViewForm((current) => ({ ...current, permission: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите права" />
                      </SelectTrigger>
                      <SelectContent>
                        {PERMISSION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit">Сохранить</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        {sharedView && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader className="space-y-2">
              <CardTitle className="text-base">Расшаренный вид применён</CardTitle>
              <CardDescription>
                Вид «{sharedView.name}» открыт с правами {PERMISSION_LABELS[sharedView.permission] || sharedView.permission}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  {PERMISSION_LABELS[sharedView.permission] || sharedView.permission}
                </Badge>
                <Badge variant="outline">
                  Колонок: {Object.values(sharedView.columns || {}).filter(Boolean).length}
                </Badge>
                {(sharedView.filters?.selectedTags ?? []).slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
                {(sharedView.filters?.selectedTags ?? []).length > 3 && <Badge variant="outline">+ ещё</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleAdoptSharedView}>
                  Сохранить к себе
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => handleShareView(sharedView)}>
                  <Share2 className="h-4 w-4" /> Поделиться далее
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismissSharedView}>
                  Скрыть уведомление
                </Button>
              </div>
              {sharedView.shareWith && (
                <p className="text-xs text-muted-foreground">Доступ открыт для: {sharedView.shareWith}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Ссылка: <span className="font-mono break-all">{sharedView.shareLink}</span>
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4 text-muted-foreground" /> Фильтры и подборки
            </CardTitle>
            <CardDescription>
              Комбинируйте типы объектов, статусы и теги. Эти настройки автоматически попадут в сохранённые виды.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Быстрый поиск по названию, описанию или тегам"
              />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Тип объекта" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  <SelectItem value="dataset">Наборы данных</SelectItem>
                  <SelectItem value="visualization">Визуализации</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {availableStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Сортировка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updatedAt:desc">Недавние обновления</SelectItem>
                  <SelectItem value="name:asc">Название (А-Я)</SelectItem>
                  <SelectItem value="name:desc">Название (Я-А)</SelectItem>
                  <SelectItem value="owner:asc">Ответственный</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-2">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </Badge>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    Добавить тег
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56">
                  <ScrollArea className="h-48 pr-3">
                    <div className="flex flex-col gap-2">
                      {availableTags.length === 0 && (
                        <p className="text-sm text-muted-foreground">Теги появятся после загрузки данных.</p>
                      )}
                      {availableTags.map((tag) => (
                        <Button
                          key={tag}
                          variant="ghost"
                          className="justify-start"
                          onClick={() => handleTagSelect(tag)}
                        >
                          {tag}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ListChecks className="h-4 w-4" /> Колонки
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64">
                  <div className="space-y-3">
                    {Object.entries(columns).map(([columnId, isEnabled]) => (
                      <div key={columnId} className="flex items-center gap-3">
                        <Checkbox
                          id={`column-${columnId}`}
                          checked={isEnabled}
                          onCheckedChange={() => toggleColumn(columnId)}
                        />
                        <Label htmlFor={`column-${columnId}`} className="capitalize">
                          {columnId === 'updatedAt' ? 'Обновлено' : columnId === 'owner' ? 'Ответственный' : columnId === 'folder' ? 'Папка' : columnId === 'status' ? 'Статус' : 'Тип'}
                        </Label>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" onClick={resetColumns}>
                      Сбросить колонки
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Сохранённые виды</CardTitle>
            <CardDescription>
              Делитесь ссылками с коллегами и назначайте права доступа: просмотр, комментарии или редактирование.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedViewsWithMetadata.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                У вас пока нет сохранённых видов. Настройте фильтры и нажмите «Сохранить вид», чтобы поделиться ими.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {savedViewsWithMetadata.map((view) => (
                  <Card key={view.id} className="border-muted">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-base font-medium">{view.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {view.shareWith ? `Доступ: ${view.shareWith}` : 'Доступ открыт по ссылке'}
                          </CardDescription>
                        </div>
                        {activeViewId === view.id && <Badge variant="secondary">Активный</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">
                          {PERMISSION_LABELS[view.permission] || view.permission}
                        </Badge>
                        <Badge variant="outline">Колонок: {Object.values(view.columns || {}).filter(Boolean).length}</Badge>
                        {view.filters.selectedTags?.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                        {view.filters.selectedTags?.length > 2 && <Badge variant="outline">+ ещё</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApplyView(view)}>
                          Применить
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActiveViewId(view.id)
                            setViewForm({ name: view.name, permission: view.permission, shareWith: view.shareWith })
                            setIsViewDialogOpen(true)
                          }}
                        >
                          Редактировать
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleShareView(view)} className="gap-2">
                          <Share2 className="h-4 w-4" /> Поделиться
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteView(view.id)}>
                          Удалить
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ссылка: <span className="font-mono break-all">{view.shareLink}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Обновлён: {view.updatedAt ? formatDate(view.updatedAt) : 'нет данных'}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Объекты</CardTitle>
            <CardDescription>
              Выбирайте несколько элементов для массовых операций: удаление, перенос или пересчёт данных.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Checkbox id="select-all" checked={isAllSelected} onCheckedChange={toggleSelectAll} />
                <Label htmlFor="select-all">Выбрать все ({filteredItems.length})</Label>
                {activeSelection.length > 0 && <Badge variant="secondary">Выбрано: {activeSelection.length}</Badge>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('move')}>
                  Переместить
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('recalculate')}>
                  Пересчитать
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleBulkAction('delete')}>
                  Удалить
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[420px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Название</TableHead>
                    {columns.type && <TableHead>Тип</TableHead>}
                    {columns.owner && <TableHead>Ответственный</TableHead>}
                    {columns.folder && <TableHead>Папка</TableHead>}
                    {columns.status && <TableHead>Статус</TableHead>}
                    {columns.updatedAt && <TableHead>Обновлено</TableHead>}
                    {columns.tags && <TableHead>Теги</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        Загрузка объектов...
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        По заданным условиям ничего не найдено. Попробуйте изменить фильтры.
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading &&
                    filteredItems.map((item) => (
                      <TableRow key={item.id} className="align-top">
                        <TableCell className="pt-4">
                          <Checkbox
                            checked={selectedIds.includes(item.id)}
                            onCheckedChange={() => toggleItem(item.id)}
                            aria-label={`Выбрать ${item.name}`}
                          />
                        </TableCell>
                        <TableCell className="space-y-1">
                          <div className="font-medium leading-tight">{item.name}</div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.description || '—'}</p>
                        </TableCell>
                        {columns.type && <TableCell>{item.type === 'dataset' ? 'Набор данных' : 'Визуализация'}</TableCell>}
                        {columns.owner && <TableCell>{item.owner}</TableCell>}
                        {columns.folder && <TableCell>{item.folder}</TableCell>}
                        {columns.status && <TableCell>{item.status}</TableCell>}
                        {columns.updatedAt && (
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <CalendarClock className="h-4 w-4" />
                              {formatDate(item.updatedAt)}
                            </div>
                          </TableCell>
                        )}
                        {columns.tags && (
                          <TableCell className="max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {item.tags.length === 0 && <Badge variant="outline">нет тегов</Badge>}
                              {item.tags.slice(0, 4).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant={selectedTags.includes(tag) ? 'default' : 'secondary'}
                                  className="cursor-pointer"
                                  onClick={() => handleTagSelect(tag)}
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {item.tags.length > 4 && <Badge variant="outline">+ ещё</Badge>}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">Уведомления о задачах</CardTitle>
              <CardDescription>
                Настройте каналы уведомлений для успешных и упавших запусков, чтобы вовремя реагировать на события.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {['finished', 'failed'].map((event) => (
                <div key={event} className="space-y-3 rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">
                        {event === 'finished' ? 'Задача выполнена' : 'Задача упала'}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {event === 'finished'
                          ? 'Получайте подтверждение, что пересчёт завершился успешно.'
                          : 'Моментально узнавайте о проблемах и открывайте лог для диагностики.'}
                      </p>
                    </div>
                    <Badge variant="outline">{notificationPrefs[event]?.length || 0} каналов</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CHANNEL_OPTIONS.map((channel) => (
                      <Button
                        key={channel.id}
                        type="button"
                        variant={notificationPrefs[event]?.includes(channel.id) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleNotification(channel.id, event)}
                      >
                        {channel.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-md border p-4">
                <div>
                  <h3 className="text-sm font-semibold">Прикладывать ссылку на лог</h3>
                  <p className="text-xs text-muted-foreground">
                    В уведомлении появится кнопка «Открыть лог/перезапустить» для быстрого доступа.
                  </p>
                </div>
                <Switch checked={notificationPrefs.includeLogs} onCheckedChange={toggleIncludeLogs} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">Черновик настройки</CardTitle>
              <CardDescription>
                Мы автоматически сохраняем ваши поля, чтобы вы могли вернуться к настройке позже без потери прогресса.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="draft-name">Название</Label>
                <Input
                  id="draft-name"
                  value={draft.name}
                  onChange={(event) => updateDraft('name', event.target.value)}
                  placeholder="Например, Загрузка CRM"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-description">Описание</Label>
                <Textarea
                  id="draft-description"
                  rows={4}
                  value={draft.description}
                  onChange={(event) => updateDraft('description', event.target.value)}
                  placeholder="Коротко опишите, какие данные загружаем и какие фильтры применяем"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="draft-schedule">Расписание</Label>
                  <Select value={draft.schedule} onValueChange={(value) => updateDraft('schedule', value)}>
                    <SelectTrigger id="draft-schedule">
                      <SelectValue placeholder="Выберите расписание" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on_demand">По запросу</SelectItem>
                      <SelectItem value="daily">Ежедневно</SelectItem>
                      <SelectItem value="weekly">Еженедельно</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="draft-owner">Ответственный</Label>
                  <Input
                    id="draft-owner"
                    value={draft.owner}
                    onChange={(event) => updateDraft('owner', event.target.value)}
                    placeholder="Имя или e-mail"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-tags">Теги</Label>
                <Input
                  id="draft-tags"
                  value={draft.tags}
                  onChange={(event) => updateDraft('tags', event.target.value)}
                  placeholder="Введите теги через запятую"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Последнее сохранение:{' '}
                  {draft.updatedAt ? formatDate(draft.updatedAt) : 'изменений пока не было'}
                </span>
                <Button variant="ghost" size="sm" onClick={resetDraft}>
                  Очистить
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
