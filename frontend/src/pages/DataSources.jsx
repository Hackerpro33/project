import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, Filter, RefreshCw, Search } from 'lucide-react'

import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dataset } from '@/api/entities'

import DatasetPreview from '../components/datasources/DatasetPreview'

const FALLBACK_DATASETS = [
  {
    id: 'sales-performance',
    name: 'Продажи за 2024 год',
    owner: 'Отдел аналитики',
    type: 'table',
    tags: ['финансы', 'crm', 'продажи'],
    rows: 24560,
    columns: [
      { name: 'date', type: 'date', description: 'Дата сделки' },
      { name: 'region', type: 'string', description: 'Регион продаж' },
      { name: 'manager', type: 'string', description: 'Ответственный менеджер' },
      { name: 'amount', type: 'number', description: 'Сумма сделки' },
      { name: 'probability', type: 'number', description: 'Вероятность закрытия' },
    ],
    updatedAt: '2024-02-12T09:45:00Z',
    description:
      'Объединённый набор данных по продажам с детализацией по регионам, менеджерам и стадиям воронки.',
    sample: [
      { date: '2024-02-10', region: 'Санкт-Петербург', manager: 'Ирина Козлова', amount: 180000, probability: 0.72 },
      { date: '2024-02-11', region: 'Новосибирск', manager: 'Денис Михайлов', amount: 265000, probability: 0.64 },
    ],
    freshness: 'Ежечасно',
  },
  {
    id: 'logistics-delivery',
    name: 'Логистика и доставка',
    owner: 'Операционный отдел',
    type: 'events',
    tags: ['логистика', 'iot'],
    rows: 8034,
    columns: [
      { name: 'shipment_id', type: 'string', description: 'Уникальный идентификатор отправления' },
      { name: 'status', type: 'string', description: 'Текущий статус доставки' },
      { name: 'eta', type: 'datetime', description: 'Ожидаемое время доставки' },
      { name: 'hub', type: 'string', description: 'Промежуточный узел' },
    ],
    updatedAt: '2024-02-11T21:10:00Z',
    description: 'Оперативные данные о доставках и SLA по направлениям.',
    sample: [
      { shipment_id: 'RU-102144', status: 'В пути', eta: '2024-02-13T11:30:00Z', hub: 'Москва' },
      { shipment_id: 'RU-102301', status: 'Ожидает подтверждения', eta: '2024-02-14T08:15:00Z', hub: 'Казань' },
    ],
    freshness: 'Каждые 15 минут',
  },
  {
    id: 'support-center',
    name: 'Обращения в поддержку',
    owner: 'Служба поддержки',
    type: 'tickets',
    tags: ['поддержка', 'nps'],
    rows: 15230,
    columns: [
      { name: 'ticket_id', type: 'string', description: 'Номер обращения' },
      { name: 'channel', type: 'string', description: 'Канал связи' },
      { name: 'created_at', type: 'datetime', description: 'Дата и время создания' },
      { name: 'status', type: 'string', description: 'Текущий статус' },
      { name: 'nps', type: 'number', description: 'Оценка удовлетворенности' },
    ],
    updatedAt: '2024-02-12T06:30:00Z',
    description: 'История обращений клиентов с оценками NPS и SLA.',
    sample: [
      { ticket_id: 'SR-2451', channel: 'Чат', created_at: '2024-02-11T15:05:00Z', status: 'Закрыто', nps: 9 },
      { ticket_id: 'SR-2462', channel: 'Email', created_at: '2024-02-11T16:30:00Z', status: 'В работе', nps: 7 },
    ],
    freshness: 'Каждые 30 минут',
  },
]

const FALLBACK_MESSAGE =
  'Мы показали демонстрационные данные, потому что не удалось получить ответ от сервера. '
  + 'Проверьте подключение или попробуйте позже.'

function buildFacets(datasets) {
  const tags = new Set()
  const types = new Set()
  const owners = new Set()

  datasets.forEach((dataset) => {
    dataset.tags?.forEach((tag) => tags.add(tag))
    if (dataset.type) types.add(dataset.type)
    if (dataset.owner) owners.add(dataset.owner)
  })

  return {
    tags: Array.from(tags).sort(),
    types: Array.from(types).sort(),
    owners: Array.from(owners).sort(),
  }
}

