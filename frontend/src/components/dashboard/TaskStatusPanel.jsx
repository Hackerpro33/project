import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, AlertCircle, Pause, Play, RefreshCw } from 'lucide-react'

import { listTaskHistory } from '@/api/tasks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

const POLL_INTERVAL = 5000
const MAX_TASKS = 8

const STATUS_COLORS = {
  queued: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200',
  running: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
  finished: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200',
}

function getStatusBadge(status) {
  return STATUS_COLORS[status] || 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200'
}

function formatTime(value, locale = 'ru-RU') {
  if (!value) return '—'
  try {
    const timestamp = typeof value === 'number' ? (value > 1e12 ? value : value * 1000) : value
    const date = value instanceof Date ? value : new Date(timestamp)
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date)
  } catch (error) {
    return value
  }
}

export default function TaskStatusPanel() {
  const { t, i18n } = useTranslation()
  const [tasks, setTasks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLive, setIsLive] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const abortRef = useRef(false)

  const refresh = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner || tasks.length === 0) {
        setIsLoading(true)
      }
      const payload = await listTaskHistory({ limit: 25 })
      const items = Array.isArray(payload?.items) ? payload.items : []
      const trimmed = items
        .filter((item) => item?.status)
        .slice(0, MAX_TASKS)
      setTasks(trimmed)
      setLastUpdated(new Date())
    } catch (error) {
      if (!abortRef.current) {
        console.error('Failed to load task statuses', error)
      }
    } finally {
      setIsLoading(false)
    }
  }, [tasks.length])

  useEffect(() => {
    abortRef.current = false
    refresh(true)
    return () => {
      abortRef.current = true
    }
  }, [refresh])

  useEffect(() => {
    if (!isLive) {
      return undefined
    }
    const id = setInterval(() => {
      refresh(false)
    }, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [isLive, refresh])

  const statusSummary = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        const status = task.status || 'unknown'
        acc[status] = (acc[status] || 0) + 1
        return acc
      },
      {}
    )
  }, [tasks])

  return (
    <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-xl dark:bg-slate-900/60" data-tour="task-status-panel">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <Activity className="h-5 w-5 text-emerald-500" />
            {t('dashboard.taskStatus.title')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => refresh(true)} aria-label={t('dashboard.taskStatus.refresh')}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsLive((prev) => !prev)}
              aria-label={isLive ? t('dashboard.taskStatus.pause') : t('dashboard.taskStatus.resume')}
            >
              {isLive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{t('dashboard.taskStatus.liveLabel', { context: isLive ? 'on' : 'off' })}</span>
          {lastUpdated && (
            <span>{t('dashboard.taskStatus.updatedAt', { time: formatTime(lastUpdated, i18n.language) })}</span>
          )}
        </div>
        {Object.keys(statusSummary).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(statusSummary).map(([status, count]) => (
              <Badge key={status} className={`${getStatusBadge(status)} capitalize`}>
                {t(`dashboard.taskStatus.status.${status}`, { defaultValue: status })}: {count}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-700/50" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            <AlertCircle className="h-4 w-4" />
            {t('dashboard.taskStatus.empty')}
          </div>
        ) : (
          <ScrollArea className="max-h-80 pr-2">
            <ul className="space-y-3">
              {tasks.map((task) => (
                <li
                  key={task.task_id}
                  className="rounded-xl border border-slate-200 bg-white/70 p-3 transition-colors dark:border-slate-700 dark:bg-slate-900/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {task.description || task.task_id}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {task.task_id}
                      </p>
                    </div>
                    <Badge className={`${getStatusBadge(task.status)} capitalize`}>
                      {t(`dashboard.taskStatus.status.${task.status}`, { defaultValue: task.status })}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {task.created_at && (
                      <span>
                        {t('dashboard.taskStatus.startedAt', { time: formatTime(task.created_at, i18n.language) })}
                      </span>
                    )}
                    {task.finished_at && (
                      <span>
                        {t('dashboard.taskStatus.finishedAt', { time: formatTime(task.finished_at, i18n.language) })}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
