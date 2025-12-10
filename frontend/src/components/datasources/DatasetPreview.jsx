import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { Database, FileText, Grid3X3, Rows3, Sparkles } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'

function formatNumber(value) {
  if (value === null || value === undefined) {
    return '—'
  }
  return new Intl.NumberFormat('ru-RU').format(value)
}

function formatDate(value) {
  if (!value) {
    return '—'
  }
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

function ColumnDefinition({ column }) {
  return (
    <li className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <div className="font-medium">{column.name}</div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {column.type ? `Тип: ${column.type}` : 'Тип данных не указан'}
      </p>
      {column.description ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{column.description}</p>
      ) : null}
    </li>
  )
}

ColumnDefinition.propTypes = {
  column: PropTypes.shape({
    name: PropTypes.string,
    type: PropTypes.string,
    description: PropTypes.string,
  }).isRequired,
}

export default function DatasetPreview({ dataset, onClose }) {
  const columns = useMemo(() => dataset?.columns ?? [], [dataset])
  const sample = useMemo(() => dataset?.sample ?? dataset?.sample_data ?? [], [dataset])
  const tags = useMemo(() => dataset?.tags ?? [], [dataset])

  if (!dataset) {
    return null
  }

  return (
    <Dialog open onOpenChange={() => onClose?.()}>
      <DialogContent className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl border-none bg-white/90 p-0 shadow-2xl backdrop-blur dark:bg-slate-900/80">
        <DialogHeader className="border-b border-white/40 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-6 py-5 text-left text-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <Database className="h-5 w-5" aria-hidden />
            </span>
            <span>{dataset.name ?? 'Датасет'}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-200">
            {dataset.description || 'Добавьте описание, чтобы коллеги быстрее понимали контекст данных.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 py-5">
          <div className="space-y-8">
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800/80">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                  <Rows3 className="h-4 w-4" aria-hidden />
                  Строк
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                  {formatNumber(dataset.rows)}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800/80">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                  <Grid3X3 className="h-4 w-4" aria-hidden />
                  Колонок
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                  {formatNumber(columns.length)}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800/80">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Обновлено
                </div>
                <div className="mt-1 text-lg font-medium text-slate-900 dark:text-white">
                  {formatDate(dataset.updatedAt || dataset.updated_at)}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                Основные атрибуты
              </h2>
              {columns.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {columns.map((column) => (
                    <ColumnDefinition key={column.name ?? column.label ?? column.id} column={column} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Структура ещё не описана.</p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Пример данных
                </h2>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {sample.length} строк
                </Badge>
              </div>
              {sample.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-800">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
                      <TableRow>
                        {Object.keys(sample[0]).map((key) => (
                          <TableHead key={key} className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {key}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sample.map((row, index) => (
                        <TableRow key={index}>
                          {Object.keys(sample[0]).map((key) => (
                            <TableCell key={key} className="text-sm text-slate-600 dark:text-slate-200">
                              {row[key] ?? '—'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Нет примеров данных.</p>
              )}
            </section>

            {tags.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Теги
                </h2>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="rounded-full border-indigo-200 text-indigo-600 dark:border-indigo-700 dark:text-indigo-300">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}

            {dataset.owner || dataset.freshness ? (
              <section className="grid gap-3 sm:grid-cols-2">
                {dataset.owner ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <FileText className="h-4 w-4" aria-hidden />
                      Владелец
                    </div>
                    <div className="mt-2 text-base font-medium text-slate-900 dark:text-white">{dataset.owner}</div>
                  </div>
                ) : null}

                {dataset.freshness ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <Sparkles className="h-4 w-4" aria-hidden />
                      Частота обновления
                    </div>
                    <div className="mt-2 text-base font-medium text-slate-900 dark:text-white">{dataset.freshness}</div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </ScrollArea>

        <Separator className="bg-slate-200/80 dark:bg-slate-800" />

        <div className="flex justify-end px-6 py-4">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Закрыть
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

DatasetPreview.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string,
    description: PropTypes.string,
    owner: PropTypes.string,
    rows: PropTypes.number,
    columns: PropTypes.arrayOf(PropTypes.object),
    sample: PropTypes.arrayOf(PropTypes.object),
    sample_data: PropTypes.arrayOf(PropTypes.object),
    tags: PropTypes.arrayOf(PropTypes.string),
    freshness: PropTypes.string,
    updatedAt: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)]),
    updated_at: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)]),
  }),
  onClose: PropTypes.func,
}

DatasetPreview.defaultProps = {
  dataset: null,
  onClose: undefined,
}