export default function DataSources() {
  const { t } = useTranslation()
  const [datasets, setDatasets] = useState(FALLBACK_DATASETS)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTags, setActiveTags] = useState([])
  const [activeType, setActiveType] = useState('all')
  const [activeOwner, setActiveOwner] = useState('all')
  const [errorMessage, setErrorMessage] = useState('')
  const [previewDataset, setPreviewDataset] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function loadDatasets() {
      setIsLoading(true)
      try {
        const response = await Dataset.search({ limit: 50 })
        if (!isMounted) return

        if (Array.isArray(response?.items) && response.items.length > 0) {
          setDatasets(response.items)
          setErrorMessage('')
        } else {
          setDatasets(FALLBACK_DATASETS)
          setErrorMessage(FALLBACK_MESSAGE)
        }
      } catch (error) {
        console.error('Failed to load datasets', error)
        if (!isMounted) return
        setDatasets(FALLBACK_DATASETS)
        setErrorMessage(FALLBACK_MESSAGE)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadDatasets()

    return () => {
      isMounted = false
    }
  }, [])

  const facets = useMemo(() => buildFacets(datasets), [datasets])

  const filteredDatasets = useMemo(() => {
    return datasets.filter((dataset) => {
      const matchesSearch = searchTerm
        ? dataset.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          dataset.description?.toLowerCase().includes(searchTerm.toLowerCase())
        : true

      const matchesTags = activeTags.length
        ? activeTags.every((tag) => dataset.tags?.includes(tag))
        : true

      const matchesType = activeType === 'all' ? true : dataset.type === activeType
      const matchesOwner = activeOwner === 'all' ? true : dataset.owner === activeOwner

      return matchesSearch && matchesTags && matchesType && matchesOwner
    })
  }, [datasets, searchTerm, activeTags, activeOwner, activeType])

  const totalRows = useMemo(
    () => filteredDatasets.reduce((sum, item) => sum + (item.rows || 0), 0),
    [filteredDatasets],
  )

  const toggleTag = (tag) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }

  const resetFilters = () => {
    setSearchTerm('')
    setActiveTags([])
    setActiveType('all')
    setActiveOwner('all')
  }

  return (
    <PageContainer>
      <div className="space-y-8">
        <header className="flex flex-col gap-6 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur dark:bg-slate-900/60 dark:text-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-lg">
              <Database className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t('navigation.sources')}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Управляйте источниками данных, следите за обновлениями и открывайте превью с метаданными.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-none bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Всего датасетов
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-slate-900 dark:text-white">{filteredDatasets.length}</p>
              </CardContent>
            </Card>

            <Card className="border-none bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-emerald-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Количество строк
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-slate-900 dark:text-white">
                  {new Intl.NumberFormat('ru-RU').format(totalRows)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-none bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Тегов в каталоге
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-slate-900 dark:text-white">{facets.tags.length}</p>
              </CardContent>
            </Card>
          </div>
        </header>

        <section className="space-y-4">
          <Card className="border-none bg-white/70 backdrop-blur dark:bg-slate-900/50">
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Поиск по названию или описанию"
                    className="pl-9"
                    aria-label="Поиск по датасетам"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={resetFilters}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    Сбросить
                  </Button>
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
                    <Filter className="h-4 w-4" aria-hidden />
                    <span>Фильтры</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Тип
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      onClick={() => setActiveType('all')}
                      className={`cursor-pointer px-3 py-1 text-sm transition ${
                        activeType === 'all'
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      Все типы
                    </Badge>
                    {facets.types.map((type) => (
                      <Badge
                        key={type}
                        onClick={() => setActiveType(type)}
                        className={`cursor-pointer px-3 py-1 text-sm transition ${
                          activeType === type
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Владельцы
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      onClick={() => setActiveOwner('all')}
                      className={`cursor-pointer px-3 py-1 text-sm transition ${
                        activeOwner === 'all'
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      Все
                    </Badge>
                    {facets.owners.map((owner) => (
                      <Badge
                        key={owner}
                        onClick={() => setActiveOwner(owner)}
                        className={`cursor-pointer px-3 py-1 text-sm transition ${
                          activeOwner === owner
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {owner}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Теги
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {facets.tags.map((tag) => (
                      <Badge
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`cursor-pointer px-3 py-1 text-sm transition ${
                          activeTags.includes(tag)
                            ? 'bg-indigo-500 text-white shadow-sm dark:bg-indigo-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        #{tag}
                      </Badge>
                    ))}
                    {facets.tags.length === 0 ? (
                      <span className="text-sm text-slate-400">Тегов пока нет</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {errorMessage ? (
            <Alert variant="warning">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-3xl bg-white/50 shadow-inner dark:bg-slate-800/50"
              />
            ))
          ) : filteredDatasets.length === 0 ? (
            <Card className="col-span-full border-dashed bg-white/60 p-8 text-center dark:bg-slate-900/40">
              <CardHeader>
                <CardTitle className="text-lg font-medium text-slate-700 dark:text-slate-200">
                  По заданным условиям ничего не найдено
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-500 dark:text-slate-300">
                <p>Смените фильтры или попробуйте другой поисковый запрос.</p>
                <Button variant="outline" onClick={resetFilters} className="gap-2">
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Сбросить фильтры
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredDatasets.map((dataset) => (
              <Card
                key={dataset.id ?? dataset.name}
                className="flex h-full flex-col justify-between gap-4 rounded-3xl border-none bg-white/70 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:bg-slate-900/60"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {dataset.name}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-300">
                        {dataset.owner || 'Не указан владелец'}
                      </p>
                    </div>
                    <Badge className="bg-indigo-500/10 text-indigo-500 dark:bg-indigo-400/20 dark:text-indigo-200">
                      {dataset.type || 'dataset'}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {dataset.description || 'Описание пока не добавлено.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                      {new Intl.NumberFormat('ru-RU').format(dataset.rows || 0)} строк
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                      {dataset.columns?.length || 0} колонок
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                      Обновлено: {dataset.updatedAt ? new Date(dataset.updatedAt).toLocaleString('ru-RU') : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {dataset.tags?.slice(0, 4).map((tag) => (
                      <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                        #{tag}
                      </Badge>
                    ))}
                    {dataset.tags?.length > 4 ? (
                      <Badge variant="secondary" className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        +{dataset.tags.length - 4}
                      </Badge>
                    ) : null}
                  </div>
                  <Button onClick={() => setPreviewDataset(dataset)} size="sm" className="gap-2">
                    <Database className="h-4 w-4" aria-hidden />
                    Просмотр
                  </Button>
                </div>
              </Card>
            ))
          )}
        </section>
      </div>

      <DatasetPreview dataset={previewDataset} onClose={() => setPreviewDataset(null)} />
    </PageContainer>
  )
}
